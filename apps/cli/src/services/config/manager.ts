import fs from 'node:fs/promises';
import {
  type RalphyConfig,
  type RalphyConfigV2,
  parseConfig,
  normalizeConfig,
  createDefaultConfig,
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
