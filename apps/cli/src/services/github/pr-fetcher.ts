import type { Octokit } from '@octokit/rest';
import type { Result } from '@mrck-labs/ralphy-shared';
import {
  type PRComment,
  type PRWithComments,
  GitHubPullRequestSchema,
  GitHubReviewCommentSchema,
  GitHubIssueCommentSchema,
  normalizeReviewComment,
  normalizeIssueComment,
  normalizePullRequest,
} from './types.js';

export interface ListPRsOptions {
  state?: 'open' | 'closed' | 'all';
  perPage?: number;
}

export interface PRSummary {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  author: string;
  reviewCommentCount: number;
  issueCommentCount: number;
  updatedAt: string;
}

/**
 * Fetches a list of pull requests from a repository.
 */
export async function fetchPullRequests(
  client: Octokit,
  owner: string,
  repo: string,
  options: ListPRsOptions = {}
): Promise<Result<PRSummary[]>> {
  const { state = 'open', perPage = 30 } = options;

  try {
    const { data: prs } = await client.pulls.list({
      owner,
      repo,
      state,
      per_page: perPage,
      sort: 'updated',
      direction: 'desc',
    });

    const summaries: PRSummary[] = [];

    for (const pr of prs) {
      // Fetch comment counts for each PR
      const [reviewComments, issueComments] = await Promise.all([
        client.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 1,
        }),
        client.issues.listComments({
          owner,
          repo,
          issue_number: pr.number,
          per_page: 1,
        }),
      ]);

      summaries.push({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state as 'open' | 'closed',
        author: pr.user?.login ?? 'unknown',
        reviewCommentCount: reviewComments.headers['x-total-count']
          ? parseInt(reviewComments.headers['x-total-count'] as string, 10)
          : reviewComments.data.length,
        issueCommentCount: issueComments.headers['x-total-count']
          ? parseInt(issueComments.headers['x-total-count'] as string, 10)
          : issueComments.data.length,
        updatedAt: pr.updated_at,
      });
    }

    return { success: true, data: summaries };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch pull requests: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetches a single pull request with all its comments.
 */
export async function fetchPullRequestWithComments(
  client: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Result<PRWithComments>> {
  try {
    // Fetch PR details, review comments, and issue comments in parallel
    const [prResponse, reviewCommentsResponse, issueCommentsResponse] = await Promise.all([
      client.pulls.get({ owner, repo, pull_number: prNumber }),
      fetchAllReviewComments(client, owner, repo, prNumber),
      fetchAllIssueComments(client, owner, repo, prNumber),
    ]);

    // Parse and validate PR
    const prParseResult = GitHubPullRequestSchema.safeParse(prResponse.data);
    if (!prParseResult.success) {
      return {
        success: false,
        error: `Invalid PR response format: ${prParseResult.error.message}`,
      };
    }

    const pr = normalizePullRequest(prParseResult.data);

    // Parse review comments
    const reviewComments: PRComment[] = [];
    for (const comment of reviewCommentsResponse) {
      const parseResult = GitHubReviewCommentSchema.safeParse(comment);
      if (parseResult.success) {
        reviewComments.push(normalizeReviewComment(parseResult.data));
      }
    }

    // Parse issue comments
    const issueComments: PRComment[] = [];
    for (const comment of issueCommentsResponse) {
      const parseResult = GitHubIssueCommentSchema.safeParse(comment);
      if (parseResult.success) {
        issueComments.push(normalizeIssueComment(parseResult.data));
      }
    }

    return {
      success: true,
      data: {
        pr,
        reviewComments,
        issueComments,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch PR #${prNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetches all review comments for a PR, handling pagination.
 */
async function fetchAllReviewComments(
  client: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<unknown[]> {
  const comments: unknown[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await client.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page,
    });

    comments.push(...data);

    if (data.length < perPage) {
      break;
    }
    page++;
  }

  return comments;
}

/**
 * Fetches all issue comments for a PR, handling pagination.
 */
async function fetchAllIssueComments(
  client: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<unknown[]> {
  const comments: unknown[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await client.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: perPage,
      page,
    });

    comments.push(...data);

    if (data.length < perPage) {
      break;
    }
    page++;
  }

  return comments;
}

/**
 * Filters PR comments to only those that might be actionable feedback.
 * Excludes bot comments (unless from Copilot), replies to threads, etc.
 */
export function filterActionableComments(comments: PRComment[]): PRComment[] {
  return comments.filter((comment) => {
    // Skip empty comments
    if (!comment.body.trim()) {
      return false;
    }

    // Keep Copilot bot comments (these are code review suggestions)
    if (comment.authorType === 'bot' && comment.author.toLowerCase().includes('copilot')) {
      return true;
    }

    // Skip other bot comments
    if (comment.authorType === 'bot') {
      return false;
    }

    // Skip if this is a reply to another comment (to avoid duplicates in task creation)
    if (comment.inReplyToId) {
      return false;
    }

    // Skip comments that are just thread starters with no content
    // (keep them if they have meaningful content)
    if (comment.body.length < 10) {
      return false;
    }

    return true;
  });
}

/**
 * Groups related comments (parent + replies) together.
 */
export function groupCommentThreads(comments: PRComment[]): PRComment[][] {
  const threadStarters = comments.filter(c => !c.inReplyToId);
  const replies = comments.filter(c => c.inReplyToId);

  const replyMap = new Map<number, PRComment[]>();
  for (const reply of replies) {
    if (reply.inReplyToId) {
      const existing = replyMap.get(reply.inReplyToId) ?? [];
      existing.push(reply);
      replyMap.set(reply.inReplyToId, existing);
    }
  }

  const threads: PRComment[][] = [];
  for (const starter of threadStarters) {
    const thread = [starter];
    const threadReplies = replyMap.get(starter.id) ?? [];
    thread.push(...threadReplies);
    threads.push(thread);
  }

  return threads;
}
