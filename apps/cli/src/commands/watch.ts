/**
 * ralphy watch - Continuously monitor for ralph-ready issues and process them.
 *
 * Watches for issues with the ralph-ready label and automatically processes
 * them using the Ralph Wiggum loop. Runs indefinitely until stopped via Ctrl+C.
 */

import { loadAndResolveConfig } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  isLinearProvider,
  isIssueActionable,
  type NormalizedIssue,
  type TicketService,
  type RalphyConfigV2,
} from '@mrck-labs/ralphy-shared';
import { getContextDir, getHistoryDir } from '../services/config/paths.js';
import { isClaudeAvailable } from '../services/claude/executor.js';
import { runSingleIssue, formatDuration, type RunResult } from './run.js';
import { notifySuccess, notifyFailure, notifyWarning } from '../utils/notify.js';
import {
  prioritizeNextTask,
  formatPrioritizationDecision,
  type CompletedTaskContext,
} from '../services/claude/prioritizer.js';
import { createSpinner } from '../utils/spinner.js';

/**
 * Watch command options.
 */
export interface WatchOptions {
  interval?: string;
  maxIterations?: number;
  notify?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  /** Process issues in FIFO order (skip intelligent prioritization) */
  fifo?: boolean;
}

/**
 * Module-level state for graceful shutdown.
 */
let watchStopRequested = false;
let forceStopRequested = false;
let currentlyProcessing = false;
const processedIssueIds = new Set<string>();

/**
 * Session statistics for the summary.
 */
interface SessionStats {
  startTime: number;
  processed: number;
  completed: number;
  maxIterations: number;
  errors: number;
  apiErrors: number;
}

/**
 * Sets up the SIGINT handler for graceful shutdown.
 * First press: graceful stop after current issue.
 * Second press: force exit immediately.
 */
function setupWatchStopHandler(): void {
  const handler = (): void => {
    if (forceStopRequested) {
      process.exit(1);
    }

    if (watchStopRequested) {
      forceStopRequested = true;
      console.log('\n');
      logger.warn('Force stop requested. Exiting immediately...');
      process.exit(1);
    }

    watchStopRequested = true;
    console.log('\n');

    if (currentlyProcessing) {
      logger.warn('Graceful stop requested. Will stop after current issue completes.');
      logger.warn('Press Ctrl+C again to force exit immediately.');
    } else {
      logger.warn('Stop requested. Shutting down...');
    }
  };

  process.on('SIGINT', handler);
}

/**
 * Resets watch state (for testing or re-runs).
 */
function resetWatchState(): void {
  watchStopRequested = false;
  forceStopRequested = false;
  currentlyProcessing = false;
  processedIssueIds.clear();
}

/**
 * Interruptible sleep that checks the stop flag every second.
 */
async function interruptibleSleep(seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    if (watchStopRequested) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * Formats a timestamp for display.
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Displays the watch mode banner.
 */
function displayBanner(
  config: RalphyConfigV2,
  interval: number,
  maxIterations: number
): void {
  const teamName = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  console.log('');
  console.log('========================================');
  console.log('         RALPHY WATCH MODE');
  console.log('========================================');
  console.log(`Provider:    Linear (Team: ${teamName})`);
  console.log(`Label:       ${config.labels.ready}`);
  console.log(`Interval:    ${interval}s | Max iterations: ${maxIterations}`);
  console.log('Press Ctrl+C to stop gracefully.');
  console.log('========================================');
  console.log('');
}

/**
 * Displays the session summary on shutdown.
 */
function displaySummary(stats: SessionStats): void {
  const duration = Date.now() - stats.startTime;

  console.log('');
  console.log('Watch Session Summary');
  console.log('---------------------');
  console.log(`Duration: ${formatDuration(duration)}`);
  console.log(`Processed: ${stats.processed} (${stats.completed} completed, ${stats.maxIterations} max-iter, ${stats.errors} errors)`);
  if (stats.apiErrors > 0) {
    console.log(`API errors encountered: ${stats.apiErrors}`);
  }
  console.log('');
}

/**
 * Fetches issues with the ralph-ready label.
 */
async function fetchReadyIssues(
  ticketService: TicketService,
  config: RalphyConfigV2
): Promise<NormalizedIssue[] | null> {
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
    return null;
  }

  return issuesResult.data;
}

/**
 * Pure function to determine if an issue should be processed.
 * Exported for unit testing.
 *
 * @param issue - The issue to check
 * @param processedIds - Set of already processed issue IDs
 * @returns true if the issue should be processed
 */
export function shouldProcessIssuePure(
  issue: NormalizedIssue,
  processedIds: Set<string>
): boolean {
  // Skip if already processed this session
  if (processedIds.has(issue.id)) {
    return false;
  }
  // Skip if not actionable (already in Done/In Review state)
  return isIssueActionable(issue);
}

/**
 * Filters issues to only those that should be processed.
 */
function filterNewIssues(issues: NormalizedIssue[]): NormalizedIssue[] {
  return issues.filter(issue => shouldProcessIssuePure(issue, processedIssueIds));
}

/**
 * Main watch command implementation.
 */
export async function watchCommand(options: WatchOptions): Promise<void> {
  const {
    notify: shouldNotify = false,
    dryRun = false,
    verbose: isVerbose = false,
    fifo: useFifo = false,
  } = options;

  // Parse interval (default: 120 seconds)
  const interval = options.interval ? parseInt(options.interval, 10) : 120;
  if (isNaN(interval) || interval < 1) {
    logger.error('Invalid interval. Must be a positive number.');
    process.exit(1);
  }

  // Load config (with secrets resolved from env)
  const configResult = await loadAndResolveConfig();
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

  // Create ticket service
  const ticketService = createTicketService(config);
  const contextDir = getContextDir();
  const historyDir = getHistoryDir();

  // Reset and setup state
  resetWatchState();
  setupWatchStopHandler();

  // Display banner
  displayBanner(config, interval, maxIterations);

  if (dryRun) {
    logger.info(logger.dim('[Dry run mode - no changes will be made]'));
    console.log('');
  }

  // Initialize session stats
  const stats: SessionStats = {
    startTime: Date.now(),
    processed: 0,
    completed: 0,
    maxIterations: 0,
    errors: 0,
    apiErrors: 0,
  };

  let consecutiveApiErrors = 0;
  const maxConsecutiveErrors = 3;

  // Main watch loop
  while (!watchStopRequested) {
    // Fetch ready issues
    const issues = await fetchReadyIssues(ticketService, config);

    if (issues === null) {
      // API error
      consecutiveApiErrors++;
      stats.apiErrors++;

      if (consecutiveApiErrors >= maxConsecutiveErrors) {
        const backoff = Math.min(interval * 2, 600); // Max 10 minute backoff
        logger.warn(`${consecutiveApiErrors} consecutive API errors. Applying ${backoff}s backoff.`);
        await interruptibleSleep(backoff);
      } else {
        logger.warn('API error fetching issues. Will retry on next poll.');
        await interruptibleSleep(interval);
      }
      continue;
    }

    // Reset consecutive error counter on successful fetch
    consecutiveApiErrors = 0;

    // Filter to new issues
    const newIssues = filterNewIssues(issues);

    if (newIssues.length === 0) {
      // Idle status - inline update
      const remaining = interval;
      process.stdout.write(`\r[${formatTimestamp()}] Watching... next poll in ${remaining}s`);

      // Wait with countdown updates
      for (let i = remaining - 1; i >= 0; i--) {
        if (watchStopRequested) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.stdout.write(`\r[${formatTimestamp()}] Watching... next poll in ${i}s `);
      }

      // Clear the line for next output
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      continue;
    }

    // Found new issues
    console.log(`\n[${formatTimestamp()}] Found ${newIssues.length} new issue(s)`);

    // Use intelligent prioritization for batches (unless --fifo is set)
    const usePrioritization = newIssues.length > 1 && !useFifo;
    if (usePrioritization) {
      logger.info(logger.dim('Using intelligent prioritization. Use --fifo to process in order.'));
    }

    // Track remaining issues and completed task context for prioritization
    let remainingIssues = [...newIssues];
    let lastCompletedTask: CompletedTaskContext | null = null;
    const totalIssues = newIssues.length;

    // Process issues with prioritization
    while (remainingIssues.length > 0) {
      if (watchStopRequested) {
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
      console.log(`\n[${processedCount}/${totalIssues}] Processing ${issue.identifier}...`);

      if (dryRun) {
        logger.info(logger.dim(`  Would process: ${issue.identifier} - ${issue.title}`));
        logger.info(logger.dim(`  State: ${issue.state.name}`));
        logger.info(logger.dim(`  Priority: ${issue.priority}`));
        processedIssueIds.add(issue.id);
        stats.processed++;
        remainingIssues = remainingIssues.filter(i => i.id !== issue.id);
        continue;
      }

      // Mark as processing for graceful shutdown handling
      currentlyProcessing = true;

      try {
        const startTime = Date.now();
        const result: RunResult = await runSingleIssue(
          issue,
          ticketService,
          config,
          maxIterations,
          contextDir,
          historyDir,
          true, // Add comments
          isVerbose
        );

        // Mark as processed
        processedIssueIds.add(issue.id);
        stats.processed++;

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

        // Update stats based on result
        switch (result.status) {
          case 'completed':
            stats.completed++;
            break;
          case 'max_iterations':
            stats.maxIterations++;
            break;
          case 'error':
            stats.errors++;
            break;
        }

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

        // Display completion message
        const duration = Date.now() - startTime;
        const emoji = result.status === 'completed' ? '✅' : result.status === 'max_iterations' ? '⚠️' : '❌';
        console.log(`${emoji} ${issue.identifier} ${result.status} in ${formatDuration(duration)} (${result.iterations} iterations)`);

      } catch (err) {
        // Single issue failure - log, mark processed, continue
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Failed to process ${issue.identifier}: ${errorMsg}`);
        processedIssueIds.add(issue.id);
        stats.processed++;
        stats.errors++;
        remainingIssues = remainingIssues.filter(i => i.id !== issue.id);
      } finally {
        currentlyProcessing = false;
      }
    }

    // If not stopped, wait for next poll
    if (!watchStopRequested) {
      console.log('');
      await interruptibleSleep(interval);
    }
  }

  // Display session summary
  displaySummary(stats);

  // Reset state for potential future runs in same process
  resetWatchState();
}
