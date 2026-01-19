import { LinearClient } from '@linear/sdk';

let clientInstance: LinearClient | null = null;

export function initializeClient(apiKey: string): LinearClient {
  clientInstance = new LinearClient({ apiKey });
  return clientInstance;
}

export function getClient(): LinearClient {
  if (!clientInstance) {
    throw new Error('Linear client not initialized. Call initializeClient() first.');
  }
  return clientInstance;
}

export function hasClient(): boolean {
  return clientInstance !== null;
}

export function resetClient(): void {
  clientInstance = null;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const client = new LinearClient({ apiKey });
    const viewer = await client.viewer;
    return viewer.id !== undefined;
  } catch {
    return false;
  }
}
