import { loadConfigV2 } from '../../services/config/manager.js';
import {
  initializeGitHubClientFromConfig,
  getGitHubClient,
} from '../../services/github/client.js';
import { fetchPullRequests } from '../../services/github/pr-fetcher.js';
import { logger } from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../../utils/spinner.js';
import chalk from 'chalk';

export interface PrsCommandOptions {
  state?: 'open' | 'closed' | 'all' | undefined;
  json?: boolean | undefined;
}

export async function prsCommand(options: PrsCommandOptions = {}): Promise<void> {
  const { state = 'open', json = false } = options;

  // Load config
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    return;
  }

  const config = configResult.data;

  // Check GitHub integration
  if (!config.integrations?.github) {
    logger.error('GitHub integration not configured.');
    logger.info('Run `ralphy init` to configure GitHub integration.');
    return;
  }

  const { owner, repo, token } = config.integrations.github;

  // Initialize GitHub client
  const clientResult = initializeGitHubClientFromConfig(token);
  if (!clientResult.success) {
    logger.error(clientResult.error);
    return;
  }

  const client = getGitHubClient();

  // Fetch PRs
  const spinner = createSpinner(`Fetching ${state} pull requests from ${owner}/${repo}...`).start();
  const prsResult = await fetchPullRequests(client, owner, repo, { state });

  if (!prsResult.success) {
    spinner.fail(prsResult.error);
    return;
  }

  const prs = prsResult.data;
  spinner.succeed(`Found ${prs.length} pull request(s)`);

  if (prs.length === 0) {
    logger.info(`No ${state} pull requests found.`);
    return;
  }

  // Filter to PRs with comments (review comments or issue comments)
  const prsWithComments = prs.filter(
    (pr) => pr.reviewCommentCount > 0 || pr.issueCommentCount > 0
  );

  if (json) {
    console.log(JSON.stringify(prsWithComments, null, 2));
    return;
  }

  // Display results
  logger.info('');
  logger.info(`Repository: ${chalk.cyan(`${owner}/${repo}`)}`);
  logger.info('');

  if (prsWithComments.length === 0) {
    logger.info('No pull requests with review comments found.');
    logger.info(`Total PRs checked: ${prs.length}`);
    return;
  }

  logger.info(`PRs with review comments: ${chalk.bold(prsWithComments.length)} of ${prs.length}`);
  logger.info('');

  // Table header
  console.log(
    chalk.dim('PR') +
      '      ' +
      chalk.dim('Title').padEnd(50) +
      chalk.dim('Comments') +
      '  ' +
      chalk.dim('Author')
  );
  console.log(chalk.dim('─'.repeat(90)));

  for (const pr of prsWithComments) {
    const prNumber = chalk.cyan(`#${pr.number.toString().padEnd(5)}`);
    const title = truncate(pr.title, 48).padEnd(50);
    const totalComments = pr.reviewCommentCount + pr.issueCommentCount;
    const commentCount = chalk.yellow(totalComments.toString().padStart(4));
    const author = chalk.dim(`@${pr.author}`);

    console.log(`${prNumber} ${title}${commentCount}     ${author}`);
  }

  logger.info('');
  logger.info(`Use ${logger.formatCommand('ralphy github import <pr-number>')} to import comments as tasks.`);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}
