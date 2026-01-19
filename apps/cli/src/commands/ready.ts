import { loadConfigV2 } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  getPriorityLabel,
  isLinearProvider,
  type NormalizedIssue,
} from '@ralphy/shared';
import { createSpinner } from '../utils/spinner.js';
import { formatIssueTable } from '../utils/table.js';

interface ReadyOptions {
  json?: boolean | undefined;
}

export async function readyCommand(options: ReadyOptions = {}): Promise<void> {
  const { json = false } = options;

  // Load config (v2 normalized)
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;

  // Create ticket service based on provider
  const ticketService = createTicketService(config);

  // Get teamId based on provider type
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  // Fetch issues
  const spinner = createSpinner('Fetching ready issues...').start();
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

  const issues = issuesResult.data;
  spinner.succeed(`Found ${issues.length} ready issue(s)`);

  if (issues.length === 0) {
    logger.info(`\nNo issues found with the "${logger.highlight(config.labels.ready)}" label.`);
    logger.info(`Add this label to issues that are ready for automation.`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  // Display table
  console.log('');
  const tableData = issues.map((issue: NormalizedIssue) => ({
    identifier: issue.identifier,
    title: issue.title,
    priority: getPriorityLabel(issue.priority),
    state: issue.state.name,
  }));

  console.log(formatIssueTable(tableData));
}
