import { z } from 'zod';
import type { NormalizedPriority, Result } from './ticket-service.js';

/**
 * Zod schema for a parsed task from Claude's output.
 */
export const ParsedTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z
    .enum(['urgent', 'high', 'medium', 'low', 'none'])
    .optional()
    .default('none'),
  labels: z.array(z.string()).optional().default([]),
});

/**
 * Schema for multiple tasks (multi mode).
 */
export const ParsedTasksSchema = z.object({
  tasks: z.array(ParsedTaskSchema).min(1, 'At least one task is required'),
});

/**
 * Schema for a single task.
 */
export const ParsedSingleTaskSchema = z.object({
  task: ParsedTaskSchema,
});

export type ParsedTask = z.infer<typeof ParsedTaskSchema>;
export type ParsedTasks = z.infer<typeof ParsedTasksSchema>;
export type ParsedSingleTask = z.infer<typeof ParsedSingleTaskSchema>;

/**
 * Options for creating an issue via TicketService.
 */
export interface CreateIssueOptions {
  teamId: string;
  projectId?: string;
  title: string;
  description?: string;
  priority?: NormalizedPriority;
  labelNames?: string[];
  /** State name (e.g., "Backlog", "Todo") - resolved to ID by the service */
  stateName?: string;
}

/**
 * Result of creating an issue.
 */
export interface CreatedIssue {
  id: string;
  identifier: string;
  title: string;
  url?: string;
}

/**
 * Parses a single task from Claude's JSON output.
 * Pure function for validation.
 */
export function parseSingleTaskFromJson(json: unknown): Result<ParsedTask> {
  // Try to parse as a single task wrapper first
  const singleResult = ParsedSingleTaskSchema.safeParse(json);
  if (singleResult.success) {
    return { success: true, data: singleResult.data.task };
  }

  // Try to parse as a direct task object
  const directResult = ParsedTaskSchema.safeParse(json);
  if (directResult.success) {
    return { success: true, data: directResult.data };
  }

  return {
    success: false,
    error: `Invalid task format: ${directResult.error.message}`,
  };
}

/**
 * Parses multiple tasks from Claude's JSON output.
 * Pure function for validation.
 */
export function parseMultipleTasksFromJson(
  json: unknown
): Result<ParsedTask[]> {
  // Try to parse as tasks wrapper
  const wrapperResult = ParsedTasksSchema.safeParse(json);
  if (wrapperResult.success) {
    return { success: true, data: wrapperResult.data.tasks };
  }

  // Try to parse as a direct array
  const arrayResult = z.array(ParsedTaskSchema).safeParse(json);
  if (arrayResult.success) {
    return { success: true, data: arrayResult.data };
  }

  return {
    success: false,
    error: `Invalid tasks format: ${wrapperResult.error.message}`,
  };
}

/**
 * Parses tasks from Claude's JSON output, handling both single and multi modes.
 * Pure function for validation.
 */
export function parseTasksFromJson(
  json: unknown,
  multiMode: boolean
): Result<ParsedTask[]> {
  if (multiMode) {
    return parseMultipleTasksFromJson(json);
  }

  const singleResult = parseSingleTaskFromJson(json);
  if (!singleResult.success) {
    return singleResult;
  }

  return { success: true, data: [singleResult.data] };
}
