import fs from 'node:fs/promises';
import {
  type RalphyConfig,
  type RalphyConfigV2,
  type RalphyConfigStored,
  parseConfig,
  normalizeConfig,
  parseConfigV2,
  parseStoredConfig,
  createDefaultConfig,
  normalizeToStoredConfig,
  resolveConfig,
  type Result,
} from '@mrck-labs/ralphy-shared';
import {
  getConfigPath,
  configExists,
  createRalphyStructure,
  ralphyDirExists,
} from './paths.js';

/**
 * Loads config in v1 format (backwards compatible).
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<Result<RalphyConfig>> {
  const configPath = getConfigPath(cwd);

  try {
    const exists = await configExists(cwd);
    if (!exists) {
      return {
        success: false,
        error: `Config not found at ${configPath}. Run 'ralphy init' first.`,
      };
    }

    const content = await fs.readFile(configPath, 'utf-8');
    const raw: unknown = JSON.parse(content);
    return parseConfig(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        success: false,
        error: `Invalid JSON in config file: ${err.message}`,
      };
    }
    return {
      success: false,
      error: `Failed to read config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Loads and normalizes config to v2 format.
 * Automatically migrates v1 configs to v2 in memory.
 * Note: This function does NOT resolve secrets from environment variables.
 * Use loadAndResolveConfig() for commands that need fully resolved config.
 */
export async function loadConfigV2(cwd: string = process.cwd()): Promise<Result<RalphyConfigV2>> {
  const configPath = getConfigPath(cwd);

  try {
    const exists = await configExists(cwd);
    if (!exists) {
      return {
        success: false,
        error: `Config not found at ${configPath}. Run 'ralphy init' first.`,
      };
    }

    const content = await fs.readFile(configPath, 'utf-8');
    const raw: unknown = JSON.parse(content);
    return normalizeConfig(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        success: false,
        error: `Invalid JSON in config file: ${err.message}`,
      };
    }
    return {
      success: false,
      error: `Failed to read config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Loads the stored config (secrets may be absent).
 */
export async function loadStoredConfig(cwd: string = process.cwd()): Promise<Result<RalphyConfigStored>> {
  const configPath = getConfigPath(cwd);

  try {
    const exists = await configExists(cwd);
    if (!exists) {
      return {
        success: false,
        error: `Config not found at ${configPath}. Run 'ralphy init' first.`,
      };
    }

    const content = await fs.readFile(configPath, 'utf-8');
    const raw: unknown = JSON.parse(content);
    return normalizeToStoredConfig(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        success: false,
        error: `Invalid JSON in config file: ${err.message}`,
      };
    }
    return {
      success: false,
      error: `Failed to read config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Loads config and resolves secrets from environment variables.
 * This is the recommended function for commands that need API access.
 *
 * Resolution priority: config value > env var
 *
 * Supports backwards compatibility:
 * - New configs: secrets in .env, config has no apiKey/apiToken
 * - Legacy configs: secrets embedded in config, still work
 */
export async function loadAndResolveConfig(cwd: string = process.cwd()): Promise<Result<RalphyConfigV2>> {
  // Load stored config (may have secrets or not)
  const storedResult = await loadStoredConfig(cwd);
  if (!storedResult.success) {
    return storedResult;
  }

  // Resolve secrets from env vars (with fallback to config values)
  return resolveConfig(storedResult.data);
}

export async function saveConfig(
  config: RalphyConfig,
  cwd: string = process.cwd()
): Promise<Result<void>> {
  try {
    const exists = await ralphyDirExists(cwd);
    if (!exists) {
      await createRalphyStructure(cwd);
    }

    const configPath = getConfigPath(cwd);
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function saveConfigV2(
  config: RalphyConfigV2,
  cwd: string = process.cwd()
): Promise<Result<void>> {
  try {
    const exists = await ralphyDirExists(cwd);
    if (!exists) {
      await createRalphyStructure(cwd);
    }

    const configPath = getConfigPath(cwd);
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Saves a stored config (without secrets - secrets should be in .env).
 */
export async function saveStoredConfig(
  config: RalphyConfigStored,
  cwd: string = process.cwd()
): Promise<Result<void>> {
  try {
    const exists = await ralphyDirExists(cwd);
    if (!exists) {
      await createRalphyStructure(cwd);
    }

    const configPath = getConfigPath(cwd);
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function initializeConfig(
  apiKey: string,
  projectId: string,
  projectName: string,
  teamId: string,
  cwd: string = process.cwd()
): Promise<Result<RalphyConfig>> {
  const config = createDefaultConfig(apiKey, projectId, projectName, teamId);
  const saveResult = await saveConfig(config, cwd);

  if (!saveResult.success) {
    return saveResult;
  }

  return { success: true, data: config };
}

export async function isInitialized(cwd: string = process.cwd()): Promise<boolean> {
  return configExists(cwd);
}

export async function updateConfig(
  updates: Partial<RalphyConfig>,
  cwd: string = process.cwd()
): Promise<Result<RalphyConfig>> {
  const loadResult = await loadConfig(cwd);
  if (!loadResult.success) {
    return loadResult;
  }

  const updatedConfig: RalphyConfig = {
    ...loadResult.data,
    ...updates,
    linear: {
      ...loadResult.data.linear,
      ...(updates.linear ?? {}),
      labels: {
        ...loadResult.data.linear.labels,
        ...(updates.linear?.labels ?? {}),
      },
    },
    claude: {
      ...loadResult.data.claude,
      ...(updates.claude ?? {}),
    },
  };

  const validateResult = parseConfig(updatedConfig);
  if (!validateResult.success) {
    return validateResult;
  }

  const saveResult = await saveConfig(validateResult.data, cwd);
  if (!saveResult.success) {
    return saveResult;
  }

  return { success: true, data: validateResult.data };
}

/**
 * Updates a v2 config with partial updates.
 * Merges updates deeply, preserving existing nested structures.
 * Note: This function requires secrets to be present in the config file.
 * For configs without secrets, use updateStoredConfig instead.
 */
export async function updateConfigV2(
  updates: Partial<RalphyConfigV2>,
  cwd: string = process.cwd()
): Promise<Result<RalphyConfigV2>> {
  const loadResult = await loadConfigV2(cwd);
  if (!loadResult.success) {
    return loadResult;
  }

  const existingConfig = loadResult.data;

  // Deep merge the config, preserving nested structures
  const updatedConfig: RalphyConfigV2 = {
    ...existingConfig,
    ...updates,
    version: 2, // Always ensure version is 2
    provider: updates.provider ?? existingConfig.provider,
    labels: {
      ...existingConfig.labels,
      ...(updates.labels ?? {}),
    },
    claude: {
      ...existingConfig.claude,
      ...(updates.claude ?? {}),
    },
    integrations: {
      ...existingConfig.integrations,
      ...(updates.integrations ?? {}),
      // Deep merge github integration to preserve existing fields
      ...(updates.integrations?.github
        ? {
            github: {
              ...existingConfig.integrations?.github,
              ...updates.integrations.github,
            },
          }
        : {}),
    },
  };

  const validateResult = parseConfigV2(updatedConfig);
  if (!validateResult.success) {
    return validateResult;
  }

  const saveResult = await saveConfigV2(validateResult.data, cwd);
  if (!saveResult.success) {
    return saveResult;
  }

  return { success: true, data: validateResult.data };
}

/**
 * Updates a stored config with partial updates.
 * Works with configs that don't have secrets (secrets are in .env).
 * Merges updates deeply, preserving existing nested structures.
 */
export async function updateStoredConfig(
  updates: Partial<RalphyConfigStored>,
  cwd: string = process.cwd()
): Promise<Result<RalphyConfigStored>> {
  const loadResult = await loadStoredConfig(cwd);
  if (!loadResult.success) {
    return loadResult;
  }

  const existingConfig = loadResult.data;

  // Deep merge the config, preserving nested structures
  const updatedConfig: RalphyConfigStored = {
    ...existingConfig,
    ...updates,
    version: 2, // Always ensure version is 2
    provider: updates.provider ?? existingConfig.provider,
    labels: {
      ...existingConfig.labels,
      ...(updates.labels ?? {}),
    },
    claude: {
      ...existingConfig.claude,
      ...(updates.claude ?? {}),
    },
    integrations: {
      ...existingConfig.integrations,
      ...(updates.integrations ?? {}),
      // Deep merge github integration to preserve existing fields
      ...(updates.integrations?.github
        ? {
            github: {
              ...existingConfig.integrations?.github,
              ...updates.integrations.github,
            },
          }
        : {}),
    },
  };

  const validateResult = parseStoredConfig(updatedConfig);
  if (!validateResult.success) {
    return validateResult;
  }

  const saveResult = await saveStoredConfig(validateResult.data, cwd);
  if (!saveResult.success) {
    return saveResult;
  }

  return { success: true, data: validateResult.data };
}
