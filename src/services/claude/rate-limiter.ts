/**
 * Rate limit detection and waiting functionality.
 */

import { logger } from '../../utils/logger.js';

/**
 * Default wait time when rate limited (in milliseconds).
 * 5 minutes is a reasonable default for Claude's rate limits.
 */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;

/**
 * Patterns to extract wait time from error messages.
 * Pure function support - extracts numeric wait times.
 */
const WAIT_TIME_PATTERNS = [
  /try again in (\d+)\s*seconds?/i,
  /wait (\d+)\s*seconds?/i,
  /(\d+)\s*seconds? remaining/i,
  /retry after (\d+)/i,
];

/**
 * Extracts wait time from rate limit error message.
 * Pure function - no side effects.
 *
 * @param output - The error output to parse
 * @returns Wait time in milliseconds, or null if not found
 */
export function extractWaitTime(output: string): number | null {
  for (const pattern of WAIT_TIME_PATTERNS) {
    const match = pattern.exec(output);
    if (match?.[1]) {
      const seconds = parseInt(match[1], 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
  }
  return null;
}

/**
 * Options for wait with countdown.
 */
export interface WaitOptions {
  waitMs: number;
  onTick?: (remainingSeconds: number) => void;
}

/**
 * Creates a promise that resolves after the specified time.
 * Shows countdown progress via callback.
 *
 * @param options - Wait options
 */
export async function waitWithCountdown(options: WaitOptions): Promise<void> {
  const { waitMs, onTick } = options;
  const totalSeconds = Math.ceil(waitMs / 1000);
  let remaining = totalSeconds;

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      remaining--;
      if (onTick) {
        onTick(remaining);
      }
      if (remaining <= 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);

    // Initial tick
    if (onTick) {
      onTick(remaining);
    }
  });
}

/**
 * Handles rate limit by waiting with a countdown display.
 * Impure function - has side effects (logging, waiting).
 *
 * @param output - The rate limit error output
 * @returns Promise that resolves when ready to retry
 */
export async function handleRateLimit(output: string): Promise<void> {
  const waitMs = extractWaitTime(output) ?? DEFAULT_RATE_LIMIT_WAIT_MS;
  const waitSeconds = Math.ceil(waitMs / 1000);

  logger.warn(`Rate limit hit. Waiting ${waitSeconds} seconds before retrying...`);

  await waitWithCountdown({
    waitMs,
    onTick: (remaining) => {
      // Use carriage return to update same line
      process.stdout.write(`\r⏳ Waiting: ${remaining}s remaining...`);
    },
  });

  // Clear the countdown line
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  logger.info('Resuming execution...');
}

/**
 * Formats wait time for display.
 * Pure function - no side effects.
 *
 * @param ms - Time in milliseconds
 * @returns Human-readable time string
 */
export function formatWaitTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}
