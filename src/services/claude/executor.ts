/**
 * Claude Code subprocess execution.
 */

import { execa, type Options as ExecaOptions } from 'execa';
import type { Result } from '../../types/config.js';
import { buildClaudeArgs } from './prompt-builder.js';

/**
 * Result of a Claude execution.
 */
export interface ExecutionResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Options for executing Claude.
 */
export interface ExecuteOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  timeout?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Default timeout for Claude execution (5 minutes).
 */
export const DEFAULT_TIMEOUT_MS = 300000;

/**
 * Executes Claude Code with the given prompt.
 * Streams output in real-time and returns the complete result.
 *
 * @param options - Execution options
 * @returns Result with output, exit code, and duration
 */
export async function executeClaude(options: ExecuteOptions): Promise<Result<ExecutionResult>> {
  const {
    prompt,
    model,
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT_MS,
    onStdout,
    onStderr,
  } = options;

  const args = buildClaudeArgs(prompt, model);
  const startTime = Date.now();
  let output = '';

  try {
    const execaOptions: ExecaOptions = {
      cwd,
      timeout,
      reject: false, // Don't throw on non-zero exit
      stdin: 'ignore',
    };

    const subprocess = execa('claude', args, execaOptions);

    // Stream stdout
    if (subprocess.stdout) {
      subprocess.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (onStdout) {
          onStdout(text);
        }
      });
    }

    // Stream stderr
    if (subprocess.stderr) {
      subprocess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (onStderr) {
          onStderr(text);
        }
      });
    }

    const result = await subprocess;
    const durationMs = Date.now() - startTime;

    // If we didn't capture via streaming, use the result
    if (!output && result.stdout && typeof result.stdout === 'string') {
      output = result.stdout;
    }

    return {
      success: true,
      data: {
        output,
        exitCode: result.exitCode ?? 0,
        durationMs,
      },
    };
  } catch (err) {
    // Handle timeout
    if (err instanceof Error && err.message.includes('timed out')) {
      return {
        success: false,
        error: `Claude execution timed out after ${Math.round(timeout / 1000)} seconds`,
      };
    }

    // Handle other errors
    return {
      success: false,
      error: `Claude execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Checks if Claude CLI is available.
 *
 * @returns Promise that resolves to true if Claude is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    const result = await execa('claude', ['--version'], {
      timeout: 5000,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Gets Claude CLI version.
 *
 * @returns Promise with version string or error
 */
export async function getClaudeVersion(): Promise<Result<string>> {
  try {
    const result = await execa('claude', ['--version'], {
      timeout: 5000,
    });
    return {
      success: true,
      data: result.stdout.trim(),
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to get Claude version: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
