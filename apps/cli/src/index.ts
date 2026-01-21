#!/usr/bin/env node

import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import { initCommand } from './commands/init.js';
import { candidatesCommand } from './commands/candidates.js';
import { readyCommand } from './commands/ready.js';
import { runCommand } from './commands/run.js';
import { enrichCommand } from './commands/enrich.js';
import { promoteCommand } from './commands/promote.js';
import { createCommand } from './commands/create.js';
import { statusCommand } from './commands/status.js';
import { setLogLevel, debug } from '@mrck-labs/ralphy-shared/utils';

// Load environment variables
dotenvConfig();

const program = new Command();

// Build identifier for debugging npm link issues
const BUILD_ID = '20250119-v9-stdin-prompt';

program
  .name('ralphy')
  .description('CLI tool for AI-assisted development with Linear/Jira integration')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts['verbose']) {
      setLogLevel('debug');
      debug(`Ralphy CLI starting (build: ${BUILD_ID})`);
      debug(`Node version: ${process.version}`);
      debug(`Working directory: ${process.cwd()}`);
    }
  });

program
  .command('init')
  .description('Initialize Ralphy in the current directory')
  .option('-f, --force', 'Force reinitialization even if already initialized')
  .action(async (options: { force?: boolean }) => {
    try {
      await initCommand({ force: options.force });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('candidates')
  .description('List issues with the "ralph-candidate" label')
  .option('--json', 'Output as JSON')
  .option('--all', 'Show all issues including completed/in-review')
  .action(async (options: { json?: boolean; all?: boolean }) => {
    try {
      await candidatesCommand({ json: options.json, all: options.all });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('ready')
  .description('List issues with the "ralph-ready" label')
  .option('--json', 'Output as JSON')
  .option('--all', 'Show all issues including completed/in-review')
  .action(async (options: { json?: boolean; all?: boolean }) => {
    try {
      await readyCommand({ json: options.json, all: options.all });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('run [issue]')
  .description('Execute the Ralph Wiggum loop for Linear issues')
  .option('-m, --max-iterations <number>', 'Maximum iterations before stopping', parseInt)
  .option('--auto-commit', 'Git commit after successful completion')
  .option('--notify', 'Desktop notification on completion')
  .option('--all-ready', 'Process all issues with the ralph-ready label')
  .option('--dry-run', 'Preview which issues would be processed without running')
  .option('--verbose', 'Show Claude tool activity in real-time')
  .action(async (issue: string | undefined, options: { maxIterations?: number; autoCommit?: boolean; notify?: boolean; allReady?: boolean; dryRun?: boolean; verbose?: boolean }) => {
    try {
      await runCommand(issue, {
        maxIterations: options.maxIterations,
        autoCommit: options.autoCommit,
        notify: options.notify,
        allReady: options.allReady,
        dryRun: options.dryRun,
        verbose: options.verbose,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('enrich [issues...]')
  .description('Enrich one or more Linear issues with AI-generated implementation details')
  .option('--all-candidates', 'Enrich all issues with the ralph-candidate label')
  .option('--dry-run', 'Preview enrichment without updating Linear')
  .option('-v, --verbose', 'Show Claude output in real-time')
  .option('-f, --force', 'Re-enrich issues that already have the ralph-enriched label')
  .action(async (issues: string[], options: { allCandidates?: boolean; dryRun?: boolean; verbose?: boolean; force?: boolean }) => {
    try {
      await enrichCommand(issues, {
        allCandidates: options.allCandidates,
        dryRun: options.dryRun,
        verbose: options.verbose,
        force: options.force,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('promote <issues...>')
  .description('Promote one or more issues from ralph-candidate to ralph-ready')
  .option('--dry-run', 'Preview label changes without updating Linear')
  .action(async (issues: string[], options: { dryRun?: boolean }) => {
    try {
      await promoteCommand(issues, {
        dryRun: options.dryRun,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('create <path>')
  .description('Create Linear issues from a markdown file or folder of markdown files')
  .option('--multi', 'Extract multiple tasks from each file (ignored for folders)')
  .option('--dry-run', 'Preview without creating issues')
  .option('-v, --verbose', 'Show Claude output')
  .option('-s, --status <status>', 'Set issue status (e.g., "Backlog", "Todo")')
  .action(async (inputPath: string, options: { multi?: boolean; dryRun?: boolean; verbose?: boolean; status?: string }) => {
    try {
      await createCommand(inputPath, {
        multi: options.multi,
        dryRun: options.dryRun,
        verbose: options.verbose,
        status: options.status,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Display comprehensive status information about the Ralphy environment')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      await statusCommand({ json: options.json });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();
