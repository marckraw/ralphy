/**
 * Rate limit detection and waiting functionality.
 */

import { logger } from '@mrck-labs/ralphy-shared';

export const DEFAULT_RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;

const WAIT_TIME_PATTERNS = [
  /try again in (\d+)\s*seconds?/i,
  /wait (\d+)\s*seconds?/i,
  /(\d+)\s*seconds? remaining/i,
  /retry after (\d+)/i,
];

export function extractWaitTime(output: string): number | null {
  for (const pattern of WAIT_TIME_PATTERNS) {
    const match = pattern.exec(output);
    if (match?.[1]) {
      const seconds = parseInt(match[1], 10);
      if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
    }
  }
  return null;
}

export interface WaitOptions {
  waitMs: number;
  onTick?: (remainingSeconds: number) => void;
}

export async function waitWithCountdown(options: WaitOptions): Promise<void> {
  const { waitMs, onTick } = options;
  const totalSeconds = Math.ceil(waitMs / 1000);
  let remaining = totalSeconds;

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      remaining--;
      if (onTick) onTick(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
    if (onTick) onTick(remaining);
  });
}

export async function handleRateLimit(output: string): Promise<void> {
  const waitMs = extractWaitTime(output) ?? DEFAULT_RATE_LIMIT_WAIT_MS;
  const waitSeconds = Math.ceil(waitMs / 1000);

  logger.warn(`Rate limit hit. Waiting ${waitSeconds} seconds before retrying...`);

  await waitWithCountdown({
    waitMs,
    onTick: (remaining) => {
      process.stdout.write(`\r Waiting: ${remaining}s remaining...`);
    },
  });

  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  logger.info('Resuming execution...');
}

export function formatWaitTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${minutes}m ${remainingSeconds}s`;
}
