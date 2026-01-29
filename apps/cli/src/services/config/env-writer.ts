import fs from 'node:fs/promises';
import path from 'node:path';
import { type Result } from '@mrck-labs/ralphy-shared';

const ENV_FILE = '.env';

/**
 * Secrets that can be written to .env file.
 */
export interface EnvSecrets {
  LINEAR_API_KEY?: string;
  JIRA_API_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

/**
 * Gets the path to the .env file.
 */
export function getEnvPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ENV_FILE);
}

/**
 * Parses a .env file content into a key-value map.
 * Preserves order and comments.
 */
function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value format
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      entries.set(key, value);
    }
  }

  return entries;
}

/**
 * Formats env entries back to .env file content.
 */
function formatEnvFile(entries: Map<string, string>): string {
  const lines: string[] = [];

  for (const [key, value] of entries) {
    // Quote values that contain special characters
    const needsQuotes = /[\s#"'$`\\]/.test(value);
    const formattedValue = needsQuotes ? `"${value}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Reads the existing .env file, or returns empty map if it doesn't exist.
 */
async function readEnvFile(cwd: string): Promise<Map<string, string>> {
  const envPath = getEnvPath(cwd);

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    return parseEnvFile(content);
  } catch (err) {
    // File doesn't exist - return empty map
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Map();
    }
    throw err;
  }
}

/**
 * Writes secrets to the .env file.
 * Merges with existing .env content, updating or adding the specified keys.
 * Only writes keys that have non-empty values.
 */
export async function writeSecretsToEnv(
  secrets: EnvSecrets,
  cwd: string = process.cwd()
): Promise<Result<void>> {
  try {
    // Read existing .env file
    const entries = await readEnvFile(cwd);

    // Update with new secrets (only if they have values)
    for (const [key, value] of Object.entries(secrets)) {
      if (value && value.length > 0) {
        entries.set(key, value);
      }
    }

    // Write back to file
    const envPath = getEnvPath(cwd);
    const content = formatEnvFile(entries);
    await fs.writeFile(envPath, content, 'utf-8');

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write secrets to .env: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Checks if the .env file exists.
 */
export async function envFileExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const stats = await fs.stat(getEnvPath(cwd));
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Reads a specific secret from the .env file.
 * Returns null if the file doesn't exist or the key is not found.
 */
export async function readSecretFromEnv(
  key: string,
  cwd: string = process.cwd()
): Promise<string | null> {
  try {
    const entries = await readEnvFile(cwd);
    return entries.get(key) ?? null;
  } catch {
    return null;
  }
}
