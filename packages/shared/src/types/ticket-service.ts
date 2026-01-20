import { z } from 'zod';
import type { Result } from './config.js';
import type { CreateIssueOptions, CreatedIssue } from './task-input.js';

// Re-export Result types from config for convenience
export type { Result, ParseResult, ParseError } from './config.js';
export type { CreateIssueOptions, CreatedIssue } from './task-input.js';

// Normalized priority levels across providers
export type NormalizedPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

// Normalized types that work across Linear and Jira
export const NormalizedLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const NormalizedStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

export const NormalizedTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});

export const NormalizedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  key: z.string().optional(),
});

export const NormalizedIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  state: NormalizedStateSchema,
  labels: z.array(NormalizedLabelSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  url: z.string().optional(),
});

export type NormalizedLabel = z.infer<typeof NormalizedLabelSchema>;
export type NormalizedState = z.infer<typeof NormalizedStateSchema>;
export type NormalizedTeam = z.infer<typeof NormalizedTeamSchema>;
export type NormalizedProject = z.infer<typeof NormalizedProjectSchema>;
export type NormalizedIssue = z.infer<typeof NormalizedIssueSchema>;

// Label swap result for tracking what happened
export interface SwapResult {
  removed: string | null;
  added: string | null;
  alreadyHadTarget: boolean;
}

// Fetch options for issues by label
export interface FetchIssuesByLabelOptions {
  teamId: string;
  labelName: string;
  projectId?: string | undefined;
}

/**
 * Abstract interface for ticket management services.
 * Implementations exist for Linear and Jira.
 */
export interface TicketService {
  /** Provider identifier (e.g., 'linear', 'jira') */
  readonly provider: string;

  /**
   * Validates the connection to the ticket service.
   * Tests API credentials and connectivity.
   */
  validateConnection(): Promise<Result<boolean>>;

  // ============ Read Operations ============

  /**
   * Fetches all available teams/workspaces.
   * For Jira, this might return boards or project categories.
   */
  fetchTeams(): Promise<Result<NormalizedTeam[]>>;

  /**
   * Fetches projects, optionally filtered by team.
   * For Linear: returns projects in the team
   * For Jira: returns projects accessible to the user
   */
  fetchProjects(teamId?: string): Promise<Result<NormalizedProject[]>>;

  /**
   * Fetches issues that have a specific label.
   * This is the core operation for candidates/ready lists.
   */
  fetchIssuesByLabel(
    options: FetchIssuesByLabelOptions
  ): Promise<Result<NormalizedIssue[]>>;

  /**
   * Fetches a single issue by its identifier (e.g., PROJ-42).
   */
  fetchIssueById(issueId: string): Promise<Result<NormalizedIssue>>;

  // ============ Write Operations ============

  /**
   * Updates an issue's description.
   * For Jira, handles ADF format conversion.
   */
  updateIssueDescription(
    issueId: string,
    description: string
  ): Promise<Result<void>>;

  /**
   * Adds a label to an issue.
   * Should be idempotent (no-op if label already exists).
   */
  addLabelToIssue(issueId: string, labelName: string): Promise<Result<void>>;

  /**
   * Removes a label from an issue.
   * Should be idempotent (no-op if label doesn't exist).
   */
  removeLabelFromIssue(
    issueId: string,
    labelName: string
  ): Promise<Result<void>>;

  /**
   * Atomically swaps one label for another.
   * Useful for promoting issues (candidate -> ready).
   * Returns details about what was actually changed.
   */
  swapLabels(
    issueId: string,
    removeLabel: string,
    addLabel: string
  ): Promise<Result<SwapResult>>;

  /**
   * Creates a new issue.
   */
  createIssue(options: CreateIssueOptions): Promise<Result<CreatedIssue>>;

  /**
   * Adds a comment to an issue.
   * Used for tracking progress and status updates.
   */
  addComment(issueId: string, body: string): Promise<Result<void>>;

  /**
   * Updates the state/status of an issue.
   * @param issueId - The issue identifier
   * @param stateName - The target state name (e.g., "In Review", "Done")
   */
  updateIssueState(issueId: string, stateName: string): Promise<Result<void>>;
}

// Priority mapping utilities
export const LINEAR_TO_NORMALIZED_PRIORITY: Record<number, NormalizedPriority> =
  {
    0: 'none',
    1: 'urgent',
    2: 'high',
    3: 'medium',
    4: 'low',
  };

export const NORMALIZED_TO_LINEAR_PRIORITY: Record<NormalizedPriority, number> =
  {
    none: 0,
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

export const JIRA_TO_NORMALIZED_PRIORITY: Record<string, NormalizedPriority> = {
  '1': 'urgent', // Highest
  '2': 'high',
  '3': 'medium',
  '4': 'low',
  '5': 'none', // Lowest
  Highest: 'urgent',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Lowest: 'none',
};

export function normalizeLinearPriority(priority: number): NormalizedPriority {
  return LINEAR_TO_NORMALIZED_PRIORITY[priority] ?? 'none';
}

export function normalizedToLinearPriority(priority: NormalizedPriority): number {
  return NORMALIZED_TO_LINEAR_PRIORITY[priority] ?? 0;
}

export function normalizeJiraPriority(
  priority: string | undefined
): NormalizedPriority {
  if (!priority) return 'none';
  return JIRA_TO_NORMALIZED_PRIORITY[priority] ?? 'none';
}

// Human-readable priority labels
export const NORMALIZED_PRIORITY_LABELS: Record<NormalizedPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};

export function getPriorityLabel(priority: NormalizedPriority): string {
  return NORMALIZED_PRIORITY_LABELS[priority];
}
