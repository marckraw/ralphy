import { z } from 'zod';
import type { Config } from '../config.js';
import { logger } from '@ralphy/shared';

// Jira webhook payload schema (simplified)
const JiraWebhookSchema = z.object({
  webhookEvent: z.string(),
  issue: z.object({
    key: z.string(),
    fields: z.object({
      summary: z.string(),
      assignee: z.object({
        accountId: z.string(),
        displayName: z.string().optional(),
      }).nullable(),
      project: z.object({
        key: z.string(),
      }),
    }),
  }),
});

export interface WebhookResult {
  queued: boolean;
  issueKey?: string;
  reason?: string;
}

export async function handleJiraWebhook(
  payload: unknown,
  config: Config
): Promise<WebhookResult> {
  // Parse and validate payload
  const parseResult = JiraWebhookSchema.safeParse(payload);

  if (!parseResult.success) {
    logger.warn('Invalid webhook payload');
    return { queued: false, reason: 'Invalid payload' };
  }

  const { issue, webhookEvent } = parseResult.data;
  const issueKey = issue.key;
  const projectKey = issue.fields.project.key;
  const assigneeId = issue.fields.assignee?.accountId;

  logger.info(`Webhook event: ${webhookEvent} for ${issueKey}`);

  // Check if this is an assignee change
  if (!webhookEvent.includes('updated')) {
    return { queued: false, reason: 'Not an update event' };
  }

  // Check if assigned to Ralphy
  if (!config.jira.ralphyUserId || assigneeId !== config.jira.ralphyUserId) {
    return { queued: false, reason: 'Not assigned to Ralphy' };
  }

  // Find matching repo config
  const repoConfig = config.repos.find((r) => r.jiraProjectKey === projectKey);
  if (!repoConfig) {
    logger.warn(`No repo config for project ${projectKey}`);
    return { queued: false, reason: `No repo config for project ${projectKey}` };
  }

  logger.info(`Queueing task for ${issueKey} in ${repoConfig.localPath}`);

  // TODO: Add to BullMQ queue for processing
  // For now, just log
  logger.info(`Would queue job: ${JSON.stringify({ issueKey, repoConfig })}`);

  return { queued: true, issueKey };
}
