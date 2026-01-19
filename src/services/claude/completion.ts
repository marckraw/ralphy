/**
 * Pure functions for detecting task completion in Claude output.
 */

/**
 * The completion marker that Claude should output when a task is complete.
 */
export const COMPLETION_MARKER = '<promise>DONE</promise>';

/**
 * Pattern to match the completion marker in Claude output.
 */
const COMPLETION_PATTERN = /<promise>DONE<\/promise>/i;

/**
 * Detects if Claude has signaled task completion.
 * Pure function - no side effects.
 *
 * @param output - The Claude output to check
 * @returns true if the completion marker is found
 */
export function detectCompletion(output: string): boolean {
  return COMPLETION_PATTERN.test(output);
}

/**
 * Rate limit error patterns to detect.
 */
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /429/,
  /quota exceeded/i,
  /capacity/i,
];

/**
 * Detects if Claude hit a rate limit.
 * Pure function - no side effects.
 *
 * @param output - The Claude output to check
 * @returns true if a rate limit error is detected
 */
export function detectRateLimit(output: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output));
}

/**
 * Error patterns that indicate Claude encountered a blocking error.
 */
const ERROR_PATTERNS = [
  /error:/i,
  /failed to/i,
  /cannot/i,
  /exception/i,
];

/**
 * Detects if Claude encountered a significant error.
 * Pure function - no side effects.
 *
 * @param output - The Claude output to check
 * @returns true if an error pattern is detected
 */
export function detectError(output: string): boolean {
  // Don't flag rate limits as general errors
  if (detectRateLimit(output)) {
    return false;
  }
  return ERROR_PATTERNS.some((pattern) => pattern.test(output));
}

/**
 * Result of analyzing Claude output.
 */
export interface OutputAnalysis {
  isComplete: boolean;
  isRateLimited: boolean;
  hasError: boolean;
}

/**
 * Analyzes Claude output for completion, rate limits, and errors.
 * Pure function - no side effects.
 *
 * @param output - The Claude output to analyze
 * @returns Analysis result with flags for various states
 */
export function analyzeOutput(output: string): OutputAnalysis {
  return {
    isComplete: detectCompletion(output),
    isRateLimited: detectRateLimit(output),
    hasError: detectError(output),
  };
}
