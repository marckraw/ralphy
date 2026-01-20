import { loadConfigV2 } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  getPriorityLabel,
  isLinearProvider,
  type NormalizedIssue,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';
import { formatIssueTable } from '../utils/table.js';

interface CandidatesOptions {
  json?: boolean | undefined;
}

export async function candidatesCommand(options: CandidatesOptions = {}): Promise<void> {
  const { json = false } = options;

  logger.debug('Starting candidates command');

  // Load config (v2 normalized)
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;
  logger.debug(`Provider type: ${config.provider.type}`);
  logger.debug(`Candidate label: ${config.labels.candidate}`);

  // Create ticket service based on provider
  const ticketService = createTicketService(config);
  logger.debug(`Ticket service created for provider: ${ticketService.provider}`);

  // Get teamId based on provider type
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  logger.debug(`Team/Project ID: ${teamId}`);
  logger.debug(`Project ID filter: ${projectId ?? 'none'}`);

  // Fetch issues
  const spinner = createSpinner('Fetching candidate issues...').start();
  logger.debug('Calling fetchIssuesByLabel...');

  const issuesResult = await ticketService.fetchIssuesByLabel({
    teamId,
    labelName: config.labels.candidate,
    projectId,
  });

  if (!issuesResult.success) {
    spinner.fail('Failed to fetch issues');
    logger.error(issuesResult.error);
    process.exit(1);
  }

  const issues = issuesResult.data;
  spinner.succeed(`Found ${issues.length} candidate issue(s)`);

  if (issues.length === 0) {
    logger.info(`\nNo issues found with the "${logger.highlight(config.labels.candidate)}" label.`);
    logger.info(`Add this label to issues you want to consider for automation.`);
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
