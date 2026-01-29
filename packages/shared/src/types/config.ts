import { z } from 'zod';

// ============ Shared Schemas ============

export const LabelsConfigSchema = z.object({
  ready: z.string().default('ralph-ready'),
  candidate: z.string().default('ralph-candidate'),
  enriched: z.string().default('ralph-enriched'),
  prFeedback: z.string().default('ralph-pr-feedback'),
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

// ============ Environment Variable Constants ============

export const ENV_VARS = {
  LINEAR_API_KEY: 'LINEAR_API_KEY',
  JIRA_API_TOKEN: 'JIRA_API_TOKEN',
  GITHUB_TOKEN: 'GITHUB_TOKEN',
} as const;

// ============ V2 Config (Provider Abstraction) ============

// Full config schemas (with secrets - used at runtime after resolution)
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

// Stored config schemas (without secrets - safe to commit)
export const LinearProviderStoredConfigSchema = z.object({
  apiKey: z.string().optional(), // Optional for backwards compatibility
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  teamId: z.string().min(1),
});

export const JiraProviderStoredConfigSchema = z.object({
  host: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().optional(), // Optional for backwards compatibility
  projectKey: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
});

// Provider schemas (runtime - with secrets)
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

// Stored provider schemas (without secrets - safe to commit)
export const LinearProviderStoredSchema = z.object({
  type: z.literal('linear'),
  config: LinearProviderStoredConfigSchema,
});

export const JiraProviderStoredSchema = z.object({
  type: z.literal('jira'),
  config: JiraProviderStoredConfigSchema,
});

export const ProviderStoredSchema = z.discriminatedUnion('type', [
  LinearProviderStoredSchema,
  JiraProviderStoredSchema,
]);

// ============ Integrations (Supplementary Sources) ============

export const GitHubIntegrationSchema = z.object({
  token: z.string().optional(), // Falls back to GITHUB_TOKEN env var
  owner: z.string().min(1), // Repository owner (user or org)
  repo: z.string().min(1), // Repository name
});

export const IntegrationsSchema = z.object({
  github: GitHubIntegrationSchema.optional(),
});

// Runtime config (with resolved secrets)
export const RalphyConfigV2Schema = z.object({
  version: z.literal(2),
  provider: ProviderSchema,
  labels: LabelsConfigSchema,
  claude: ClaudeConfigSchema,
  integrations: IntegrationsSchema.optional(),
});

// Stored config (secrets may be absent - resolved from env at runtime)
export const RalphyConfigStoredSchema = z.object({
  version: z.literal(2),
  provider: ProviderStoredSchema,
  labels: LabelsConfigSchema,
  claude: ClaudeConfigSchema,
  integrations: IntegrationsSchema.optional(),
});

// ============ Type Exports ============

export type LabelsConfig = z.infer<typeof LabelsConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;

// V1 types (legacy)
export type LinearConfigV1 = z.infer<typeof LinearConfigV1Schema>;
export type RalphyConfigV1 = z.infer<typeof RalphyConfigV1Schema>;

// V2 types (runtime - with secrets)
export type LinearProviderConfig = z.infer<typeof LinearProviderConfigSchema>;
export type JiraProviderConfig = z.infer<typeof JiraProviderConfigSchema>;
export type LinearProvider = z.infer<typeof LinearProviderSchema>;
export type JiraProvider = z.infer<typeof JiraProviderSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type GitHubIntegration = z.infer<typeof GitHubIntegrationSchema>;
export type Integrations = z.infer<typeof IntegrationsSchema>;
export type RalphyConfigV2 = z.infer<typeof RalphyConfigV2Schema>;

// Stored types (without required secrets - safe to commit)
export type LinearProviderStoredConfig = z.infer<typeof LinearProviderStoredConfigSchema>;
export type JiraProviderStoredConfig = z.infer<typeof JiraProviderStoredConfigSchema>;
export type LinearProviderStored = z.infer<typeof LinearProviderStoredSchema>;
export type JiraProviderStored = z.infer<typeof JiraProviderStoredSchema>;
export type ProviderStored = z.infer<typeof ProviderStoredSchema>;
export type RalphyConfigStored = z.infer<typeof RalphyConfigStoredSchema>;

// Backwards compatibility aliases
export type LinearConfig = LinearConfigV1;
export type RalphyConfig = RalphyConfigV1;

// ============ Defaults ============

export const DEFAULT_LABELS: LabelsConfig = {
  ready: 'ralph-ready',
  candidate: 'ralph-candidate',
  enriched: 'ralph-enriched',
  prFeedback: 'ralph-pr-feedback',
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

// ============ Stored Config Factory Functions ============

/**
 * Creates a stored Linear config (without apiKey - stored in .env).
 */
export function createLinearConfigStored(
  projectId: string,
  projectName: string,
  teamId: string
): RalphyConfigStored {
  return {
    version: 2,
    provider: {
      type: 'linear',
      config: {
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
 * Creates a stored Jira config (without apiToken - stored in .env).
 */
export function createJiraConfigStored(
  host: string,
  email: string,
  projectKey: string,
  projectId: string,
  projectName: string
): RalphyConfigStored {
  return {
    version: 2,
    provider: {
      type: 'jira',
      config: {
        host,
        email,
        projectKey,
        projectId,
        projectName,
      },
    },
    labels: DEFAULT_LABELS,
    claude: DEFAULT_CLAUDE_CONFIG,
  };
}

// ============ Secret Resolution Functions ============

/**
 * Resolves Linear API key from config or environment.
 * Priority: config value > env var
 */
export function resolveLinearApiKey(configApiKey?: string): string | null {
  if (configApiKey && configApiKey.length > 0) {
    return configApiKey;
  }
  const envKey = process.env[ENV_VARS.LINEAR_API_KEY];
  return envKey && envKey.length > 0 ? envKey : null;
}

/**
 * Resolves Jira API token from config or environment.
 * Priority: config value > env var
 */
export function resolveJiraApiToken(configApiToken?: string): string | null {
  if (configApiToken && configApiToken.length > 0) {
    return configApiToken;
  }
  const envToken = process.env[ENV_VARS.JIRA_API_TOKEN];
  return envToken && envToken.length > 0 ? envToken : null;
}

/**
 * Resolves GitHub token from config or environment.
 * Priority: config value > env var
 */
export function resolveGitHubToken(configToken?: string): string | null {
  if (configToken && configToken.length > 0) {
    return configToken;
  }
  const envToken = process.env[ENV_VARS.GITHUB_TOKEN];
  return envToken && envToken.length > 0 ? envToken : null;
}

/**
 * Resolves a stored config to a full runtime config by resolving secrets from env.
 * Returns an error if required secrets are missing.
 */
export function resolveConfig(stored: RalphyConfigStored): Result<RalphyConfigV2> {
  if (stored.provider.type === 'linear') {
    const apiKey = resolveLinearApiKey(stored.provider.config.apiKey);
    if (!apiKey) {
      return {
        success: false,
        error: `Linear API key not found.\nSet ${ENV_VARS.LINEAR_API_KEY} in your .env file or run 'ralphy init --force' to reconfigure.`,
      };
    }

    return {
      success: true,
      data: {
        version: 2,
        provider: {
          type: 'linear',
          config: {
            apiKey,
            projectId: stored.provider.config.projectId,
            projectName: stored.provider.config.projectName,
            teamId: stored.provider.config.teamId,
          },
        },
        labels: stored.labels,
        claude: stored.claude,
        integrations: stored.integrations,
      },
    };
  }

  if (stored.provider.type === 'jira') {
    const apiToken = resolveJiraApiToken(stored.provider.config.apiToken);
    if (!apiToken) {
      return {
        success: false,
        error: `Jira API token not found.\nSet ${ENV_VARS.JIRA_API_TOKEN} in your .env file or run 'ralphy init --force' to reconfigure.`,
      };
    }

    return {
      success: true,
      data: {
        version: 2,
        provider: {
          type: 'jira',
          config: {
            host: stored.provider.config.host,
            email: stored.provider.config.email,
            apiToken,
            projectKey: stored.provider.config.projectKey,
            projectId: stored.provider.config.projectId,
            projectName: stored.provider.config.projectName,
          },
        },
        labels: stored.labels,
        claude: stored.claude,
        integrations: stored.integrations,
      },
    };
  }

  return {
    success: false,
    error: 'Unknown provider type',
  };
}

// ============ Stored Config Parsing ============

/**
 * Parses a stored config (secrets may be absent).
 */
export function parseStoredConfig(raw: unknown): Result<RalphyConfigStored> {
  const result = RalphyConfigStoredSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid stored configuration format',
    details: result.error,
  };
}

/**
 * Normalizes any config version to stored format.
 * Handles auto-migration from v1.
 */
export function normalizeToStoredConfig(raw: unknown): Result<RalphyConfigStored> {
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
    return parseStoredConfig(raw);
  }

  if (version === 1) {
    const v1Result = parseConfigV1(raw);
    if (!v1Result.success) {
      return v1Result;
    }
    // Migrate v1 to stored format (keeping the apiKey if present)
    const v1Config = v1Result.data;
    return {
      success: true,
      data: {
        version: 2,
        provider: {
          type: 'linear',
          config: {
            apiKey: v1Config.linear.apiKey, // Keep for backwards compatibility
            projectId: v1Config.linear.projectId,
            projectName: v1Config.linear.projectName,
            teamId: v1Config.linear.teamId,
          },
        },
        labels: v1Config.linear.labels,
        claude: v1Config.claude,
      },
    };
  }

  return {
    success: false,
    error: `Unsupported config version: ${version}`,
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

export function isLinearProviderStored(
  provider: ProviderStored
): provider is LinearProviderStored {
  return provider.type === 'linear';
}

export function isJiraProviderStored(
  provider: ProviderStored
): provider is JiraProviderStored {
  return provider.type === 'jira';
}
