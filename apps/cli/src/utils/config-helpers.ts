/**
 * Pure functions for extracting configuration values.
 * No side effects - easy to test.
 */

import { type RalphyConfigV2, isLinearProvider } from '@mrck-labs/ralphy-shared';

/**
 * Extracts teamId and projectId from config based on provider type.
 * Pure function - no side effects.
 *
 * For Linear: uses teamId directly, projectId from provider config
 * For Jira: uses projectId as teamId equivalent, no separate projectId filter
 */
export function extractTeamAndProjectIds(config: RalphyConfigV2): {
  teamId: string;
  projectId: string | undefined;
} {
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  return { teamId, projectId };
}
