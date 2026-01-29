/**
 * IO wrappers for common command setup operations.
 * Thin wrappers that handle errors and exit on failure.
 */

import { loadAndResolveConfig } from '../services/config/manager.js';
import { isClaudeAvailable } from '../services/claude/executor.js';
import {
  logger,
  type RalphyConfigV2,
  type GitHubIntegration,
} from '@mrck-labs/ralphy-shared';

/**
 * Loads config or exits with error. Thin IO wrapper.
 *
 * @param cwd - Optional working directory
 * @returns The resolved configuration
 */
export async function requireConfig(cwd?: string): Promise<RalphyConfigV2> {
  const result = await loadAndResolveConfig(cwd);
  if (!result.success) {
    logger.error(result.error);
    process.exit(1);
  }
  return result.data;
}

/**
 * Checks Claude availability or exits with error. Thin IO wrapper.
 */
export async function requireClaude(): Promise<void> {
  const available = await isClaudeAvailable();
  if (!available) {
    logger.error(
      'Claude CLI is not available. Please install it first: https://claude.ai/code'
    );
    process.exit(1);
  }
}

/**
 * Extracts GitHub integration or exits with error.
 *
 * @param config - The Ralphy configuration
 * @returns The GitHub integration configuration
 */
export function requireGitHubIntegration(
  config: RalphyConfigV2
): GitHubIntegration {
  if (!config.integrations?.github) {
    logger.error('GitHub integration not configured.');
    logger.info('Run `ralphy init` to configure GitHub integration.');
    process.exit(1);
  }
  return config.integrations.github;
}
