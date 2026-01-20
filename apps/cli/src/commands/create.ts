/**
 * ralphy create - Create Linear issues from markdown files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { loadConfigV2 } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  isLinearProvider,
  type ParsedTask,
  type TicketService,
  type CreatedIssue,
} from '@mrck-labs/ralphy-shared';
import { isClaudeAvailable } from '../services/claude/executor.js';
import {
  buildTaskParserPrompt,
  parseTasksFromOutput,
  isParsingComplete,
  formatTasksPreview,
  buildTaskParserClaudeArgs,
} from '../services/claude/task-parser.js';
import { createSpinner } from '../utils/spinner.js';

/**
 * Checks if a path is a directory.
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Gets all markdown files from a directory.
 */
async function getMarkdownFilesFromDir(
  dirPath: string
): Promise<{ success: true; data: string[] } | { success: false; error: string }> {
  try {
    const absolutePath = path.resolve(dirPath);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    const markdownFiles = entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')))
      .map((entry) => path.join(absolutePath, entry.name))
      .sort(); // Sort alphabetically for consistent ordering

    if (markdownFiles.length === 0) {
      return {
        success: false,
        error: `No markdown files found in directory: ${dirPath}`,
      };
    }

    return { success: true, data: markdownFiles };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read directory: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Create command options.
 */
export interface CreateOptions {
  multi?: boolean | undefined;
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
  status?: string | undefined;
}

/**
 * Reads and validates a markdown file.
 * Pure-ish function (IO but simple).
 */
async function readMarkdownFile(
  filePath: string
): Promise<{ success: true; data: string } | { success: false; error: string }> {
  try {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    if (content.trim().length === 0) {
      return {
        success: false,
        error: 'Markdown file is empty',
      };
    }

    return { success: true, data: content };
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }
    return {
      success: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parses markdown into tasks using Claude.
 */
async function parseMarkdownWithClaude(
  markdown: string,
  multiMode: boolean,
  model: string,
  timeout: number,
  verbose: boolean
): Promise<{ success: true; data: ParsedTask[] } | { success: false; error: string }> {
  const prompt = buildTaskParserPrompt(markdown, multiMode);
  const args = buildTaskParserClaudeArgs(prompt, model);

  const startTime = Date.now();
  let output = '';

  const spinner = createSpinner('Parsing markdown with Claude...').start();

  try {
    // Pass prompt via stdin to handle long markdown
    const argsWithoutPrompt = args.filter((arg, i) => {
      if (arg === '-p') return false;
      if (i > 0 && args[i - 1] === '-p') return false;
      return true;
    });

    const subprocess = execa('claude', [...argsWithoutPrompt, '-p', '-'], {
      timeout,
      reject: false,
      input: prompt,
    });

    if (verbose) {
      spinner.stop();
      logger.info(logger.dim('Claude is parsing markdown...'));
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
        spinner.text(`Parsing markdown with Claude... (${elapsed}s)`);
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

    if (result.exitCode !== 0) {
      if (!verbose) spinner.fail(`Claude parsing failed (${elapsed}s)`);
      return {
        success: false,
        error: `Claude exited with code ${result.exitCode}`,
      };
    }

    if (!isParsingComplete(output)) {
      if (!verbose) spinner.warn(`Claude did not signal completion (${elapsed}s)`);
      else logger.warn('Claude did not signal completion');
    } else {
      if (!verbose) spinner.succeed(`Markdown parsed (${elapsed}s)`);
      else logger.success(`Markdown parsed in ${elapsed}s`);
    }

    const parseResult = parseTasksFromOutput(output, multiMode);
    if (!parseResult.success) {
      return parseResult;
    }

    return { success: true, data: parseResult.data };
  } catch (err) {
    spinner.fail('Claude parsing error');
    return {
      success: false,
      error: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Creates issues from parsed tasks.
 */
async function createIssuesFromTasks(
  tasks: ParsedTask[],
  ticketService: TicketService,
  teamId: string,
  projectId: string | undefined,
  candidateLabel: string,
  dryRun: boolean,
  stateName?: string
): Promise<CreatedIssue[]> {
  const created: CreatedIssue[] = [];

  for (const task of tasks) {
    if (dryRun) {
      logger.info(`[Dry run] Would create: ${task.title}`);
      continue;
    }

    const spinner = createSpinner(`Creating issue: ${task.title}...`).start();

    // Always add ralph-candidate label
    const labels = [candidateLabel, ...(task.labels ?? [])];

    const result = await ticketService.createIssue({
      teamId,
      title: task.title,
      priority: task.priority,
      labelNames: labels,
      ...(projectId !== undefined && { projectId }),
      ...(task.description !== undefined && { description: task.description }),
      ...(stateName !== undefined && { stateName }),
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

/**
 * Processes a single markdown file and returns parsed tasks.
 */
async function processMarkdownFile(
  filePath: string,
  multiMode: boolean,
  model: string,
  timeout: number,
  verbose: boolean
): Promise<{ success: true; data: ParsedTask[]; file: string } | { success: false; error: string; file: string }> {
  const readResult = await readMarkdownFile(filePath);
  if (!readResult.success) {
    return { ...readResult, file: filePath };
  }

  const parseResult = await parseMarkdownWithClaude(
    readResult.data,
    multiMode,
    model,
    timeout,
    verbose
  );

  if (!parseResult.success) {
    return { ...parseResult, file: filePath };
  }

  return { success: true, data: parseResult.data, file: filePath };
}

/**
 * Main create command implementation.
 */
export async function createCommand(
  inputPath: string,
  options: CreateOptions = {}
): Promise<void> {
  const { multi = false, dryRun = false, verbose = false, status } = options;

  // Load config
  const configResult = await loadConfigV2();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;

  // Check Claude is available
  const claudeAvailable = await isClaudeAvailable();
  if (!claudeAvailable) {
    logger.error(
      'Claude CLI is not available. Please install it first: https://claude.ai/code'
    );
    process.exit(1);
  }

  if (dryRun) {
    logger.info(logger.dim('[Dry run mode - no issues will be created]'));
    console.log('');
  }

  // Determine if input is a directory or file
  const isDir = await isDirectory(inputPath);
  let filesToProcess: string[];

  if (isDir) {
    const dirResult = await getMarkdownFilesFromDir(inputPath);
    if (!dirResult.success) {
      logger.error(dirResult.error);
      process.exit(1);
    }
    filesToProcess = dirResult.data;
    logger.info(`Processing directory: ${inputPath}`);
    logger.info(`Found ${filesToProcess.length} markdown file(s)`);
    if (status) {
      logger.info(`Target status: ${status}`);
    }
    console.log('');
  } else {
    filesToProcess = [inputPath];
    logger.info(`Processing file: ${inputPath}`);
    logger.info(`Mode: ${multi ? 'multi-task' : 'single-task'}`);
    if (status) {
      logger.info(`Target status: ${status}`);
    }
    console.log('');
  }

  // Process all files and collect tasks
  const allTasks: ParsedTask[] = [];
  const fileResults: Array<{ file: string; taskCount: number; error?: string }> = [];

  for (const filePath of filesToProcess) {
    const fileName = path.basename(filePath);
    logger.info(`\nProcessing: ${fileName}`);

    // For directory mode, each file is treated as a single task (no --multi)
    const useMultiMode = isDir ? false : multi;

    const result = await processMarkdownFile(
      filePath,
      useMultiMode,
      config.claude.model,
      config.claude.timeout,
      verbose
    );

    if (!result.success) {
      logger.error(`Failed to process ${fileName}: ${result.error}`);
      fileResults.push({ file: fileName, taskCount: 0, error: result.error });
      continue;
    }

    if (result.data.length === 0) {
      logger.warn(`No tasks extracted from ${fileName}`);
      fileResults.push({ file: fileName, taskCount: 0, error: 'No tasks extracted' });
      continue;
    }

    allTasks.push(...result.data);
    fileResults.push({ file: fileName, taskCount: result.data.length });
    logger.success(`Extracted ${result.data.length} task(s) from ${fileName}`);
  }

  if (allTasks.length === 0) {
    logger.error('No tasks could be extracted from any files');
    process.exit(1);
  }

  // Preview tasks
  console.log('');
  logger.info('='.repeat(60));
  logger.info('Extracted Tasks Preview');
  logger.info('='.repeat(60));
  console.log(formatTasksPreview(allTasks));

  // Create ticket service
  const ticketService = createTicketService(config);

  // Get team and project IDs
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  // Create issues
  const created = await createIssuesFromTasks(
    allTasks,
    ticketService,
    teamId,
    projectId,
    config.labels.candidate,
    dryRun,
    status
  );

  // Summary
  console.log('');
  logger.info('='.repeat(60));
  logger.info('Summary');
  logger.info('='.repeat(60));

  if (isDir) {
    logger.info(`Files processed: ${filesToProcess.length}`);
    const successfulFiles = fileResults.filter((r) => !r.error).length;
    const failedFiles = fileResults.filter((r) => r.error).length;
    if (failedFiles > 0) {
      logger.warn(`Files failed: ${failedFiles}`);
    }
    logger.info(`Files successful: ${successfulFiles}`);
  }

  logger.info(`Tasks extracted: ${allTasks.length}`);

  if (dryRun) {
    logger.info(logger.dim(`[Dry run] Would have created ${allTasks.length} issue(s)`));
  } else {
    logger.success(`Issues created: ${created.length}`);

    if (created.length > 0) {
      console.log('');
      logger.info('Created issues:');
      for (const issue of created) {
        logger.info(`  ${issue.identifier}: ${issue.title}`);
        if (issue.url) {
          logger.info(logger.dim(`    ${issue.url}`));
        }
      }
    }

    if (created.length < allTasks.length) {
      logger.warn(`Failed to create: ${allTasks.length - created.length}`);
    }
  }
}
