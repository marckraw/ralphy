import { Router } from 'express';
import type { Config } from '../config.js';
import { handleJiraWebhook } from '../jira/webhook-handler.js';
import { logger } from '@ralphy/shared';

export function createRoutes(config: Config): Router {
  const router = Router();

  // Jira webhook endpoint
  router.post('/jira', async (req, res) => {
    logger.info('Received Jira webhook');

    try {
      const result = await handleJiraWebhook(req.body, config);

      if (result.queued) {
        res.status(202).json({
          status: 'accepted',
          message: 'Task queued for processing',
          issueKey: result.issueKey,
        });
      } else {
        res.status(200).json({
          status: 'skipped',
          message: result.reason,
        });
      }
    } catch (err) {
      logger.error(`Webhook error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
      });
    }
  });

  return router;
}
