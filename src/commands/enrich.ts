/**
 * ralphy enrich - Enrich Linear issues with AI-generated details.
 */

import { execa } from 'execa';
import { initializeClient } from '../services/linear/client.js';
import { fetchIssueById, fetchCandidateIssues, updateIssueDescription } from '../services/linear/issues.js';
import { loadConfig } from '../services/config/manager.js';
import { isClaudeAvailable } from '../services/claude/executor.js';
import {
  buildEnrichmentPrompt,
  parseEnrichedContent,
  formatEnrichedMarkdown,
  isEnrichmentComplete,
  buildEnrichmentClaudeArgs,
} from '../services/claude/enricher.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import type { LinearIssue } from '../types/linear.js';

/**
 * Enrich command options.
 */
export interface EnrichOptions {
  allCandidates?: boolean | undefined;
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
}

/**
 * Enriches a single issue using Claude.
 *
 * @param issue - The issue to enrich
 * @param dryRun - If true, don't update Linear, just show the result
 * @param verbose - If true, stream Claude's output
 * @returns True if enrichment was successful
 */
async function enrichSingleIssue(issue: LinearIssue, dryRun: boolean, verbose: boolean): Promise<boolean> {
  logger.info(`\nEnriching ${logger.highlight(issue.identifier)}: ${issue.title}`);

  // Build the prompt
  const prompt = buildEnrichmentPrompt(issue);

  if (verbose) {
    logger.debug('Prompt length: ' + prompt.length + ' characters');
  }

  // Execute Claude
  const args = buildEnrichmentClaudeArgs(prompt);

  const startTime = Date.now();
  let output = '';

  // Show spinner initially
  const spinner = createSpinner('Running Claude enrichment...').start();

  try {
    const subprocess = execa('claude', args, {
      timeout: 180000, // 3 minutes for enrichment
      reject: false,
      stdin: 'ignore',
    });

    // If verbose, stream the output
    if (verbose) {
      spinner.stop();
      logger.info(logger.dim('Claude is generating enrichment (output will appear when complete)...'));
      console.log('');

      // Track elapsed time in verbose mode too
      const verboseInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r${logger.dim(`⏳ Elapsed: ${elapsed}s...`)}`);
      }, 1000);

      if (subprocess.stdout) {
        subprocess.stdout.on('data', (data: Buffer) => {
          // Clear the elapsed time line on first output
          if (!output) {
            process.stdout.write('\r' + ' '.repeat(30) + '\r');
            clearInterval(verboseInterval);
            logger.info(logger.dim('--- Claude Output ---'));
          }
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

      subprocess.finally(() => clearInterval(verboseInterval));
    } else {
      // Not verbose - just collect output, update spinner with elapsed time
      const updateInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        spinner.text(`Running Claude enrichment... (${elapsed}s)`);
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
      logger.info(logger.dim('--- End Claude Output ---\n'));
    }

    // Use collected output if stdout wasn't captured via events
    if (!output && result.stdout && typeof result.stdout === 'string') {
      output = result.stdout;
    }

    if (result.exitCode !== 0) {
      if (!verbose) spinner.fail(`Claude enrichment failed (${elapsed}s)`);
      logger.error(`Exit code: ${result.exitCode}`);
      if (result.stderr && typeof result.stderr === 'string') {
        logger.error(`stderr: ${result.stderr}`);
      }
      return false;
    }

    if (!isEnrichmentComplete(output)) {
      if (!verbose) spinner.warn(`Claude did not signal completion (${elapsed}s)`);
      else logger.warn('Claude did not signal completion');
      logger.warn('The enrichment may be incomplete.');
    } else {
      if (!verbose) spinner.succeed(`Enrichment generated (${elapsed}s)`);
      else logger.success(`Enrichment generated in ${elapsed}s`);
    }

    // Parse the enriched content
    const enrichedContent = parseEnrichedContent(output);

    if (!enrichedContent) {
      logger.error('Could not extract structured content from Claude output.');
      if (verbose) {
        logger.debug('Raw output length: ' + output.length);
        logger.debug('Output preview: ' + output.slice(0, 500) + '...');
      }
      return false;
    }

    // Format the enriched markdown
    const enrichedMarkdown = formatEnrichedMarkdown(enrichedContent);

    // Show preview
    console.log('');
    logger.info('--- Enriched Content Preview ---');
    console.log(enrichedMarkdown);
    logger.info('--- End Preview ---');
    console.log('');

    if (dryRun) {
      logger.info(`[Dry run] Would update ${issue.identifier} description in Linear.`);
      return true;
    }

    // Update Linear issue
    const updateSpinner = createSpinner('Updating Linear issue...').start();
    const updateResult = await updateIssueDescription(issue.identifier, enrichedMarkdown);

    if (!updateResult.success) {
      updateSpinner.fail('Failed to update Linear issue');
      logger.error(updateResult.error);
      return false;
    }

    updateSpinner.succeed(`Updated ${issue.identifier} in Linear`);
    return true;
  } catch (err) {
    spinner.fail('Enrichment error');
    logger.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Main enrich command implementation.
 *
 * @param issueIdentifier - The Linear issue identifier (e.g., PROJ-42) or undefined for --all-candidates
 * @param options - Enrich options
 */
export async function enrichCommand(
  issueIdentifier: string | undefined,
  options: EnrichOptions = {}
): Promise<void> {
  const { allCandidates = false, dryRun = false, verbose = false } = options;

  // Validate arguments
  if (!issueIdentifier && !allCandidates) {
    logger.error('Please provide an issue identifier or use --all-candidates');
    process.exit(1);
  }

  // Load config
  const configResult = await loadConfig();
  if (!configResult.success) {
    logger.error(configResult.error);
    process.exit(1);
  }

  const config = configResult.data;

  // Check Claude is available
  const claudeAvailable = await isClaudeAvailable();
  if (!claudeAvailable) {
    logger.error('Claude CLI is not available. Please install it first: https://claude.ai/code');
    process.exit(1);
  }

  // Get API key from env (override) or config
  const apiKey = process.env['LINEAR_API_KEY'] ?? config.linear.apiKey;

  // Initialize Linear client
  initializeClient(apiKey);

  if (dryRun) {
    logger.info(logger.dim('[Dry run mode - no changes will be made to Linear]'));
    console.log('');
  }

  if (allCandidates) {
    // Enrich all candidate issues
    const spinner = createSpinner('Fetching candidate issues...').start();
    const issuesResult = await fetchCandidateIssues(
      config.linear.teamId,
      config.linear.labels.candidate,
      config.linear.projectId
    );

    if (!issuesResult.success) {
      spinner.fail('Failed to fetch issues');
      logger.error(issuesResult.error);
      process.exit(1);
    }

    const issues = issuesResult.data;
    spinner.succeed(`Found ${issues.length} candidate issue(s)`);

    if (issues.length === 0) {
      logger.info(`\nNo issues found with the "${logger.highlight(config.linear.labels.candidate)}" label.`);
      return;
    }

    // Process each issue
    let successCount = 0;
    let failCount = 0;

    for (const issue of issues) {
      const success = await enrichSingleIssue(issue, dryRun, verbose);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Summary
    console.log('');
    logger.info('='.repeat(60));
    logger.info('Enrichment Summary');
    logger.info('='.repeat(60));
    logger.info(`Total issues: ${issues.length}`);
    logger.success(`Successful: ${successCount}`);
    if (failCount > 0) {
      logger.error(`Failed: ${failCount}`);
    }

    if (failCount > 0) {
      process.exit(1);
    }
  } else if (issueIdentifier) {
    // Enrich single issue
    const spinner = createSpinner(`Fetching issue ${issueIdentifier}...`).start();
    const issueResult = await fetchIssueById(issueIdentifier);

    if (!issueResult.success) {
      spinner.fail('Failed to fetch issue');
      logger.error(issueResult.error);
      process.exit(1);
    }

    const issue = issueResult.data;
    spinner.succeed(`Found issue: ${issue.identifier} - ${issue.title}`);

    const success = await enrichSingleIssue(issue, dryRun, verbose);

    if (!success) {
      process.exit(1);
    }

    logger.success('\nEnrichment complete!');
  }
}
