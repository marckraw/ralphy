import path from 'node:path';
import fs from 'node:fs/promises';

export const RALPHY_DIR = '.ralphy';
export const CONFIG_FILE = 'config.json';
export const PROMPTS_DIR = 'prompts';
export const CONTEXT_DIR = 'context';
export const HISTORY_DIR = 'history';

export function getRalphyDir(cwd: string = process.cwd()): string {
  return path.join(cwd, RALPHY_DIR);
}

export function getConfigPath(cwd: string = process.cwd()): string {
  return path.join(getRalphyDir(cwd), CONFIG_FILE);
}

export function getPromptsDir(cwd: string = process.cwd()): string {
  return path.join(getRalphyDir(cwd), PROMPTS_DIR);
}

export function getContextDir(cwd: string = process.cwd()): string {
  return path.join(getRalphyDir(cwd), CONTEXT_DIR);
}

export function getHistoryDir(cwd: string = process.cwd()): string {
  return path.join(getRalphyDir(cwd), HISTORY_DIR);
}

export async function ralphyDirExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const stats = await fs.stat(getRalphyDir(cwd));
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const stats = await fs.stat(getConfigPath(cwd));
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function createRalphyStructure(cwd: string = process.cwd()): Promise<void> {
  const ralphyDir = getRalphyDir(cwd);
  await ensureDir(ralphyDir);
  await ensureDir(getPromptsDir(cwd));
  await ensureDir(getContextDir(cwd));
  await ensureDir(getHistoryDir(cwd));
}
