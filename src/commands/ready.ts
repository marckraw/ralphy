import { initializeClient } from '../services/linear/client.js';
import { fetchReadyIssues } from '../services/linear/issues.js';
import { loadConfig } from '../services/config/manager.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatIssueTable } from '../utils/table.js';
import { getPriorityLabel } from '../types/linear.js';

interface ReadyOptions {
  json?: boolean | undefined;
}

export async function readyCommand(options: ReadyOptions = {}): Promise<void> {
  const { json = false } = options;

  // Load config
  const configResult = await loadConfig();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;

  // Get API key from env (override) or config
  const apiKey = process.env['LINEAR_API_KEY'] ?? config.linear.apiKey;

  // Initialize Linear client
  initializeClient(apiKey);

  // Fetch issues
  const spinner = createSpinner('Fetching ready issues...').start();
  const issuesResult = await fetchReadyIssues(
    config.linear.teamId,
    config.linear.labels.ready,
    config.linear.projectId
  );

  if (!issuesResult.success) {
    spinner.fail('Failed to fetch issues');
    logger.error(issuesResult.error);
    process.exit(1);
  }

  const issues = issuesResult.data;
  spinner.succeed(`Found ${issues.length} ready issue(s)`);

  if (issues.length === 0) {
    logger.info(`\nNo issues found with the "${logger.highlight(config.linear.labels.ready)}" label.`);
    logger.info(`Add this label to issues that are ready for automation.`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  // Display table
  console.log('');
  const tableData = issues.map((issue) => ({
    identifier: issue.identifier,
    title: issue.title,
    priority: getPriorityLabel(issue.priority),
    state: issue.state.name,
  }));

  console.log(formatIssueTable(tableData));
}
