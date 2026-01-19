import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setLogLevel,
  getLogLevel,
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
} from '../../src/utils/logger.js';

describe('Logger Utilities', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('debug'); // Reset to debug to capture all logs
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should set and get log level', () => {
      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');

      setLogLevel('info');
      expect(getLogLevel()).toBe('info');
    });
  });

  describe('debug', () => {
    it('should log when level is debug', () => {
      setLogLevel('debug');
      debug('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log when level is info or higher', () => {
      setLogLevel('info');
      debug('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log when level is info or lower', () => {
      setLogLevel('info');
      info('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log when level is warn or higher', () => {
      setLogLevel('warn');
      info('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should log when level is info or lower', () => {
      setLogLevel('info');
      success('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log when level is warn or lower', () => {
      setLogLevel('warn');
      warn('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log when level is error', () => {
      setLogLevel('error');
      warn('test message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should always log at any level', () => {
      setLogLevel('error');
      error('test message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('formatting functions', () => {
    it('highlight should return a string', () => {
      const result = highlight('test');
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });

    it('dim should return a string', () => {
      const result = dim('test');
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });

    it('bold should return a string', () => {
      const result = bold('test');
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });

    it('formatCommand should return a string', () => {
      const result = formatCommand('npm test');
      expect(typeof result).toBe('string');
      expect(result).toContain('npm test');
    });

    it('formatPath should return a string', () => {
      const result = formatPath('/path/to/file');
      expect(typeof result).toBe('string');
      expect(result).toContain('/path/to/file');
    });

    it('formatNumber should return a string', () => {
      const result = formatNumber(42);
      expect(typeof result).toBe('string');
      expect(result).toContain('42');
    });
  });
});
