import { initializeClient } from '../services/linear/client.js';
import { promoteToReady } from '../services/linear/issues.js';
import { loadConfig } from '../services/config/manager.js';
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

  // Load config
  const configResult = await loadConfig();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;
  const candidateLabel = config.linear.labels.candidate;
  const readyLabel = config.linear.labels.ready;

  // Get API key from env (override) or config
  const apiKey = process.env['LINEAR_API_KEY'] ?? config.linear.apiKey;

  // Initialize Linear client
  initializeClient(apiKey);

  if (dryRun) {
    logger.info(`[Dry run] Would promote issue ${logger.highlight(issueId)}`);
    logger.info(`  Remove label: ${logger.highlight(candidateLabel)}`);
    logger.info(`  Add label: ${logger.highlight(readyLabel)}`);
    return;
  }

  // Promote the issue
  const spinner = createSpinner(`Promoting issue ${issueId}...`).start();
  const result = await promoteToReady(issueId, candidateLabel, readyLabel);

  if (!result.success) {
    spinner.fail('Failed to promote issue');
    logger.error(result.error);
    process.exit(1);
  }

  spinner.succeed(`Promoted ${logger.highlight(issueId)} to ready`);
  logger.info(`  Removed: ${logger.highlight(candidateLabel)}`);
  logger.info(`  Added: ${logger.highlight(readyLabel)}`);
}
