/**
 * Cross-platform desktop notification utility.
 * Uses native notification systems where available.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/**
 * Notification options.
 */
export interface NotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
}

/**
 * Sends a desktop notification on macOS using osascript.
 */
async function notifyMacOS(options: NotificationOptions): Promise<void> {
  const { title, message, sound = true } = options;
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedMessage = message.replace(/"/g, '\\"');

  const soundPart = sound ? ' sound name "default"' : '';
  const script = `display notification "${escapedMessage}" with title "${escapedTitle}"${soundPart}`;

  await execAsync(`osascript -e '${script}'`);
}

/**
 * Sends a desktop notification on Linux using notify-send.
 */
async function notifyLinux(options: NotificationOptions): Promise<void> {
  const { title, message } = options;
  const escapedTitle = title.replace(/'/g, "'\\''");
  const escapedMessage = message.replace(/'/g, "'\\''");

  await execAsync(`notify-send '${escapedTitle}' '${escapedMessage}'`);
}

/**
 * Sends a desktop notification.
 * Works on macOS and Linux. Falls back to console on unsupported platforms.
 *
 * @param options - Notification options
 */
export async function notify(options: NotificationOptions): Promise<void> {
  const { title, message } = options;

  try {
    switch (process.platform) {
      case 'darwin':
        await notifyMacOS(options);
        break;
      case 'linux':
        await notifyLinux(options);
        break;
      default:
        // Fallback to console for unsupported platforms
        logger.info(`[Notification] ${title}: ${message}`);
    }
  } catch {
    // Silently fall back to console if notification fails
    logger.info(`[Notification] ${title}: ${message}`);
  }
}

/**
 * Sends a success notification.
 *
 * @param identifier - The task identifier
 * @param message - Optional additional message
 */
export async function notifySuccess(identifier: string, message?: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Complete`,
    message: message ?? 'Task completed successfully!',
    sound: true,
  });
}

/**
 * Sends a failure notification.
 *
 * @param identifier - The task identifier
 * @param error - Optional error message
 */
export async function notifyFailure(identifier: string, error?: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Failed`,
    message: error ?? 'Task failed. Check logs for details.',
    sound: true,
  });
}

/**
 * Sends a warning notification (e.g., max iterations reached).
 *
 * @param identifier - The task identifier
 * @param message - Warning message
 */
export async function notifyWarning(identifier: string, message: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Warning`,
    message,
    sound: true,
  });
}
