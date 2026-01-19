/**
 * ralphy enrich - Enrich issues with AI-generated details.
 */

import { execa } from 'execa';
import { loadConfigV2 } from '../services/config/manager.js';
import {
  createTicketService,
  logger,
  isLinearProvider,
  type NormalizedIssue,
  type TicketService,
} from '@ralphy/shared';
import { isClaudeAvailable } from '../services/claude/executor.js';
import {
  buildEnrichmentPrompt,
  parseEnrichedContent,
  formatEnrichedMarkdown,
  isEnrichmentComplete,
  buildEnrichmentClaudeArgs,
} from '../services/claude/enricher.js';
import { createSpinner } from '../utils/spinner.js';

/**
 * Enrich command options.
 */
export interface EnrichOptions {
  allCandidates?: boolean | undefined;
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
  force?: boolean | undefined;
}

/**
 * Helper function to check if an issue has a label by name.
 */
function hasLabelByName(
  labels: Array<{ id: string; name: string }>,
  labelName: string
): boolean {
  return labels.some((label) => label.name === labelName);
}

/**
 * Filter issues to only those that don't have a specific label.
 */
function filterUnenrichedIssues(
  issues: NormalizedIssue[],
  labelName: string
): NormalizedIssue[] {
  return issues.filter((issue) => !hasLabelByName(issue.labels, labelName));
}

/**
 * Enriches a single issue using Claude.
 *
 * @param issue - The issue to enrich
 * @param ticketService - The ticket service to use for updates
 * @param dryRun - If true, don't update the issue, just show the result
 * @param verbose - If true, stream Claude's output
 * @param enrichedLabelName - The name of the label to add after enrichment
 * @param model - The Claude model to use
 * @returns True if enrichment was successful
 */
async function enrichSingleIssue(
  issue: NormalizedIssue,
  ticketService: TicketService,
  dryRun: boolean,
  verbose: boolean,
  enrichedLabelName: string,
  model: string,
  timeout: number
): Promise<boolean> {
  logger.info(`\nEnriching ${logger.highlight(issue.identifier)}: ${issue.title}`);

  // Build the prompt
  const prompt = buildEnrichmentPrompt(issue);

  logger.debug('Prompt length: ' + prompt.length + ' characters');

  // Execute Claude
  const args = buildEnrichmentClaudeArgs(prompt, model);
  logger.debug('Claude command: claude ' + args.join(' ').slice(0, 200) + '...');
  logger.debug('Model: ' + (model || 'default'));

  const startTime = Date.now();
  let output = '';

  // Show spinner initially
  const spinner = createSpinner('Running Claude enrichment...').start();

  try {
    const timeoutMinutes = Math.round(timeout / 60000);
    logger.debug(`Timeout: ${timeout}ms (${timeoutMinutes} minutes)`);

    // Pass prompt via stdin instead of command line argument to handle long prompts
    const argsWithoutPrompt = args.filter((arg, i) => {
      // Remove -p and the following prompt argument
      if (arg === '-p') return false;
      if (i > 0 && args[i - 1] === '-p') return false;
      return true;
    });

    logger.debug(`Args without prompt: ${argsWithoutPrompt.join(' ')}`);
    logger.debug(`Passing prompt via stdin (${prompt.length} chars)`);

    const subprocess = execa('claude', [...argsWithoutPrompt, '-p', '-'], {
      timeout,
      reject: false,
      input: prompt,  // Pass prompt via stdin
    });

    // If verbose, stream the output
    if (verbose) {
      spinner.stop();
      logger.info(logger.dim('Claude is generating enrichment (output will appear when complete)...'));
      console.log('');

      // Track elapsed time in verbose mode too
      const verboseInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r${logger.dim(`Elapsed: ${elapsed}s...`)}`);
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
      if ('timedOut' in result && result.timedOut) {
        logger.error(`Process timed out after ${timeout / 1000} seconds`);
      }
      if ('signal' in result && result.signal) {
        logger.error(`Process was killed with signal: ${result.signal}`);
      }
      if (result.stderr && typeof result.stderr === 'string') {
        logger.error(`stderr: ${result.stderr}`);
      }
      logger.debug(`Output collected: ${output.length} chars`);
      if (output.length > 0) {
        logger.debug(`Output preview: ${output.slice(0, 300)}...`);
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
      logger.info(`[Dry run] Would update ${issue.identifier} description.`);
      return true;
    }

    // Update issue description
    const updateSpinner = createSpinner('Updating issue...').start();
    const updateResult = await ticketService.updateIssueDescription(issue.identifier, enrichedMarkdown);

    if (!updateResult.success) {
      updateSpinner.fail('Failed to update issue');
      logger.error(updateResult.error);
      return false;
    }

    updateSpinner.succeed(`Updated ${issue.identifier}`);

    // Add enriched label
    const labelSpinner = createSpinner(`Adding "${enrichedLabelName}" label...`).start();
    const labelResult = await ticketService.addLabelToIssue(issue.identifier, enrichedLabelName);

    if (!labelResult.success) {
      labelSpinner.fail('Failed to add enriched label');
      logger.error(labelResult.error);
      // Don't fail the whole operation, the description was already updated
      logger.warn('Issue was enriched but label could not be added.');
      return true;
    }

    labelSpinner.succeed(`Added "${enrichedLabelName}" label to ${issue.identifier}`);
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
 * @param issueIdentifier - The issue identifier (e.g., PROJ-42) or undefined for --all-candidates
 * @param options - Enrich options
 */
export async function enrichCommand(
  issueIdentifier: string | undefined,
  options: EnrichOptions = {}
): Promise<void> {
  const { allCandidates = false, dryRun = false, verbose = false, force = false } = options;

  // Validate arguments
  if (!issueIdentifier && !allCandidates) {
    logger.error('Please provide an issue identifier or use --all-candidates');
    process.exit(1);
  }

  // Load config (v2 normalized)
  const configResult = await loadConfigV2();
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

  // Create ticket service based on provider
  const ticketService = createTicketService(config);

  if (dryRun) {
    logger.info(logger.dim('[Dry run mode - no changes will be made]'));
    console.log('');
  }

  // Get teamId based on provider type
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  if (allCandidates) {
    // Enrich all candidate issues
    const spinner = createSpinner('Fetching candidate issues...').start();
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

    const allCandidateIssues = issuesResult.data;
    spinner.succeed(`Found ${allCandidateIssues.length} candidate issue(s)`);

    if (allCandidateIssues.length === 0) {
      logger.info(`\nNo issues found with the "${logger.highlight(config.labels.candidate)}" label.`);
      return;
    }

    // Filter out already-enriched issues unless --force is used
    const enrichedLabelName = config.labels.enriched;
    let issuesToProcess = allCandidateIssues;
    let skippedCount = 0;

    if (!force) {
      issuesToProcess = filterUnenrichedIssues(allCandidateIssues, enrichedLabelName);
      skippedCount = allCandidateIssues.length - issuesToProcess.length;

      if (skippedCount > 0) {
        logger.info(
          `\nSkipping ${skippedCount} already-enriched issue(s) (use --force to re-enrich)`
        );

        // Log individual skipped issues
        for (const issue of allCandidateIssues) {
          if (hasLabelByName(issue.labels, enrichedLabelName)) {
            logger.info(
              logger.dim(`  Skipping ${issue.identifier}: already enriched`)
            );
          }
        }
      }
    }

    if (issuesToProcess.length === 0) {
      logger.info(`\nNo unenriched issues to process.`);
      return;
    }

    // Process each issue
    let successCount = 0;
    let failCount = 0;

    for (const issue of issuesToProcess) {
      const success = await enrichSingleIssue(issue, ticketService, dryRun, verbose, enrichedLabelName, config.claude.model, config.claude.timeout);
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
    logger.info(`Total candidate issues: ${allCandidateIssues.length}`);
    if (skippedCount > 0) {
      logger.info(logger.dim(`Skipped (already enriched): ${skippedCount}`));
    }
    logger.info(`Processed: ${issuesToProcess.length}`);
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
    const issueResult = await ticketService.fetchIssueById(issueIdentifier);

    if (!issueResult.success) {
      spinner.fail('Failed to fetch issue');
      logger.error(issueResult.error);
      process.exit(1);
    }

    const issue = issueResult.data;
    spinner.succeed(`Found issue: ${issue.identifier} - ${issue.title}`);

    const enrichedLabelName = config.labels.enriched;

    // Check if already enriched and warn (but still proceed unless --force is required)
    if (hasLabelByName(issue.labels, enrichedLabelName)) {
      if (!force) {
        logger.warn(
          `Issue ${issue.identifier} is already enriched (has "${enrichedLabelName}" label).`
        );
        logger.info('Use --force to re-enrich this issue.');
        return;
      }
      logger.info(
        logger.dim(`Issue already enriched - re-enriching due to --force flag`)
      );
    }

    const success = await enrichSingleIssue(issue, ticketService, dryRun, verbose, enrichedLabelName, config.claude.model, config.claude.timeout);

    if (!success) {
      process.exit(1);
    }

    logger.success('\nEnrichment complete!');
  }
}
