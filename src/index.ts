#!/usr/bin/env node

import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import { initCommand } from './commands/init.js';
import { candidatesCommand } from './commands/candidates.js';
import { readyCommand } from './commands/ready.js';
import { runCommand } from './commands/run.js';
import { enrichCommand } from './commands/enrich.js';

// Load environment variables
dotenvConfig();

const program = new Command();

program
  .name('ralphy')
  .description('CLI tool for AI-assisted development with Linear integration')
  .version('1.0.0');

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
  .action(async (options: { json?: boolean }) => {
    try {
      await candidatesCommand({ json: options.json });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('ready')
  .description('List issues with the "ralph-ready" label')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      await readyCommand({ json: options.json });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('run <issue>')
  .description('Execute the Ralph Wiggum loop for a Linear issue')
  .option('-m, --max-iterations <number>', 'Maximum iterations before stopping', parseInt)
  .option('--auto-commit', 'Git commit after successful completion')
  .option('--notify', 'Desktop notification on completion')
  .action(async (issue: string, options: { maxIterations?: number; autoCommit?: boolean; notify?: boolean }) => {
    try {
      await runCommand(issue, {
        maxIterations: options.maxIterations,
        autoCommit: options.autoCommit,
        notify: options.notify,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('enrich [issue]')
  .description('Enrich Linear issues with AI-generated implementation details')
  .option('--all-candidates', 'Enrich all issues with the ralph-candidate label')
  .option('--dry-run', 'Preview enrichment without updating Linear')
  .option('-v, --verbose', 'Show Claude output in real-time')
  .action(async (issue: string | undefined, options: { allCandidates?: boolean; dryRun?: boolean; verbose?: boolean }) => {
    try {
      await enrichCommand(issue, {
        allCandidates: options.allCandidates,
        dryRun: options.dryRun,
        verbose: options.verbose,
      });
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();
