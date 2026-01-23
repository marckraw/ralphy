/**
 * ralphy run - Execute the Ralph Wiggum loop for issues.
 *
 * The Ralph Wiggum technique: an infinite loop that repeatedly feeds
 * the same prompt to an AI coding agent. Progress persists in files
 * and git history, not in the LLM's context window.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfigV2 } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  isLinearProvider,
  isIssueActionable,
  type NormalizedIssue,
  type TicketService,
  type RalphyConfigV2,
} from '@mrck-labs/ralphy-shared';
import { getContextDir, getHistoryDir, ensureDir } from '../services/config/paths.js';
import { executeClaude, isClaudeAvailable } from '../services/claude/executor.js';
import { formatToolActivity, formatStats, type ExecutionStats } from '../services/claude/stream-parser.js';
import { analyzeOutput } from '../services/claude/completion.js';
import { buildPrompt, buildInitialProgressContent } from '../services/claude/prompt-builder.js';
import { handleRateLimit } from '../services/claude/rate-limiter.js';
import { createSpinner } from '../utils/spinner.js';
import { notifySuccess, notifyFailure, notifyWarning } from '../utils/notify.js';
import {
  prioritizeNextTask,
  formatPrioritizationDecision,
  type CompletedTaskContext,
} from '../services/claude/prioritizer.js';

/**
 * Emergency stop state for graceful shutdown.
 */
let emergencyStopRequested = false;
let forceStopRequested = false;

/**
 * Sets up emergency stop handler for Ctrl+C.
 * First press: graceful stop after current issue.
 * Second press: force exit immediately.
 */
function setupEmergencyStopHandler(): void {
  const handler = (): void => {
    if (forceStopRequested) {
      // Already requested force stop, just exit
      process.exit(1);
    }

    if (emergencyStopRequested) {
      // Second press - force exit
      forceStopRequested = true;
      console.log('\n');
      logger.warn('Force stop requested. Exiting immediately...');
      process.exit(1);
    }

    // First press - graceful stop
    emergencyStopRequested = true;
    console.log('\n');
    logger.warn('Emergency stop requested. Will stop after current issue completes.');
    logger.warn('Press Ctrl+C again to force exit immediately.');
  };

  process.on('SIGINT', handler);
}

/**
 * Resets emergency stop state (for testing or re-runs).
 */
function resetEmergencyStopState(): void {
  emergencyStopRequested = false;
  forceStopRequested = false;
}

/**
 * Checks if emergency stop was requested.
 */
function isEmergencyStopRequested(): boolean {
  return emergencyStopRequested;
}

/**
 * Valid priority filter values.
 */
export type PriorityFilter = 'urgent' | 'high' | 'medium' | 'low' | 'none';

/**
 * Run command options.
 */
export interface RunOptions {
  maxIterations?: number | undefined;
  autoCommit?: boolean | undefined;
  notify?: boolean | undefined;
  allReady?: boolean | undefined;
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
  /** Process issues in FIFO order (skip intelligent prioritization) */
  fifo?: boolean | undefined;
  /** Filter issues by priority (can specify multiple) */
  priority?: PriorityFilter[] | undefined;
}

/**
 * Run result status.
 */
export type RunStatus = 'completed' | 'max_iterations' | 'error';

/**
 * Result of a run execution.
 */
export interface RunResult {
  issue: NormalizedIssue;
  status: RunStatus;
  iterations: number;
  totalDurationMs: number;
  error?: string;
}

/**
 * History entry for persistence.
 */
interface HistoryEntry {
  identifier: string;
  startedAt: string;
  completedAt: string;
  status: RunStatus;
  iterations: number;
  totalDurationMs: number;
  error?: string | undefined;
}

/**
 * Checks if an issue should be skipped based on its state.
 * Uses the shared isIssueActionable utility - returns true if issue is NOT actionable.
 */
function shouldSkipIssue(issue: NormalizedIssue): boolean {
  return !isIssueActionable(issue);
}

/**
 * Writes progress file for the run.
 */
async function writeProgressFile(
  issue: NormalizedIssue,
  contextDir: string
): Promise<string> {
  await ensureDir(contextDir);

  const progressFilePath = path.join(contextDir, 'progress.md');
  await fs.writeFile(progressFilePath, buildInitialProgressContent(issue), 'utf-8');

  return progressFilePath;
}

/**
 * Saves run history to .ralphy/history/{identifier}/
 */
async function saveHistory(
  historyDir: string,
  entry: HistoryEntry,
  output: string
): Promise<void> {
  const issueDir = path.join(historyDir, entry.identifier);
  await ensureDir(issueDir);

  const runFile = path.join(issueDir, 'run.json');
  const outputFile = path.join(issueDir, 'output.log');

  await fs.writeFile(runFile, JSON.stringify(entry, null, 2), 'utf-8');
  await fs.writeFile(outputFile, output, 'utf-8');
}

/**
 * Executes git commit for completed work.
 */
async function gitCommit(identifier: string, title: string): Promise<boolean> {
  const { execa } = await import('execa');

  try {
    // Check if there are changes to commit
    const statusResult = await execa('git', ['status', '--porcelain'], {
      reject: false,
    });

    if (!statusResult.stdout.trim()) {
      logger.info('No changes to commit.');
      return false;
    }

    // Stage all changes
    await execa('git', ['add', '-A']);

    // Commit with message
    const message = `feat(${identifier}): ${title}\n\nAutomated changes by Ralphy (Ralph Wiggum loop).`;
    await execa('git', ['commit', '-m', message]);

    logger.success(`Changes committed for ${identifier}`);
    return true;
  } catch (err) {
    logger.warn(`Failed to commit: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Exported for use by the watch command.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Builds the start comment for Linear.
 */
function buildStartComment(maxIterations: number): string {
  const timestamp = new Date().toISOString();
  return `## Ralphy Starting Work

**Started at:** ${timestamp}
**Max iterations:** ${maxIterations}

The Ralph Wiggum loop is now processing this issue. Progress will be tracked in git history and reported back here upon completion.

---
_Automated by [Ralphy CLI](https://github.com/ralphy)_`;
}

/**
 * Maximum length for execution log in Linear comments.
 * Linear has a limit, and very long logs are hard to read.
 */
const MAX_LOG_LENGTH = 50000;

/**
 * Truncates log output if it exceeds the maximum length.
 */
function truncateLog(log: string, maxLength: number = MAX_LOG_LENGTH): string {
  if (log.length <= maxLength) {
    return log;
  }

  const truncateNote = `\n\n... [Log truncated - showing last ${maxLength} characters] ...\n\n`;
  return truncateNote + log.slice(-maxLength + truncateNote.length);
}

/**
 * Builds the completion comment for Linear.
 */
function buildCompletionComment(result: RunResult, executionLog?: string): string {
  const timestamp = new Date().toISOString();
  const statusEmoji = result.status === 'completed' ? '✅' : result.status === 'max_iterations' ? '⚠️' : '❌';
  const statusText = result.status === 'completed'
    ? 'Completed successfully'
    : result.status === 'max_iterations'
      ? 'Stopped at max iterations (may need manual review)'
      : `Failed: ${result.error ?? 'Unknown error'}`;

  const statusMessage = result.status === 'completed'
    ? 'Changes have been committed to git. Please review and merge.'
    : result.status === 'max_iterations'
      ? 'The task may not be fully complete. Please review the current state and re-run if needed.'
      : 'Please check the error and retry.';

  // Build the log section if we have execution log
  const logSection = executionLog
    ? `\n<details>\n<summary>📋 Execution Log (click to expand)</summary>\n\n\`\`\`\n${truncateLog(executionLog)}\n\`\`\`\n\n</details>\n`
    : '';

  return `## Ralphy Work ${result.status === 'completed' ? 'Completed' : 'Stopped'}

${statusEmoji} **Status:** ${statusText}
**Iterations:** ${result.iterations}
**Duration:** ${formatDuration(result.totalDurationMs)}
**Finished at:** ${timestamp}

${statusMessage}
${logSection}
---
_Automated by [Ralphy CLI](https://github.com/ralphy)_`;
}

/**
 * Executes the Ralph Wiggum loop for a single issue.
 * Exported for use by the watch command.
 */
export async function runSingleIssue(
  issue: NormalizedIssue,
  ticketService: TicketService,
  config: RalphyConfigV2,
  maxIterations: number,
  contextDir: string,
  historyDir: string,
  addComments: boolean,
  verbose: boolean
): Promise<RunResult> {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Processing: ${issue.identifier} - ${issue.title}`);
  logger.info(`${'='.repeat(60)}\n`);

  // Add start comment to Linear
  if (addComments) {
    const startComment = buildStartComment(maxIterations);
    const commentResult = await ticketService.addComment(issue.identifier, startComment);
    if (!commentResult.success) {
      logger.warn(`Failed to add start comment: ${commentResult.error}`);
    } else {
      logger.info('Added start comment to Linear');
    }
  }

  // Prepare progress file
  const progressFilePath = await writeProgressFile(issue, contextDir);
  logger.info(`Progress file: ${logger.formatPath(progressFilePath)}`);
  logger.info(`Max iterations: ${logger.formatNumber(maxIterations)}`);
  console.log('');

  // Execute the loop
  const startTime = Date.now();
  let iteration = 0;
  let fullOutput = '';
  let status: RunStatus = 'max_iterations';
  let errorMessage: string | undefined;

  logger.info(`Starting Ralph Wiggum loop for ${logger.highlight(issue.identifier)}...\n`);

  while (iteration < maxIterations) {
    iteration++;
    logger.info(`\n--- Iteration ${iteration} of ${maxIterations} ---\n`);

    // Build prompt
    const prompt = buildPrompt({
      issue,
      iteration,
      maxIterations,
      progressFilePath: path.relative(process.cwd(), progressFilePath),
    });

    // Execute Claude with elapsed time indicator
    const iterationStartTime = Date.now();
    let hasOutput = false;
    let iterationStats: ExecutionStats | null = null;

    // Show elapsed time while waiting for Claude (only in non-verbose mode)
    const elapsedInterval = verbose ? null : setInterval(() => {
      if (!hasOutput) {
        const elapsed = Math.round((Date.now() - iterationStartTime) / 1000);
        process.stdout.write(`\r${logger.dim(`Claude working... ${elapsed}s`)}`);
      }
    }, 1000);

    // In verbose mode, show a thinking indicator initially
    if (verbose) {
      console.log(logger.dim('🤖 Claude thinking...'));
    }

    const executeResult = await executeClaude({
      prompt,
      model: config.claude.model,
      timeout: config.claude.timeout,
      verbose,
      onToolActivity: verbose ? (activity) => {
        hasOutput = true;
        console.log(formatToolActivity(activity));
      } : undefined,
      onStats: verbose ? (stats) => {
        iterationStats = stats;
      } : undefined,
      onStdout: verbose ? undefined : (data: string) => {
        if (!hasOutput) {
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          hasOutput = true;
        }
        process.stdout.write(data);
      },
      onStderr: (data: string) => {
        if (!hasOutput && !verbose) {
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          hasOutput = true;
        }
        process.stderr.write(data);
      },
    });

    if (elapsedInterval) {
      clearInterval(elapsedInterval);
    }
    if (!hasOutput && !verbose) {
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }

    if (!executeResult.success) {
      logger.error(executeResult.error);
      status = 'error';
      errorMessage = executeResult.error;
      break;
    }

    const { output, exitCode, durationMs } = executeResult.data;
    fullOutput += `\n\n--- Iteration ${iteration} ---\n${output}`;

    // Show iteration completion with stats
    if (verbose && iterationStats) {
      const statsStr = formatStats(iterationStats);
      logger.info(`\n✅ Iteration ${iteration} complete (${statsStr})`);
    } else {
      logger.info(`\nIteration ${iteration} completed in ${Math.round(durationMs / 1000)}s (exit code: ${exitCode})`);
    }

    // Analyze output
    const analysis = analyzeOutput(output);

    // Check for completion
    if (analysis.isComplete) {
      logger.success(`\nTask completed! Claude signaled completion.`);
      status = 'completed';
      break;
    }

    // Check for rate limit
    if (analysis.isRateLimited) {
      logger.warn('Rate limit detected.');
      await handleRateLimit(output);
      iteration--;
      continue;
    }

    // Check for non-zero exit code
    if (exitCode !== 0) {
      logger.warn(`Claude exited with code ${exitCode}`);
    }
  }

  const totalDurationMs = Date.now() - startTime;

  const result: RunResult = {
    issue,
    status,
    iterations: iteration,
    totalDurationMs,
    ...(errorMessage !== undefined && { error: errorMessage }),
  };

  // Log summary for this issue
  logger.info(`\nIssue ${issue.identifier} Summary:`);
  logger.info(`  Status: ${status}`);
  logger.info(`  Iterations: ${iteration}`);
  logger.info(`  Duration: ${formatDuration(totalDurationMs)}`);

  // Save history
  const historyEntry: HistoryEntry = {
    identifier: issue.identifier,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    status,
    iterations: iteration,
    totalDurationMs,
    error: errorMessage,
  };

  try {
    await saveHistory(historyDir, historyEntry, fullOutput);
    logger.info(`  History: ${logger.formatPath(path.join(historyDir, issue.identifier))}`);
  } catch (err) {
    logger.warn(`Failed to save history: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Git commit the changes
  logger.info('\nCommitting changes to git...');
  await gitCommit(issue.identifier, issue.title);

  // Add completion comment to Linear (includes execution log)
  if (addComments) {
    const completionComment = buildCompletionComment(result, fullOutput);
    const commentResult = await ticketService.addComment(issue.identifier, completionComment);
    if (!commentResult.success) {
      logger.warn(`Failed to add completion comment: ${commentResult.error}`);
    } else {
      logger.info('Added completion comment to Linear');
    }
  }

  // Move completed issues to "In Review" status
  if (status === 'completed') {
    logger.info('Moving issue to "In Review" status...');
    const stateResult = await ticketService.updateIssueState(issue.identifier, 'In Review');
    if (!stateResult.success) {
      logger.warn(`Failed to update issue state: ${stateResult.error}`);
    } else {
      logger.info('Issue moved to "In Review"');
    }
  }

  return result;
}

/**
 * Main run command implementation.
 *
 * @param issueIdentifier - The issue identifier (e.g., PROJ-42) or undefined for --all-ready
 * @param options - Run options
 */
export async function runCommand(
  issueIdentifier: string | undefined,
  options: RunOptions = {}
): Promise<void> {
  const {
    autoCommit: shouldAutoCommit = false,
    notify: shouldNotify = false,
    allReady = false,
    dryRun = false,
    verbose: isVerbose = false,
    fifo: useFifo = false,
    priority: priorityFilter,
  } = options;

  // Validate arguments
  if (!issueIdentifier && !allReady) {
    logger.error('Please provide an issue identifier or use --all-ready');
    process.exit(1);
  }

  // Load config (v2 normalized)
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;
  const maxIterations = options.maxIterations ?? config.claude.maxIterations;

  // Check Claude is available
  const claudeAvailable = await isClaudeAvailable();
  if (!claudeAvailable) {
    logger.error('Claude CLI is not available. Please install it first: https://claude.ai/code');
    process.exit(1);
  }

  // Create ticket service based on provider
  const ticketService = createTicketService(config);
  const contextDir = getContextDir();
  const historyDir = getHistoryDir();

  // Determine issues to process
  let issuesToProcess: NormalizedIssue[] = [];

  if (allReady) {
    // Fetch all issues with ralph-ready label
    const spinner = createSpinner('Fetching ready issues...').start();

    const teamId = isLinearProvider(config.provider)
      ? config.provider.config.teamId
      : config.provider.config.projectId;

    const projectId = isLinearProvider(config.provider)
      ? config.provider.config.projectId
      : undefined;

    const issuesResult = await ticketService.fetchIssuesByLabel({
      teamId,
      labelName: config.labels.ready,
      projectId,
    });

    if (!issuesResult.success) {
      spinner.fail('Failed to fetch issues');
      logger.error(issuesResult.error);
      process.exit(1);
    }

    const allIssues = issuesResult.data;
    spinner.succeed(`Found ${allIssues.length} issue(s) with "${config.labels.ready}" label`);

    // Filter out issues that are already done or in review
    const skippedIssues = allIssues.filter(shouldSkipIssue);
    issuesToProcess = allIssues.filter(issue => !shouldSkipIssue(issue));

    if (skippedIssues.length > 0) {
      logger.info(`\nSkipping ${skippedIssues.length} issue(s) already in Done/Review state:`);
      for (const issue of skippedIssues) {
        logger.info(logger.dim(`  - ${issue.identifier}: ${issue.title} (${issue.state.name})`));
      }
    }

    // Filter by priority if specified
    if (priorityFilter && priorityFilter.length > 0) {
      const filteredOutByPriority = issuesToProcess.filter(
        issue => !priorityFilter.includes(issue.priority)
      );
      issuesToProcess = issuesToProcess.filter(
        issue => priorityFilter.includes(issue.priority)
      );

      if (filteredOutByPriority.length > 0) {
        logger.info(`\nFiltering by priority: ${priorityFilter.join(', ')}`);
        logger.info(`Skipping ${filteredOutByPriority.length} issue(s) with different priority:`);
        for (const issue of filteredOutByPriority) {
          logger.info(logger.dim(`  - ${issue.identifier}: ${issue.title} (${issue.priority})`));
        }
      }
    }

    if (issuesToProcess.length === 0) {
      logger.info(`\nNo actionable issues found with the "${logger.highlight(config.labels.ready)}" label.`);
      if (priorityFilter && priorityFilter.length > 0) {
        logger.info(`No issues match the priority filter: ${priorityFilter.join(', ')}`);
      } else {
        logger.info('All issues are already Done or In Review.');
      }
      return;
    }

    // Display queue
    logger.info('\nIssue queue:');
    for (let i = 0; i < issuesToProcess.length; i++) {
      const issue = issuesToProcess[i];
      if (issue) {
        logger.info(`  ${i + 1}. ${issue.identifier}: ${issue.title}`);
      }
    }
    console.log('');
  } else if (issueIdentifier) {
    // Fetch single issue
    const spinner = createSpinner(`Fetching issue ${issueIdentifier}...`).start();
    const issueResult = await ticketService.fetchIssueById(issueIdentifier);

    if (!issueResult.success) {
      spinner.fail('Failed to fetch issue');
      logger.error(issueResult.error);
      process.exit(1);
    }

    issuesToProcess = [issueResult.data];
    spinner.succeed(`Found issue: ${issueResult.data.identifier} - ${issueResult.data.title}`);
  }

  // Dry run mode - just show what would be processed
  if (dryRun) {
    console.log('');
    logger.info(logger.dim('[Dry run mode - no changes will be made]'));
    console.log('');
    logger.info('='.repeat(60));
    logger.info('Ralph Wiggum Dry Run Preview');
    logger.info('='.repeat(60));
    logger.info(`Issues to process: ${issuesToProcess.length}`);
    logger.info(`Max iterations per issue: ${maxIterations}`);
    logger.info(`Auto-commit: ${shouldAutoCommit || allReady ? 'Yes' : 'No'}`);
    logger.info(`Notifications: ${shouldNotify ? 'Yes' : 'No'}`);
    logger.info(`Linear comments: ${allReady || shouldAutoCommit ? 'Yes' : 'No'}`);
    console.log('');

    logger.info('Issue queue:');
    for (let i = 0; i < issuesToProcess.length; i++) {
      const issue = issuesToProcess[i];
      if (!issue) continue;

      console.log('');
      logger.info(`${i + 1}. ${logger.highlight(issue.identifier)}: ${issue.title}`);
      logger.info(`   Priority: ${issue.priority}`);
      logger.info(`   State: ${issue.state.name}`);
      logger.info(`   Labels: ${issue.labels.map(l => l.name).join(', ') || 'None'}`);
      if (issue.url) {
        logger.info(`   URL: ${logger.dim(issue.url)}`);
      }
      if (issue.description) {
        const preview = issue.description.slice(0, 150).replace(/\n/g, ' ');
        logger.info(`   Description: ${logger.dim(preview + (issue.description.length > 150 ? '...' : ''))}`);
      }
    }

    console.log('');
    logger.info('='.repeat(60));
    logger.info(`To run: ralphy run ${allReady ? '--all-ready' : issuesToProcess[0]?.identifier ?? ''}`);
    logger.info('='.repeat(60));
    return;
  }

  // Process all issues
  const results: RunResult[] = [];
  const batchStartTime = Date.now();

  // Set up emergency stop handler for batch mode
  if (allReady && issuesToProcess.length > 1) {
    resetEmergencyStopState();
    setupEmergencyStopHandler();
    logger.info(logger.dim('Tip: Press Ctrl+C to stop after current issue, twice to force exit.\n'));
  }

  // Use intelligent prioritization for batch mode (unless --fifo is set)
  const usePrioritization = allReady && issuesToProcess.length > 1 && !useFifo;
  if (usePrioritization) {
    logger.info(logger.dim('Using intelligent prioritization. Use --fifo to process in order.\n'));
  }

  // Track remaining issues and completed task context for prioritization
  let remainingIssues = [...issuesToProcess];
  let lastCompletedTask: CompletedTaskContext | null = null;
  const totalIssues = issuesToProcess.length;

  while (remainingIssues.length > 0) {
    // Check for emergency stop before starting a new issue
    if (isEmergencyStopRequested()) {
      logger.warn(`\nEmergency stop: Skipping remaining ${remainingIssues.length} issue(s).`);
      break;
    }

    let issue: NormalizedIssue;

    // Determine which issue to process next
    if (usePrioritization && remainingIssues.length > 1) {
      // Use intelligent prioritization
      const prioritizeSpinner = createSpinner('Analyzing tasks for optimal priority...').start();
      const prioritizeResult = await prioritizeNextTask(
        remainingIssues,
        lastCompletedTask,
        config,
        { verbose: isVerbose }
      );
      prioritizeSpinner.stop();

      if (prioritizeResult.success) {
        issue = prioritizeResult.selectedIssue;
        logger.info(`\n${formatPrioritizationDecision(prioritizeResult.decision)}`);
      } else {
        // Fallback to FIFO
        issue = prioritizeResult.fallbackIssue;
        logger.warn(`Prioritization failed: ${prioritizeResult.error}`);
        logger.info(`Falling back to first issue: ${issue.identifier}`);
      }
    } else {
      // FIFO mode or single issue - pick first
      issue = remainingIssues[0]!;
    }

    const processedCount = totalIssues - remainingIssues.length + 1;

    if (allReady && totalIssues > 1) {
      logger.info(`\n${'#'.repeat(60)}`);
      logger.info(`# Issue ${processedCount} of ${totalIssues}`);
      logger.info(`${'#'.repeat(60)}`);
    }

    const result = await runSingleIssue(
      issue,
      ticketService,
      config,
      maxIterations,
      contextDir,
      historyDir,
      true, // Always add comments to Linear issues
      isVerbose
    );

    results.push(result);

    // Update completed task context for next prioritization
    lastCompletedTask = {
      identifier: issue.identifier,
      title: issue.title,
      status: result.status,
      durationMs: result.totalDurationMs,
      iterations: result.iterations,
    };

    // Remove processed issue from remaining list
    remainingIssues = remainingIssues.filter(i => i.id !== issue.id);

    // Send notification if requested
    if (shouldNotify) {
      switch (result.status) {
        case 'completed':
          await notifySuccess(issue.identifier);
          break;
        case 'max_iterations':
          await notifyWarning(issue.identifier, `Stopped after ${maxIterations} iterations`);
          break;
        case 'error':
          await notifyFailure(issue.identifier, result.error);
          break;
      }
    }
  }

  // Final batch summary
  if (allReady && issuesToProcess.length > 1) {
    const batchDuration = Date.now() - batchStartTime;
    const completed = results.filter(r => r.status === 'completed').length;
    const maxIter = results.filter(r => r.status === 'max_iterations').length;
    const errors = results.filter(r => r.status === 'error').length;
    const skippedByStop = issuesToProcess.length - results.length;
    const stoppedEarly = isEmergencyStopRequested();

    console.log('\n');
    logger.info(`${'='.repeat(60)}`);
    logger.info(`Ralph Wiggum Batch Summary${stoppedEarly ? ' (Emergency Stop)' : ''}`);
    logger.info(`${'='.repeat(60)}`);
    logger.info(`Total issues processed: ${results.length}${skippedByStop > 0 ? ` (${skippedByStop} skipped due to emergency stop)` : ''}`);
    logger.success(`Completed: ${completed}`);
    if (maxIter > 0) logger.warn(`Max iterations reached: ${maxIter}`);
    if (errors > 0) logger.error(`Errors: ${errors}`);
    if (skippedByStop > 0) logger.warn(`Skipped (emergency stop): ${skippedByStop}`);
    logger.info(`Total duration: ${formatDuration(batchDuration)}`);
    logger.info(`Total iterations: ${results.reduce((sum, r) => sum + r.iterations, 0)}`);

    console.log('\nResults by issue:');
    for (const result of results) {
      const emoji = result.status === 'completed' ? '✅' : result.status === 'max_iterations' ? '⚠️' : '❌';
      logger.info(`  ${emoji} ${result.issue.identifier}: ${result.status} (${result.iterations} iterations, ${formatDuration(result.totalDurationMs)})`);
    }

    // Reset emergency stop state for potential future runs in same process
    resetEmergencyStopState();

    if (errors > 0) {
      process.exit(1);
    }
  } else {
    // Single issue mode - use original exit behavior
    const result = results[0];
    if (!result) {
      process.exit(1);
    }

    if (result.status === 'completed') {
      logger.success('\nRalphy run completed successfully!');
      process.exit(0);
    } else if (result.status === 'max_iterations') {
      logger.warn(`\nMax iterations (${maxIterations}) reached. Task may not be complete.`);
      process.exit(0);
    } else {
      logger.error(`\nRalphy run failed: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }
  }
}
