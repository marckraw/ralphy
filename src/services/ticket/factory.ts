import type { RalphyConfigV2 } from '../../types/config.js';
import type { TicketService } from '../../types/ticket-service.js';
import { LinearTicketService } from './linear/linear-ticket-service.js';
import { JiraTicketService } from './jira/jira-ticket-service.js';

/**
 * Creates a TicketService instance based on the provider configuration.
 *
 * @param config - The v2 config with provider information
 * @returns A TicketService implementation for the configured provider
 */
export function createTicketService(config: RalphyConfigV2): TicketService {
  switch (config.provider.type) {
    case 'linear':
      return new LinearTicketService(config.provider.config, config.labels);
    case 'jira':
      return new JiraTicketService(config.provider.config, config.labels);
    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unknown provider type: ${exhaustiveCheck}`);
    }
  }
}
