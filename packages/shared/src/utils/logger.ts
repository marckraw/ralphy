import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export function debug(message: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.log(chalk.gray(`[debug] ${message}`), ...args);
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(message, ...args);
  }
}

export function success(message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(chalk.green(message), ...args);
  }
}

export function warn(message: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.log(chalk.yellow(`Warning: ${message}`), ...args);
  }
}

export function error(message: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(chalk.red(`Error: ${message}`), ...args);
  }
}

export function highlight(text: string): string {
  return chalk.yellowBright(text);
}

export function dim(text: string): string {
  return chalk.gray(text);
}

export function bold(text: string): string {
  return chalk.bold(text);
}

export function formatCommand(command: string): string {
  return chalk.cyanBright.bold(command);
}

export function formatPath(path: string): string {
  return chalk.yellow(path);
}

export function formatNumber(num: number): string {
  return chalk.magenta(String(num));
}

export const logger = {
  debug,
  info,
  success,
  warn,
  error,
  highlight,
  dim,
  bold,
  formatCommand,
  formatPath,
  formatNumber,
  setLogLevel,
  getLogLevel,
};
