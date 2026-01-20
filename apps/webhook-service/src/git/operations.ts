/**
 * Git operations for the webhook service.
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import type { RepoConfig } from '../config.js';
import { logger } from '@mrck-labs/ralphy-shared';

export async function getGitClient(repoConfig: RepoConfig): Promise<SimpleGit> {
  const git = simpleGit(repoConfig.localPath);
  return git;
}

export async function pullLatest(repoConfig: RepoConfig): Promise<void> {
  const git = await getGitClient(repoConfig);

  logger.info(`Pulling latest from ${repoConfig.defaultBranch}`);
  await git.checkout(repoConfig.defaultBranch);
  await git.pull('origin', repoConfig.defaultBranch);
}

export async function createFeatureBranch(
  repoConfig: RepoConfig,
  issueKey: string
): Promise<string> {
  const git = await getGitClient(repoConfig);
  const branchName = `ralphy/${issueKey.toLowerCase()}`;

  logger.info(`Creating branch: ${branchName}`);
  await git.checkoutLocalBranch(branchName);

  return branchName;
}

export async function commitAndPush(
  repoConfig: RepoConfig,
  issueKey: string,
  message?: string
): Promise<void> {
  const git = await getGitClient(repoConfig);

  const commitMessage = message ?? `feat(${issueKey}): Automated changes by Ralphy`;

  logger.info('Staging changes...');
  await git.add('-A');

  logger.info(`Committing: ${commitMessage}`);
  await git.commit(commitMessage);

  logger.info('Pushing to remote...');
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  await git.push('origin', currentBranch, ['--set-upstream']);
}

export async function hasChanges(repoConfig: RepoConfig): Promise<boolean> {
  const git = await getGitClient(repoConfig);
  const status = await git.status();
  return !status.isClean();
}
