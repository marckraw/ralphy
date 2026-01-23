import { Octokit } from '@octokit/rest';
import type { Result } from '@mrck-labs/ralphy-shared';

let octokitInstance: Octokit | null = null;

/**
 * Resolves the GitHub token from config or environment variable.
 * Priority: config token > GITHUB_TOKEN env var
 */
export function resolveGitHubToken(configToken?: string): string | null {
  if (configToken) {
    return configToken;
  }
  return process.env['GITHUB_TOKEN'] ?? null;
}

/**
 * Checks if a GitHub token is available (either from config or env).
 */
export function hasGitHubToken(configToken?: string): boolean {
  return resolveGitHubToken(configToken) !== null;
}

/**
 * Initializes the Octokit client with the given token.
 * Uses singleton pattern to reuse the client instance.
 */
export function initializeGitHubClient(token: string): Octokit {
  octokitInstance = new Octokit({
    auth: token,
  });
  return octokitInstance;
}

/**
 * Gets the current Octokit client instance.
 * Throws if not initialized.
 */
export function getGitHubClient(): Octokit {
  if (!octokitInstance) {
    throw new Error('GitHub client not initialized. Call initializeGitHubClient first.');
  }
  return octokitInstance;
}

/**
 * Resets the Octokit client instance.
 * Useful for testing or re-authentication.
 */
export function resetGitHubClient(): void {
  octokitInstance = null;
}

/**
 * Validates a GitHub token by making a simple API call.
 * Returns the authenticated user's login on success.
 */
export async function validateGitHubToken(token: string): Promise<Result<string>> {
  try {
    const client = new Octokit({ auth: token });
    const { data } = await client.users.getAuthenticated();
    return { success: true, data: data.login };
  } catch (err) {
    return {
      success: false,
      error: `Invalid GitHub token: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates that the token has access to the specified repository.
 */
export async function validateRepoAccess(
  token: string,
  owner: string,
  repo: string
): Promise<Result<boolean>> {
  try {
    const client = new Octokit({ auth: token });
    await client.repos.get({ owner, repo });
    return { success: true, data: true };
  } catch (err) {
    if (err instanceof Error && 'status' in err && err.status === 404) {
      return {
        success: false,
        error: `Repository ${owner}/${repo} not found or not accessible`,
      };
    }
    return {
      success: false,
      error: `Failed to access repository: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Initializes the GitHub client with automatic token resolution.
 * Uses config token first, falls back to GITHUB_TOKEN env var.
 */
export function initializeGitHubClientFromConfig(configToken?: string): Result<Octokit> {
  const token = resolveGitHubToken(configToken);
  if (!token) {
    return {
      success: false,
      error: 'No GitHub token found. Set GITHUB_TOKEN environment variable or configure token in .ralphy/config.json',
    };
  }

  const client = initializeGitHubClient(token);
  return { success: true, data: client };
}
