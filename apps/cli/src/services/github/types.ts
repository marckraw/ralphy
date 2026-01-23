import { z } from 'zod';
import type { NormalizedPriority } from '@mrck-labs/ralphy-shared';

// ============ GitHub API Response Schemas ============

export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.enum(['User', 'Bot', 'Organization']),
});

export const GitHubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  html_url: z.string().url(),
  user: GitHubUserSchema.nullable(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

export const GitHubReviewCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  path: z.string(),
  line: z.number().nullable(),
  original_line: z.number().nullable(),
  diff_hunk: z.string(),
  html_url: z.string().url(),
  user: GitHubUserSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  in_reply_to_id: z.number().optional(),
});

export const GitHubIssueCommentSchema = z.object({
  id: z.number(),
  body: z.string().nullable(),
  html_url: z.string().url(),
  user: GitHubUserSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ============ Type Exports ============

export type GitHubUser = z.infer<typeof GitHubUserSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubReviewComment = z.infer<typeof GitHubReviewCommentSchema>;
export type GitHubIssueComment = z.infer<typeof GitHubIssueCommentSchema>;

// ============ Normalized PR Comment Interface ============

export interface PRComment {
  id: number;
  body: string;
  path: string | null; // null for issue comments (not on specific file)
  line: number | null;
  diffHunk: string | null;
  author: string;
  authorType: 'user' | 'bot';
  url: string;
  createdAt: string;
  inReplyToId?: number | undefined;
}

export interface PRDetails {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: 'open' | 'closed';
  headBranch: string;
  baseBranch: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface PRWithComments {
  pr: PRDetails;
  reviewComments: PRComment[];
  issueComments: PRComment[];
}

// ============ Parsed Task Interface ============

export interface ParsedPRTask {
  title: string;
  description: string;
  priority: NormalizedPriority;
  sourceComments: PRComment[];
}

// ============ Import Result Interface ============

export interface PRImportResult {
  prNumber: number;
  prUrl: string;
  tasksCreated: number;
  tasks: Array<{
    id: string;
    identifier: string;
    title: string;
    url: string;
  }>;
}

// ============ Helper Functions ============

export function normalizeReviewComment(comment: GitHubReviewComment): PRComment {
  return {
    id: comment.id,
    body: comment.body,
    path: comment.path,
    line: comment.line ?? comment.original_line,
    diffHunk: comment.diff_hunk,
    author: comment.user?.login ?? 'unknown',
    authorType: comment.user?.type === 'Bot' ? 'bot' : 'user',
    url: comment.html_url,
    createdAt: comment.created_at,
    inReplyToId: comment.in_reply_to_id,
  };
}

export function normalizeIssueComment(comment: GitHubIssueComment): PRComment {
  return {
    id: comment.id,
    body: comment.body ?? '',
    path: null,
    line: null,
    diffHunk: null,
    author: comment.user?.login ?? 'unknown',
    authorType: comment.user?.type === 'Bot' ? 'bot' : 'user',
    url: comment.html_url,
    createdAt: comment.created_at,
  };
}

export function normalizePullRequest(pr: GitHubPullRequest): PRDetails {
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    url: pr.html_url,
    state: pr.state,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    author: pr.user?.login ?? 'unknown',
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  };
}
