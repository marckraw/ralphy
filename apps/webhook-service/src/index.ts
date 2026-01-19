/**
 * Ralphy Webhook Service
 *
 * Listens for Jira webhooks and processes tasks automatically.
 */

import express from 'express';
import { loadConfig } from './config.js';
import { createRoutes } from './server/routes.js';
import { logger } from '@ralphy/shared';

async function main(): Promise<void> {
  logger.info('Starting Ralphy Webhook Service...');

  // Load configuration
  const config = loadConfig();
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Port: ${config.port}`);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount routes
  app.use('/webhook', createRoutes(config));

  // Start server
  app.listen(config.port, () => {
    logger.success(`Webhook service listening on port ${config.port}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
    logger.info(`Jira webhook: http://localhost:${config.port}/webhook/jira`);
  });
}

main().catch((err) => {
  logger.error(`Failed to start service: ${err instanceof Error ? err.message : 'Unknown error'}`);
  process.exit(1);
});
