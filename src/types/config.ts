import { z } from 'zod';

export const LabelsConfigSchema = z.object({
  ready: z.string().default('ralph-ready'),
  candidate: z.string().default('ralph-candidate'),
  enriched: z.string().default('ralph-enriched'),
});

export const LinearConfigSchema = z.object({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  teamId: z.string().min(1),
  labels: LabelsConfigSchema,
});

export const ClaudeConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(20),
  timeout: z.number().int().positive().default(300000),
  model: z.string().default('sonnet'),
});

export const RalphyConfigSchema = z.object({
  version: z.literal(1),
  linear: LinearConfigSchema,
  claude: ClaudeConfigSchema,
});

export type LabelsConfig = z.infer<typeof LabelsConfigSchema>;
export type LinearConfig = z.infer<typeof LinearConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type RalphyConfig = z.infer<typeof RalphyConfigSchema>;

export const DEFAULT_LABELS: LabelsConfig = {
  ready: 'ralph-ready',
  candidate: 'ralph-candidate',
  enriched: 'ralph-enriched',
};

export const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
  maxIterations: 20,
  timeout: 300000,
  model: 'sonnet',
};

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

export function parseConfig(raw: unknown): Result<RalphyConfig> {
  const result = RalphyConfigSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid configuration format',
    details: result.error,
  };
}

export function createDefaultConfig(
  apiKey: string,
  projectId: string,
  projectName: string,
  teamId: string
): RalphyConfig {
  return {
    version: 1,
    linear: {
      apiKey,
      projectId,
      projectName,
      teamId,
      labels: DEFAULT_LABELS,
    },
    claude: DEFAULT_CLAUDE_CONFIG,
  };
}
