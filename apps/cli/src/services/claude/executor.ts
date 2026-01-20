/**
 * Claude CLI executor - handles running the claude CLI command.
 */

import { execa, type ExecaError } from 'execa';
import type { Result } from '@mrck-labs/ralphy-shared';
import {
  parseStreamLine,
  extractToolActivities,
  extractStats,
  type ToolActivity,
  type ExecutionStats,
} from './stream-parser.js';

/**
 * Options for executing Claude CLI.
 */
export interface ExecuteClaudeOptions {
  prompt: string;
  model?: string | undefined;
  timeout?: number | undefined;
  /** Skip all permission prompts (dangerously-skip-permissions flag) */
  autoAccept?: boolean | undefined;
  /** Enable verbose mode with stream-json output parsing */
  verbose?: boolean | undefined;
  onStdout?: ((data: string) => void) | undefined;
  onStderr?: ((data: string) => void) | undefined;
  /** Callback for tool activity events in verbose mode */
  onToolActivity?: ((activity: ToolActivity) => void) | undefined;
  /** Callback for execution stats in verbose mode */
  onStats?: ((stats: ExecutionStats) => void) | undefined;
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
  const {
    prompt,
    model = 'sonnet',
    timeout = 300000,
    autoAccept = true,
    verbose = false,
    onStdout,
    onStderr,
    onToolActivity,
    onStats,
  } = options;
  const startTime = Date.now();

  try {
    const args = ['--print', '--model', model];

    // Add flag to skip permission prompts for autonomous operation
    if (autoAccept) {
      args.push('--dangerously-skip-permissions');
    }

    // Add verbose stream-json output format for tool activity tracking
    if (verbose) {
      args.push('--output-format', 'stream-json', '--verbose');
    }

    const subprocess = execa('claude', args, {
      input: prompt,
      timeout,
      reject: false,
    });

    let output = '';
    let lineBuffer = '';

    if (subprocess.stdout) {
      subprocess.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;

        if (verbose) {
          // Buffer and process complete JSON lines
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const event = parseStreamLine(line);
            if (event) {
              // Extract and emit tool activities
              const activities = extractToolActivities(event);
              for (const activity of activities) {
                onToolActivity?.(activity);
              }

              // Extract and emit stats
              const stats = extractStats(event);
              if (stats) {
                onStats?.(stats);
              }
            }
          }
        } else {
          onStdout?.(text);
        }
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

    // Process any remaining buffered data
    if (verbose && lineBuffer.trim()) {
      const event = parseStreamLine(lineBuffer);
      if (event) {
        const activities = extractToolActivities(event);
        for (const activity of activities) {
          onToolActivity?.(activity);
        }

        const stats = extractStats(event);
        if (stats) {
          onStats?.(stats);
        }
      }
    }

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
