/**
 * Display and formatting helper functions.
 * Pure functions for formatting, display functions for output.
 */

import { logger } from '@mrck-labs/ralphy-shared';

/**
 * Formats duration in milliseconds to human-readable string.
 * Pure function.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string (e.g., "1h 30m" or "5m 30s")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Displays dry run mode indicator.
 */
export function displayDryRunNotice(): void {
  logger.info(logger.dim('[Dry run mode - no changes will be made]'));
  console.log('');
}

export interface SummaryStat {
  label: string;
  value: string | number;
  type?: 'default' | 'success' | 'warn' | 'error' | undefined;
}

/**
 * Displays a formatted summary section.
 *
 * @param title - The section title
 * @param stats - Array of statistics to display
 */
export function displaySummary(title: string, stats: SummaryStat[]): void {
  console.log('');
  logger.info('='.repeat(60));
  logger.info(title);
  logger.info('='.repeat(60));

  for (const stat of stats) {
    const message = `${stat.label}: ${stat.value}`;
    switch (stat.type) {
      case 'success':
        logger.success(message);
        break;
      case 'warn':
        logger.warn(message);
        break;
      case 'error':
        logger.error(message);
        break;
      default:
        logger.info(message);
    }
  }
}

/**
 * Displays a simple separator line.
 *
 * @param width - Width of the separator (default: 60)
 * @param char - Character to use for separator (default: '=')
 */
export function displaySeparator(width: number = 60, char: string = '='): void {
  console.log('');
  logger.info(char.repeat(width));
}
