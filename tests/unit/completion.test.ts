import { describe, it, expect } from 'vitest';
import {
  detectCompletion,
  detectRateLimit,
  detectError,
  analyzeOutput,
  COMPLETION_MARKER,
} from '../../src/services/claude/completion.js';

describe('Completion Detection', () => {
  describe('COMPLETION_MARKER', () => {
    it('should be the expected marker string', () => {
      expect(COMPLETION_MARKER).toBe('<promise>DONE</promise>');
    });
  });

  describe('detectCompletion', () => {
    it('should detect completion marker', () => {
      const output = 'Task complete. <promise>DONE</promise>';
      expect(detectCompletion(output)).toBe(true);
    });

    it('should detect completion marker case-insensitively', () => {
      expect(detectCompletion('<PROMISE>DONE</PROMISE>')).toBe(true);
      expect(detectCompletion('<Promise>done</Promise>')).toBe(true);
    });

    it('should return false when marker is not present', () => {
      expect(detectCompletion('Task in progress...')).toBe(false);
      expect(detectCompletion('')).toBe(false);
    });

    it('should detect marker in multi-line output', () => {
      const output = `
        Working on task...
        Tests passed.
        <promise>DONE</promise>
        All complete.
      `;
      expect(detectCompletion(output)).toBe(true);
    });
  });

  describe('detectRateLimit', () => {
    it('should detect rate limit messages', () => {
      expect(detectRateLimit('Error: rate limit exceeded')).toBe(true);
      expect(detectRateLimit('Too many requests')).toBe(true);
      expect(detectRateLimit('Error 429: Too Many Requests')).toBe(true);
      expect(detectRateLimit('API quota exceeded')).toBe(true);
      expect(detectRateLimit('Over capacity, please retry')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(detectRateLimit('RATE LIMIT')).toBe(true);
      expect(detectRateLimit('Rate Limit')).toBe(true);
    });

    it('should return false for normal output', () => {
      expect(detectRateLimit('Task completed successfully')).toBe(false);
      expect(detectRateLimit('')).toBe(false);
    });
  });

  describe('detectError', () => {
    it('should detect error patterns', () => {
      expect(detectError('Error: something went wrong')).toBe(true);
      expect(detectError('Failed to compile')).toBe(true);
      expect(detectError('Cannot find module')).toBe(true);
      expect(detectError('Exception thrown')).toBe(true);
    });

    it('should not flag rate limits as errors', () => {
      expect(detectError('Error: rate limit exceeded')).toBe(false);
      expect(detectError('Too many requests')).toBe(false);
    });

    it('should return false for successful output', () => {
      expect(detectError('Tests passed')).toBe(false);
      expect(detectError('Build successful')).toBe(false);
    });
  });

  describe('analyzeOutput', () => {
    it('should analyze complete output', () => {
      const result = analyzeOutput('Done! <promise>DONE</promise>');
      expect(result.isComplete).toBe(true);
      expect(result.isRateLimited).toBe(false);
      expect(result.hasError).toBe(false);
    });

    it('should analyze rate-limited output', () => {
      const result = analyzeOutput('Error: rate limit exceeded');
      expect(result.isComplete).toBe(false);
      expect(result.isRateLimited).toBe(true);
      expect(result.hasError).toBe(false);
    });

    it('should analyze error output', () => {
      const result = analyzeOutput('Error: compilation failed');
      expect(result.isComplete).toBe(false);
      expect(result.isRateLimited).toBe(false);
      expect(result.hasError).toBe(true);
    });

    it('should analyze normal output', () => {
      const result = analyzeOutput('Working on task...');
      expect(result.isComplete).toBe(false);
      expect(result.isRateLimited).toBe(false);
      expect(result.hasError).toBe(false);
    });
  });
});
