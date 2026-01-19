/**
 * Claude CLI executor - handles running the claude CLI command.
 */

import { execa, type ExecaError } from 'execa';
import type { Result } from '@ralphy/shared';

/**
 * Options for executing Claude CLI.
 */
export interface ExecuteClaudeOptions {
  prompt: string;
  model?: string;
  timeout?: number;
  /** Skip all permission prompts (dangerously-skip-permissions flag) */
  autoAccept?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Result of executing Claude CLI.
 */
export interface ExecuteClaudeResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Checks if the Claude CLI is available.
 */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    await execa('claude', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes the Claude CLI with the given options.
 */
export async function executeClaude(
  options: ExecuteClaudeOptions
): Promise<Result<ExecuteClaudeResult>> {
  const { prompt, model = 'sonnet', timeout = 300000, autoAccept = true, onStdout, onStderr } = options;
  const startTime = Date.now();

  try {
    const args = ['--print', '--model', model];

    // Add flag to skip permission prompts for autonomous operation
    if (autoAccept) {
      args.push('--dangerously-skip-permissions');
    }

    const subprocess = execa('claude', args, {
      input: prompt,
      timeout,
      reject: false,
    });

    let output = '';

    if (subprocess.stdout) {
      subprocess.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        onStdout?.(text);
      });
    }

    if (subprocess.stderr) {
      subprocess.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        onStderr?.(text);
      });
    }

    const result = await subprocess;
    const durationMs = Date.now() - startTime;

    // If no streaming output was captured, use the final stdout
    if (!output && result.stdout) {
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
    const execaErr = err as ExecaError;

    // Check if it was a timeout
    if (execaErr.timedOut) {
      return {
        success: false,
        error: `Claude execution timed out after ${timeout / 1000}s`,
      };
    }

    // Check if it was cancelled/killed (signal is present when process was killed)
    if (execaErr.signal) {
      return {
        success: false,
        error: `Claude execution was killed (${execaErr.signal})`,
      };
    }

    // Return the error with any output that was captured
    return {
      success: false,
      error: `Claude execution failed: ${execaErr.message}`,
    };
  }
}
