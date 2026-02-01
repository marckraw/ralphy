import { execa } from 'execa';
import {
  initializeGitHubClientFromConfig,
  getGitHubClient,
} from '../../services/github/client.js';
import {
  fetchPullRequestWithComments,
  filterActionableComments,
} from '../../services/github/pr-fetcher.js';
import type { PRComment, ParsedPRTask, PRDetails } from '../../services/github/types.js';
import {
  buildPRCommentParserPrompt,
  buildPRParserClaudeArgs,
  parsePRTasksOutput,
  isPRParsingComplete,
  formatTaskDescription,
} from '../../services/claude/pr-comment-parser.js';
import {
  createTicketService,
  logger,
  type CreatedIssue,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../../utils/spinner.js';
import {
  requireConfig,
  requireClaude,
  requireGitHubIntegration,
  extractTeamAndProjectIds,
  displayDryRunNotice,
  displaySummary,
} from '../../utils/index.js';
import chalk from 'chalk';

export interface ImportCommandOptions {
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
  debug?: boolean | undefined;
  includeIssueComments?: boolean | undefined;
}

export async function importCommand(
  prNumber: string,
  options: ImportCommandOptions = {}
): Promise<void> {
  const { dryRun = false, verbose = false, debug: debugMode = false, includeIssueComments = true } = options;

  if (debugMode) {
    logger.debug(`Import options: ${JSON.stringify(options)}`);
  }

  const prNum = parseInt(prNumber, 10);
  if (isNaN(prNum) || prNum <= 0) {
    logger.error(`Invalid PR number: ${prNumber}`);
    return;
  }

  // Load config (with secrets resolved from env)
  const config = await requireConfig();

  // Check GitHub integration
  const github = requireGitHubIntegration(config);
  const { owner, repo, token } = github;

  // Check Claude is available
  await requireClaude();

  if (dryRun) {
    displayDryRunNotice();
  }

  // Initialize GitHub client
  const clientResult = initializeGitHubClientFromConfig(token);
  if (!clientResult.success) {
    logger.error(clientResult.error);
    return;
  }

  const client = getGitHubClient();

  // Fetch PR with comments
  const fetchSpinner = createSpinner(`Fetching PR #${prNum} from ${owner}/${repo}...`).start();
  const prResult = await fetchPullRequestWithComments(client, owner, repo, prNum);

  if (!prResult.success) {
    fetchSpinner.fail(prResult.error);
    return;
  }

  const { pr, reviewComments, issueComments } = prResult.data;
  fetchSpinner.succeed(`Fetched PR #${prNum}: ${pr.title}`);

  // Combine and filter comments
  let allComments = [...reviewComments];
  if (includeIssueComments) {
    allComments = [...allComments, ...issueComments];
  }

  const actionableComments = filterActionableComments(allComments);

  logger.info('');
  logger.info(`PR: ${chalk.cyan(`#${pr.number}`)} ${pr.title}`);
  logger.info(`URL: ${chalk.dim(pr.url)}`);
  logger.info(`Author: ${chalk.dim(`@${pr.author}`)}`);
  logger.info(`Branch: ${chalk.dim(`${pr.headBranch} → ${pr.baseBranch}`)}`);
  logger.info('');
  logger.info(`Review comments: ${reviewComments.length}`);
  logger.info(`Issue comments: ${issueComments.length}`);
  logger.info(`Actionable comments: ${chalk.yellow(actionableComments.length.toString())}`);

  if (actionableComments.length === 0) {
    logger.info('');
    logger.info('No actionable comments found in this PR.');
    return;
  }

  // Parse comments with Claude
  logger.info('');
  const tasks = await parseCommentsWithClaude(
    pr,
    actionableComments,
    config.claude.model,
    config.claude.timeout,
    verbose,
    debugMode
  );

  if (!tasks || tasks.length === 0) {
    logger.warn('No tasks could be extracted from the comments.');
    return;
  }

  // Preview tasks
  logger.info('');
  logger.info('='.repeat(60));
  logger.info('Extracted Tasks');
  logger.info('='.repeat(60));

  for (const task of tasks) {
    const priorityColor = getPriorityColor(task.priority);
    console.log('');
    console.log(`${chalk.bold(task.title)}`);
    console.log(`  Priority: ${priorityColor(task.priority)}`);
    const descPreview = task.description.split('\n').slice(0, 3).join('\n');
    console.log(`  ${chalk.dim(descPreview.substring(0, 100))}${descPreview.length > 100 ? '...' : ''}`);
  }

  logger.info('');
  logger.info(`Total tasks to create: ${chalk.bold(tasks.length.toString())}`);

  if (dryRun) {
    logger.info('');
    logger.info(chalk.dim(`[Dry run] Would have created ${tasks.length} issue(s)`));
    return;
  }

  // Create issues
  logger.info('');
  const ticketService = createTicketService(config);
  const { teamId, projectId } = extractTeamAndProjectIds(config);

  const created = await createIssuesFromPRTasks(
    tasks,
    pr,
    actionableComments,
    ticketService,
    teamId,
    projectId,
    config.labels.candidate,
    config.labels.prFeedback
  );

  // Summary
  const stats = [
    { label: 'PR', value: `#${pr.number} - ${pr.title}` },
    { label: 'Comments analyzed', value: actionableComments.length },
    { label: 'Issues created', value: created.length, type: 'success' as const },
  ];

  displaySummary('Summary', stats);

  if (created.length > 0) {
    logger.info('');
    logger.info('Created issues:');
    for (const issue of created) {
      logger.info(`  ${issue.identifier}: ${issue.title}`);
      if (issue.url) {
        logger.info(chalk.dim(`    ${issue.url}`));
      }
    }
  }
}

async function parseCommentsWithClaude(
  pr: PRDetails,
  comments: PRComment[],
  model: string,
  timeout: number,
  verbose: boolean,
  debug: boolean
): Promise<ParsedPRTask[] | null> {
  const prompt = buildPRCommentParserPrompt(pr, comments);
  const startTime = Date.now();
  let output = '';

  if (debug) {
    console.log(chalk.yellow('=== Prompt Debug ==='));
    console.log(`Prompt length: ${prompt.length} chars`);
    console.log(`Comments count: ${comments.length}`);
    console.log('');
    console.log(chalk.dim('First 500 chars:'));
    console.log(prompt.slice(0, 500));
    console.log('');
    console.log(chalk.dim('Last 500 chars:'));
    console.log(prompt.slice(-500));
    console.log(chalk.yellow('=== End Prompt Debug ==='));
    console.log('');

    // Save prompt to temp file for manual testing
    const fs = await import('fs');
    const tempFile = '/tmp/ralphy-prompt-debug.txt';
    fs.writeFileSync(tempFile, prompt);
    console.log(chalk.cyan(`Prompt saved to: ${tempFile}`));
    const manualModelArg = model ? ` --model ${model}` : '';
    console.log(
      chalk.dim(
        `Test manually: cat ${tempFile} | claude --print --output-format text${manualModelArg} -p -`
      )
    );
    console.log('');
  }

  const spinner = createSpinner('Analyzing comments with Claude...').start();

  try {
    const args = buildPRParserClaudeArgs(prompt, model);
    const argsWithoutPrompt = args.filter((arg, i) => {
      if (arg === '-p') return false;
      if (i > 0 && args[i - 1] === '-p') return false;
      return true;
    });
    const cliArgs = [...argsWithoutPrompt, '-p', '-'];

    if (debug) {
      console.log(chalk.dim(`Claude command: claude ${cliArgs.join(' ')}`));
    }

    const subprocess = execa('claude', cliArgs, {
      timeout,
      reject: false,
      input: prompt,
    });

    if (verbose) {
      spinner.stop();
      logger.info(chalk.dim('Claude is analyzing PR comments...'));
      console.log('');

      if (subprocess.stdout) {
        subprocess.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          process.stdout.write(text);
        });
      }

      if (subprocess.stderr) {
        subprocess.stderr.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          process.stderr.write(text);
        });
      }
    } else {
      const updateInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        spinner.text(`Analyzing comments with Claude... (${elapsed}s)`);
      }, 1000);

      if (subprocess.stdout) {
        subprocess.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
      }

      if (subprocess.stderr) {
        subprocess.stderr.on('data', (data: Buffer) => {
          output += data.toString();
        });
      }

      subprocess.finally(() => clearInterval(updateInterval));
    }

    const result = await subprocess;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (verbose) {
      console.log('');
    }

    if (!output && result.stdout && typeof result.stdout === 'string') {
      output = result.stdout;
    }

    if (debug) {
      console.log(chalk.yellow('=== Claude Response Debug ==='));
      console.log(`Exit code: ${result.exitCode}`);
      console.log(`Stdout length: ${result.stdout?.length || 0}`);
      console.log(`Stderr length: ${result.stderr?.length || 0}`);
      console.log(`Collected output length: ${output.length}`);
      if (result.stderr) {
        console.log(chalk.dim('Stderr:'));
        console.log(result.stderr);
      }
      console.log(chalk.yellow('=== End Claude Response Debug ==='));
    }

    if (result.exitCode !== 0) {
      if (!verbose) spinner.fail(`Claude analysis failed (${elapsed}s)`);
      logger.error(`Claude exited with code ${result.exitCode}`);
      return null;
    }

    if (!isPRParsingComplete(output)) {
      if (!verbose) spinner.warn(`Claude did not signal completion (${elapsed}s)`);
      else logger.warn('Claude did not signal completion');
    } else {
      if (!verbose) spinner.succeed(`Comments analyzed (${elapsed}s)`);
      else logger.success(`Comments analyzed in ${elapsed}s`);
    }

    const parseResult = parsePRTasksOutput(output);
    if (!parseResult.success) {
      logger.error('Failed to parse task output from Claude');
      if (debug) {
        logger.error('');
        logger.error(chalk.yellow('=== Debug Info ==='));
        logger.error(`Error: ${parseResult.error}`);
        logger.error(`Start marker found: ${parseResult.details.hasStartMarker}`);
        logger.error(`End marker found: ${parseResult.details.hasEndMarker}`);
        if (parseResult.details.jsonParseError) {
          logger.error(`JSON parse error: ${parseResult.details.jsonParseError}`);
        }
        if (parseResult.details.zodError) {
          logger.error(`Zod validation error:\n${parseResult.details.zodError}`);
        }
        if (parseResult.details.jsonContent) {
          logger.error('');
          logger.error(chalk.dim('Extracted JSON content:'));
          logger.error(parseResult.details.jsonContent);
        }
        logger.error('');
        logger.error(chalk.dim('Raw output preview:'));
        logger.error(parseResult.details.rawOutputPreview);
        logger.error(chalk.yellow('=== End Debug Info ==='));
      } else {
        logger.info(chalk.dim('Run with --debug for detailed error info'));
      }
      return null;
    }

    return parseResult.tasks;
  } catch (err) {
    spinner.fail('Claude analysis error');
    logger.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return null;
  }
}

async function createIssuesFromPRTasks(
  tasks: ParsedPRTask[],
  pr: PRDetails,
  _allComments: PRComment[],
  ticketService: ReturnType<typeof createTicketService>,
  teamId: string,
  projectId: string | undefined,
  candidateLabel: string,
  prFeedbackLabel: string
): Promise<CreatedIssue[]> {
  const created: CreatedIssue[] = [];

  for (const task of tasks) {
    const spinner = createSpinner(`Creating issue: ${task.title}...`).start();

    // Format description with PR context
    const fullDescription = formatTaskDescription(pr, task.sourceComments, task.description);

    // Add both labels
    const labels = [candidateLabel, prFeedbackLabel];

    const result = await ticketService.createIssue({
      teamId,
      title: task.title,
      description: fullDescription,
      priority: task.priority,
      labelNames: labels,
      ...(projectId !== undefined && { projectId }),
    });

    if (!result.success) {
      spinner.fail(`Failed to create: ${task.title}`);
      logger.error(result.error);
      continue;
    }

    spinner.succeed(`Created ${result.data.identifier}: ${task.title}`);
    created.push(result.data);
  }

  return created;
}

function getPriorityColor(priority: string): (text: string) => string {
  switch (priority) {
    case 'urgent':
      return chalk.red;
    case 'high':
      return chalk.magenta;
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}
