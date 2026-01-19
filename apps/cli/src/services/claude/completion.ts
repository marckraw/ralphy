/**
 * Pure functions for detecting task completion in Claude output.
 */

export const COMPLETION_MARKER = '<promise>DONE</promise>';
const COMPLETION_PATTERN = /<promise>DONE<\/promise>/i;

export function detectCompletion(output: string): boolean {
  return COMPLETION_PATTERN.test(output);
}

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /429/,
  /quota exceeded/i,
  /capacity/i,
];

export function detectRateLimit(output: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output));
}

const ERROR_PATTERNS = [/error:/i, /failed to/i, /cannot/i, /exception/i];

export function detectError(output: string): boolean {
  if (detectRateLimit(output)) return false;
  return ERROR_PATTERNS.some((pattern) => pattern.test(output));
}

export interface OutputAnalysis {
  isComplete: boolean;
  isRateLimited: boolean;
  hasError: boolean;
}

export function analyzeOutput(output: string): OutputAnalysis {
  return {
    isComplete: detectCompletion(output),
    isRateLimited: detectRateLimit(output),
    hasError: detectError(output),
  };
}
