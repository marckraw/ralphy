/**
 * ralphy run - Execute the Ralph Wiggum loop for a Linear issue.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeClient } from '../services/linear/client.js';
import { fetchIssueById } from '../services/linear/issues.js';
import { loadConfig } from '../services/config/manager.js';
import { getContextDir, getHistoryDir, ensureDir } from '../services/config/paths.js';
import { executeClaude, isClaudeAvailable } from '../services/claude/executor.js';
import { analyzeOutput } from '../services/claude/completion.js';
import { buildPrompt, buildInitialProgressContent } from '../services/claude/prompt-builder.js';
import { handleRateLimit } from '../services/claude/rate-limiter.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { notifySuccess, notifyFailure, notifyWarning } from '../utils/notify.js';
import type { LinearIssue } from '../types/linear.js';

/**
 * Run command options.
 */
export interface RunOptions {
  maxIterations?: number | undefined;
  autoCommit?: boolean | undefined;
  notify?: boolean | undefined;
}

/**
 * Run result status.
 */
export type RunStatus = 'completed' | 'max_iterations' | 'error';

/**
 * Result of a run execution.
 */
export interface RunResult {
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
 * Writes progress file for the run.
 */
async function writeProgressFile(
  issue: LinearIssue,
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
 * Executes git commit if auto-commit is enabled.
 */
async function autoCommit(identifier: string): Promise<void> {
  const { execa } = await import('execa');

  try {
    // Check if there are changes to commit
    const statusResult = await execa('git', ['status', '--porcelain'], {
      reject: false,
    });

    if (!statusResult.stdout.trim()) {
      logger.info('No changes to commit.');
      return;
    }

    // Stage all changes
    await execa('git', ['add', '-A']);

    // Commit with message
    const message = `feat(${identifier}): Automated changes by Ralphy\n\nTask completed via ralphy run command.`;
    await execa('git', ['commit', '-m', message]);

    logger.success(`Changes committed for ${identifier}`);
  } catch (err) {
    logger.warn(`Failed to auto-commit: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Main run command implementation.
 *
 * @param issueIdentifier - The Linear issue identifier (e.g., PROJ-42)
 * @param options - Run options
 */
export async function runCommand(
  issueIdentifier: string,
  options: RunOptions = {}
): Promise<void> {
  const { autoCommit: shouldAutoCommit = false, notify: shouldNotify = false } = options;

  // Load config
  const configResult = await loadConfig();
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

  // Get API key from env (override) or config
  const apiKey = process.env['LINEAR_API_KEY'] ?? config.linear.apiKey;

  // Initialize Linear client
  initializeClient(apiKey);

  // Fetch the issue
  const spinner = createSpinner(`Fetching issue ${issueIdentifier}...`).start();
  const issueResult = await fetchIssueById(issueIdentifier);

  if (!issueResult.success) {
    spinner.fail('Failed to fetch issue');
    logger.error(issueResult.error);
    process.exit(1);
  }

  const issue = issueResult.data;
  spinner.succeed(`Found issue: ${issue.identifier} - ${issue.title}`);

  // Prepare context files
  const contextDir = getContextDir();
  const historyDir = getHistoryDir();
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
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`Iteration ${iteration} of ${maxIterations}`);
    logger.info(`${'='.repeat(60)}\n`);

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

    // Show elapsed time while waiting for Claude
    const elapsedInterval = setInterval(() => {
      if (!hasOutput) {
        const elapsed = Math.round((Date.now() - iterationStartTime) / 1000);
        process.stdout.write(`\r${logger.dim(`⏳ Claude working... ${elapsed}s`)}`);
      }
    }, 1000);

    const executeResult = await executeClaude({
      prompt,
      model: config.claude.model,
      timeout: config.claude.timeout,
      onStdout: (data) => {
        if (!hasOutput) {
          // Clear the elapsed time line on first output
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          hasOutput = true;
        }
        process.stdout.write(data);
      },
      onStderr: (data) => {
        if (!hasOutput) {
          process.stdout.write('\r' + ' '.repeat(40) + '\r');
          hasOutput = true;
        }
        process.stderr.write(data);
      },
    });

    clearInterval(elapsedInterval);
    if (!hasOutput) {
      // Clear elapsed line if no output was produced
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

    logger.info(`\nIteration ${iteration} completed in ${Math.round(durationMs / 1000)}s (exit code: ${exitCode})`);

    // Analyze output
    const analysis = analyzeOutput(output);

    // Check for completion
    if (analysis.isComplete) {
      logger.success(`\n✓ Task completed! Claude signaled completion.`);
      status = 'completed';
      break;
    }

    // Check for rate limit
    if (analysis.isRateLimited) {
      logger.warn('Rate limit detected.');
      await handleRateLimit(output);
      // Don't count this iteration
      iteration--;
      continue;
    }

    // Check for non-zero exit code
    if (exitCode !== 0) {
      logger.warn(`Claude exited with code ${exitCode}`);
      // Continue to next iteration - Claude might recover
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // Log final status
  console.log('\n');
  logger.info(`${'='.repeat(60)}`);
  logger.info('Run Summary');
  logger.info(`${'='.repeat(60)}`);
  logger.info(`Issue: ${issue.identifier} - ${issue.title}`);
  logger.info(`Status: ${status}`);
  logger.info(`Iterations: ${iteration}`);
  logger.info(`Total time: ${Math.round(totalDurationMs / 1000)}s`);

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
    logger.info(`History saved to: ${logger.formatPath(path.join(historyDir, issue.identifier))}`);
  } catch (err) {
    logger.warn(`Failed to save history: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Auto-commit if requested and successful
  if (shouldAutoCommit && status === 'completed') {
    logger.info('\nAuto-committing changes...');
    await autoCommit(issue.identifier);
  }

  // Send notification if requested
  if (shouldNotify) {
    switch (status) {
      case 'completed':
        await notifySuccess(issue.identifier);
        break;
      case 'max_iterations':
        await notifyWarning(issue.identifier, `Stopped after ${maxIterations} iterations`);
        break;
      case 'error':
        await notifyFailure(issue.identifier, errorMessage);
        break;
    }
  }

  // Exit with appropriate code
  if (status === 'completed') {
    logger.success('\nRalphy run completed successfully!');
    process.exit(0);
  } else if (status === 'max_iterations') {
    logger.warn(`\nMax iterations (${maxIterations}) reached. Task may not be complete.`);
    process.exit(0);
  } else {
    logger.error(`\nRalphy run failed: ${errorMessage ?? 'Unknown error'}`);
    process.exit(1);
  }
}
