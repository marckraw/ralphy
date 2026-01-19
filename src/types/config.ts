import { z } from 'zod';

// ============ Shared Schemas ============

export const LabelsConfigSchema = z.object({
  ready: z.string().default('ralph-ready'),
  candidate: z.string().default('ralph-candidate'),
  enriched: z.string().default('ralph-enriched'),
});

export const ClaudeConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(20),
  timeout: z.number().int().positive().default(300000),
  model: z.string().default('sonnet'),
});

// ============ V1 Config (Legacy) ============

export const LinearConfigV1Schema = z.object({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  teamId: z.string().min(1),
  labels: LabelsConfigSchema,
});

export const RalphyConfigV1Schema = z.object({
  version: z.literal(1),
  linear: LinearConfigV1Schema,
  claude: ClaudeConfigSchema,
});

// ============ V2 Config (Provider Abstraction) ============

export const LinearProviderConfigSchema = z.object({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  teamId: z.string().min(1),
});

export const JiraProviderConfigSchema = z.object({
  host: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  projectKey: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
});

export const LinearProviderSchema = z.object({
  type: z.literal('linear'),
  config: LinearProviderConfigSchema,
});

export const JiraProviderSchema = z.object({
  type: z.literal('jira'),
  config: JiraProviderConfigSchema,
});

export const ProviderSchema = z.discriminatedUnion('type', [
  LinearProviderSchema,
  JiraProviderSchema,
]);

export const RalphyConfigV2Schema = z.object({
  version: z.literal(2),
  provider: ProviderSchema,
  labels: LabelsConfigSchema,
  claude: ClaudeConfigSchema,
});

// ============ Type Exports ============

export type LabelsConfig = z.infer<typeof LabelsConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;

// V1 types (legacy)
export type LinearConfigV1 = z.infer<typeof LinearConfigV1Schema>;
export type RalphyConfigV1 = z.infer<typeof RalphyConfigV1Schema>;

// V2 types
export type LinearProviderConfig = z.infer<typeof LinearProviderConfigSchema>;
export type JiraProviderConfig = z.infer<typeof JiraProviderConfigSchema>;
export type LinearProvider = z.infer<typeof LinearProviderSchema>;
export type JiraProvider = z.infer<typeof JiraProviderSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type RalphyConfigV2 = z.infer<typeof RalphyConfigV2Schema>;

// Backwards compatibility aliases
export type LinearConfig = LinearConfigV1;
export type RalphyConfig = RalphyConfigV1;

// ============ Defaults ============

export const DEFAULT_LABELS: LabelsConfig = {
  ready: 'ralph-ready',
  candidate: 'ralph-candidate',
  enriched: 'ralph-enriched',
};

// 20 minutes default timeout - enrichment can take a while for complex issues
export const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
  maxIterations: 20,
  timeout: 1200000, // 20 minutes
  model: 'sonnet',
};

// ============ Result Types ============

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

// ============ Migration ============

/**
 * Migrates a v1 config to v2 format.
 * Pure function - does not read/write files.
 */
export function migrateV1ToV2(v1Config: RalphyConfigV1): RalphyConfigV2 {
  return {
    version: 2,
    provider: {
      type: 'linear',
      config: {
        apiKey: v1Config.linear.apiKey,
        projectId: v1Config.linear.projectId,
        projectName: v1Config.linear.projectName,
        teamId: v1Config.linear.teamId,
      },
    },
    labels: v1Config.linear.labels,
    claude: v1Config.claude,
  };
}

// ============ Parsing ============

/**
 * Parses a v1 config.
 */
export function parseConfigV1(raw: unknown): Result<RalphyConfigV1> {
  const result = RalphyConfigV1Schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid v1 configuration format',
    details: result.error,
  };
}

/**
 * Parses a v2 config.
 */
export function parseConfigV2(raw: unknown): Result<RalphyConfigV2> {
  const result = RalphyConfigV2Schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid v2 configuration format',
    details: result.error,
  };
}

/**
 * Parses a config of any version, returning v1 format.
 * This maintains backwards compatibility with existing code.
 */
export function parseConfig(raw: unknown): Result<RalphyConfig> {
  const result = RalphyConfigV1Schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid configuration format',
    details: result.error,
  };
}

/**
 * Normalizes any config version to v2 format.
 * Handles auto-migration from v1.
 */
export function normalizeConfig(raw: unknown): Result<RalphyConfigV2> {
  // Check for version field
  const versionCheck = z.object({ version: z.number() }).safeParse(raw);

  if (!versionCheck.success) {
    return {
      success: false,
      error: 'Config missing version field',
    };
  }

  const version = versionCheck.data.version;

  if (version === 2) {
    return parseConfigV2(raw);
  }

  if (version === 1) {
    const v1Result = parseConfigV1(raw);
    if (!v1Result.success) {
      return v1Result;
    }
    return { success: true, data: migrateV1ToV2(v1Result.data) };
  }

  return {
    success: false,
    error: `Unsupported config version: ${version}`,
  };
}

// ============ Factory Functions ============

/**
 * Creates a v1 config (backwards compatible).
 */
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

/**
 * Creates a v2 Linear config.
 */
export function createLinearConfigV2(
  apiKey: string,
  projectId: string,
  projectName: string,
  teamId: string
): RalphyConfigV2 {
  return {
    version: 2,
    provider: {
      type: 'linear',
      config: {
        apiKey,
        projectId,
        projectName,
        teamId,
      },
    },
    labels: DEFAULT_LABELS,
    claude: DEFAULT_CLAUDE_CONFIG,
  };
}

/**
 * Creates a v2 Jira config.
 */
export function createJiraConfigV2(
  host: string,
  email: string,
  apiToken: string,
  projectKey: string,
  projectId: string,
  projectName: string
): RalphyConfigV2 {
  return {
    version: 2,
    provider: {
      type: 'jira',
      config: {
        host,
        email,
        apiToken,
        projectKey,
        projectId,
        projectName,
      },
    },
    labels: DEFAULT_LABELS,
    claude: DEFAULT_CLAUDE_CONFIG,
  };
}

// ============ Type Guards ============

export function isLinearProvider(
  provider: Provider
): provider is LinearProvider {
  return provider.type === 'linear';
}

export function isJiraProvider(provider: Provider): provider is JiraProvider {
  return provider.type === 'jira';
}
