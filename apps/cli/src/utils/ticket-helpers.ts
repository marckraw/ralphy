/**
 * Ticket service wrappers with spinner feedback.
 * Combines IO operations with user feedback.
 */

import { createSpinner } from './spinner.js';
import { logger, type TicketService, type NormalizedIssue } from '@mrck-labs/ralphy-shared';

export interface FetchIssuesOptions {
  teamId: string;
  labelName: string;
  projectId?: string;
  spinnerText?: string;
  successText?: (count: number) => string;
}

/**
 * Fetches issues with spinner feedback. Exits on failure.
 *
 * @param ticketService - The ticket service to use
 * @param options - Fetch options including spinner customization
 * @returns Array of normalized issues
 */
export async function fetchIssuesWithSpinner(
  ticketService: TicketService,
  options: FetchIssuesOptions
): Promise<NormalizedIssue[]> {
  const { teamId, labelName, projectId, spinnerText, successText } = options;

  const spinner = createSpinner(spinnerText ?? 'Fetching issues...').start();
  const result = await ticketService.fetchIssuesByLabel({ teamId, labelName, projectId });

  if (!result.success) {
    spinner.fail('Failed to fetch issues');
    logger.error(result.error);
    process.exit(1);
  }

  const defaultSuccessText = (count: number): string => `Found ${count} issue(s)`;
  spinner.succeed((successText ?? defaultSuccessText)(result.data.length));
  return result.data;
}

/**
 * Fetches a single issue by ID with spinner feedback. Exits on failure.
 *
 * @param ticketService - The ticket service to use
 * @param issueIdentifier - The issue identifier (e.g., PROJ-42)
 * @returns The normalized issue
 */
export async function fetchIssueByIdWithSpinner(
  ticketService: TicketService,
  issueIdentifier: string
): Promise<NormalizedIssue> {
  const spinner = createSpinner(`Fetching issue ${issueIdentifier}...`).start();
  const result = await ticketService.fetchIssueById(issueIdentifier);

  if (!result.success) {
    spinner.fail('Failed to fetch issue');
    logger.error(result.error);
    process.exit(1);
  }

  spinner.succeed(`Found issue: ${result.data.identifier} - ${result.data.title}`);
  return result.data;
}
