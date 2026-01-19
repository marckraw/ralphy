import { z } from 'zod';

export const LinearLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const LinearStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

export const LinearProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  state: z.string(),
});

export const LinearTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});

export const LinearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  state: LinearStateSchema,
  labels: z.array(LinearLabelSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LinearLabel = z.infer<typeof LinearLabelSchema>;
export type LinearState = z.infer<typeof LinearStateSchema>;
export type LinearProject = z.infer<typeof LinearProjectSchema>;
export type LinearTeam = z.infer<typeof LinearTeamSchema>;
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export interface ParseResult<T> {
  success: true;
  data: T;
}

export interface ParseError {
  success: false;
  error: string;
  details?: z.ZodError;
}

export type Result<T> = ParseResult<T> | ParseError;

export function parseIssue(raw: unknown): Result<LinearIssue> {
  const result = LinearIssueSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Failed to parse Linear issue',
    details: result.error,
  };
}

export function parseIssues(raw: unknown): Result<LinearIssue[]> {
  const arrayResult = z.array(z.unknown()).safeParse(raw);
  if (!arrayResult.success) {
    return { success: false, error: 'Expected an array of issues' };
  }

  const issues: LinearIssue[] = [];
  for (const item of arrayResult.data) {
    const result = parseIssue(item);
    if (!result.success) {
      return result;
    }
    issues.push(result.data);
  }
  return { success: true, data: issues };
}

export function parseProject(raw: unknown): Result<LinearProject> {
  const result = LinearProjectSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Failed to parse Linear project',
    details: result.error,
  };
}

export function parseProjects(raw: unknown): Result<LinearProject[]> {
  const arrayResult = z.array(z.unknown()).safeParse(raw);
  if (!arrayResult.success) {
    return { success: false, error: 'Expected an array of projects' };
  }

  const projects: LinearProject[] = [];
  for (const item of arrayResult.data) {
    const result = parseProject(item);
    if (!result.success) {
      return result;
    }
    projects.push(result.data);
  }
  return { success: true, data: projects };
}

export function parseTeam(raw: unknown): Result<LinearTeam> {
  const result = LinearTeamSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Failed to parse Linear team',
    details: result.error,
  };
}

export function parseTeams(raw: unknown): Result<LinearTeam[]> {
  const arrayResult = z.array(z.unknown()).safeParse(raw);
  if (!arrayResult.success) {
    return { success: false, error: 'Expected an array of teams' };
  }

  const teams: LinearTeam[] = [];
  for (const item of arrayResult.data) {
    const result = parseTeam(item);
    if (!result.success) {
      return result;
    }
    teams.push(result.data);
  }
  return { success: true, data: teams };
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

export function getPriorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? 'Unknown';
}
