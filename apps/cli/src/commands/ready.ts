import {
  createTicketService,
  logger,
  getPriorityLabel,
  filterActionableIssues,
  type NormalizedIssue,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';
import { formatIssueTable } from '../utils/table.js';
import { requireConfig, extractTeamAndProjectIds } from '../utils/index.js';

interface ReadyOptions {
  json?: boolean | undefined;
  all?: boolean | undefined;
}

export async function readyCommand(options: ReadyOptions = {}): Promise<void> {
  const { json = false, all = false } = options;

  // Load config (v2 normalized with secrets resolved from env)
  const config = await requireConfig();

  // Create ticket service based on provider
  const ticketService = createTicketService(config);

  // Get teamId and projectId based on provider type
  const { teamId, projectId } = extractTeamAndProjectIds(config);

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

  const allIssues = issuesResult.data;
  const issues = all ? allIssues : filterActionableIssues(allIssues);
  const filteredCount = allIssues.length - issues.length;

  if (all) {
    spinner.succeed(`Found ${issues.length} ready issue(s)`);
  } else if (filteredCount > 0) {
    spinner.succeed(`Found ${issues.length} actionable ready issue(s) (${filteredCount} completed/in-review hidden)`);
  } else {
    spinner.succeed(`Found ${issues.length} ready issue(s)`);
  }

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
