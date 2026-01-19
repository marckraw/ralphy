/**
 * Cross-platform desktop notification utility.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '@ralphy/shared';

const execAsync = promisify(exec);

export interface NotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
}

async function notifyMacOS(options: NotificationOptions): Promise<void> {
  const { title, message, sound = true } = options;
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedMessage = message.replace(/"/g, '\\"');
  const soundPart = sound ? ' sound name "default"' : '';
  const script = `display notification "${escapedMessage}" with title "${escapedTitle}"${soundPart}`;
  await execAsync(`osascript -e '${script}'`);
}

async function notifyLinux(options: NotificationOptions): Promise<void> {
  const { title, message } = options;
  const escapedTitle = title.replace(/'/g, "'\\''");
  const escapedMessage = message.replace(/'/g, "'\\''");
  await execAsync(`notify-send '${escapedTitle}' '${escapedMessage}'`);
}

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
        logger.info(`[Notification] ${title}: ${message}`);
    }
  } catch {
    logger.info(`[Notification] ${title}: ${message}`);
  }
}

export async function notifySuccess(identifier: string, message?: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Complete`,
    message: message ?? 'Task completed successfully!',
    sound: true,
  });
}

export async function notifyFailure(identifier: string, error?: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Failed`,
    message: error ?? 'Task failed. Check logs for details.',
    sound: true,
  });
}

export async function notifyWarning(identifier: string, message: string): Promise<void> {
  await notify({
    title: `Ralphy: ${identifier} Warning`,
    message,
    sound: true,
  });
}
