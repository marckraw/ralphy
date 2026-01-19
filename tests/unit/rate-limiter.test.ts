import { describe, it, expect } from 'vitest';
import {
  extractWaitTime,
  formatWaitTime,
  DEFAULT_RATE_LIMIT_WAIT_MS,
} from '../../src/services/claude/rate-limiter.js';

describe('Rate Limiter', () => {
  describe('DEFAULT_RATE_LIMIT_WAIT_MS', () => {
    it('should be 5 minutes in milliseconds', () => {
      expect(DEFAULT_RATE_LIMIT_WAIT_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('extractWaitTime', () => {
    it('should extract wait time from "try again in X seconds"', () => {
      expect(extractWaitTime('Please try again in 30 seconds')).toBe(30000);
      expect(extractWaitTime('try again in 60 seconds')).toBe(60000);
    });

    it('should extract wait time from "wait X seconds"', () => {
      expect(extractWaitTime('Please wait 45 seconds')).toBe(45000);
      expect(extractWaitTime('wait 120 seconds')).toBe(120000);
    });

    it('should extract wait time from "X seconds remaining"', () => {
      expect(extractWaitTime('Rate limit: 90 seconds remaining')).toBe(90000);
    });

    it('should extract wait time from "retry after X"', () => {
      expect(extractWaitTime('Retry after 15')).toBe(15000);
    });

    it('should handle singular "second"', () => {
      expect(extractWaitTime('try again in 1 second')).toBe(1000);
    });

    it('should return null when no wait time found', () => {
      expect(extractWaitTime('Rate limit exceeded')).toBeNull();
      expect(extractWaitTime('Too many requests')).toBeNull();
      expect(extractWaitTime('')).toBeNull();
    });

    it('should return null for zero or negative times', () => {
      expect(extractWaitTime('try again in 0 seconds')).toBeNull();
    });
  });

  describe('formatWaitTime', () => {
    it('should format seconds only', () => {
      expect(formatWaitTime(30000)).toBe('30 seconds');
      expect(formatWaitTime(1000)).toBe('1 second');
      expect(formatWaitTime(45000)).toBe('45 seconds');
    });

    it('should format minutes only', () => {
      expect(formatWaitTime(60000)).toBe('1 minute');
      expect(formatWaitTime(120000)).toBe('2 minutes');
      expect(formatWaitTime(300000)).toBe('5 minutes');
    });

    it('should format minutes and seconds', () => {
      expect(formatWaitTime(90000)).toBe('1m 30s');
      expect(formatWaitTime(150000)).toBe('2m 30s');
    });

    it('should round up partial seconds', () => {
      expect(formatWaitTime(1500)).toBe('2 seconds');
      expect(formatWaitTime(61500)).toBe('1m 2s');
    });
  });
});
