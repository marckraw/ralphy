import { loadConfigV2 } from '../services/config/manager.js';
import { createTicketService, logger, type TicketService } from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';

interface PromoteOptions {
  dryRun?: boolean | undefined;
}

interface PromoteResult {
  issueId: string;
  success: boolean;
  skipped: boolean;
  error?: string;
}

/**
 * Promotes a single issue by swapping labels.
 */
async function promoteSingleIssue(
  issueId: string,
  ticketService: TicketService,
  candidateLabel: string,
  readyLabel: string
): Promise<PromoteResult> {
  const spinner = createSpinner(`Promoting issue ${issueId}...`).start();
  const result = await ticketService.swapLabels(issueId, candidateLabel, readyLabel);

  if (!result.success) {
    spinner.fail(`Failed to promote ${logger.highlight(issueId)}`);
    logger.error(`  ${result.error}`);
    return { issueId, success: false, skipped: false, error: result.error };
  }

  const swapResult = result.data;

  if (swapResult.alreadyHadTarget) {
    spinner.warn(`Issue ${logger.highlight(issueId)} already has the "${readyLabel}" label`);
    return { issueId, success: true, skipped: true };
  }

  spinner.succeed(`Promoted ${logger.highlight(issueId)} to ready`);
  if (swapResult.removed) {
    logger.info(`  Removed: ${logger.highlight(swapResult.removed)}`);
  }
  if (swapResult.added) {
    logger.info(`  Added: ${logger.highlight(swapResult.added)}`);
  }

  return { issueId, success: true, skipped: false };
}

export async function promoteCommand(
  issueIds: string[],
  options: PromoteOptions = {}
): Promise<void> {
  const { dryRun = false } = options;

  // Load config (v2 normalized)
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;
  const candidateLabel = config.labels.candidate;
  const readyLabel = config.labels.ready;

  // Create ticket service based on provider
  const ticketService = createTicketService(config);

  if (dryRun) {
    logger.info(logger.dim('[Dry run mode - no changes will be made]'));
    console.log('');
    for (const issueId of issueIds) {
      logger.info(`Would promote issue ${logger.highlight(issueId)}`);
      logger.info(`  Remove label: ${logger.highlight(candidateLabel)}`);
      logger.info(`  Add label: ${logger.highlight(readyLabel)}`);
      console.log('');
    }
    return;
  }

  // Process each issue
  const results: PromoteResult[] = [];

  for (const issueId of issueIds) {
    const result = await promoteSingleIssue(issueId, ticketService, candidateLabel, readyLabel);
    results.push(result);
  }

  // Show summary if multiple issues were processed
  if (issueIds.length > 1) {
    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log('');
    logger.info('='.repeat(50));
    logger.info('Promotion Summary');
    logger.info('='.repeat(50));
    logger.info(`Total issues: ${issueIds.length}`);
    logger.success(`Promoted: ${successCount}`);
    if (skippedCount > 0) {
      logger.warn(`Already ready: ${skippedCount}`);
    }
    if (failedCount > 0) {
      logger.error(`Failed: ${failedCount}`);
    }

    if (failedCount > 0) {
      process.exit(1);
    }
  } else {
    const singleResult = results[0];
    if (singleResult && !singleResult.success) {
      process.exit(1);
    }
  }
}
