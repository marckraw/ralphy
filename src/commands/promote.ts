import { loadConfigV2 } from '../services/config/manager.js';
import { createTicketService } from '../services/ticket/factory.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

interface PromoteOptions {
  dryRun?: boolean | undefined;
}

export async function promoteCommand(
  issueId: string,
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
    logger.info(`[Dry run] Would promote issue ${logger.highlight(issueId)}`);
    logger.info(`  Remove label: ${logger.highlight(candidateLabel)}`);
    logger.info(`  Add label: ${logger.highlight(readyLabel)}`);
    return;
  }

  // Promote the issue by swapping labels
  const spinner = createSpinner(`Promoting issue ${issueId}...`).start();
  const result = await ticketService.swapLabels(issueId, candidateLabel, readyLabel);

  if (!result.success) {
    spinner.fail('Failed to promote issue');
    logger.error(result.error);
    process.exit(1);
  }

  const swapResult = result.data;

  if (swapResult.alreadyHadTarget) {
    spinner.warn(`Issue ${logger.highlight(issueId)} already has the "${readyLabel}" label`);
    return;
  }

  spinner.succeed(`Promoted ${logger.highlight(issueId)} to ready`);
  if (swapResult.removed) {
    logger.info(`  Removed: ${logger.highlight(swapResult.removed)}`);
  }
  if (swapResult.added) {
    logger.info(`  Added: ${logger.highlight(swapResult.added)}`);
  }
}
