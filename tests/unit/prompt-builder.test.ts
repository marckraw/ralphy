import { describe, it, expect } from 'vitest';
import {
  buildTaskFileContent,
  buildInitialProgressContent,
  buildPrompt,
  buildClaudeArgs,
} from '../../src/services/claude/prompt-builder.js';
import { COMPLETION_MARKER } from '../../src/services/claude/completion.js';
import type { LinearIssue } from '../../src/types/linear.js';

const createMockIssue = (overrides: Partial<LinearIssue> = {}): LinearIssue => ({
  id: 'issue-123',
  identifier: 'PROJ-42',
  title: 'Fix the bug',
  description: 'A detailed description of the bug.',
  priority: 2,
  state: {
    id: 'state-1',
    name: 'In Progress',
    type: 'started',
  },
  labels: [
    { id: 'label-1', name: 'ralph-ready' },
    { id: 'label-2', name: 'bug' },
  ],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  ...overrides,
});

describe('Prompt Builder', () => {
  describe('buildTaskFileContent', () => {
    it('should include issue identifier and title', () => {
      const issue = createMockIssue();
      const content = buildTaskFileContent(issue);

      expect(content).toContain('# Task: PROJ-42');
      expect(content).toContain('Fix the bug');
    });

    it('should include description', () => {
      const issue = createMockIssue();
      const content = buildTaskFileContent(issue);

      expect(content).toContain('## Description');
      expect(content).toContain('A detailed description of the bug.');
    });

    it('should handle missing description', () => {
      const issue = createMockIssue({ description: undefined });
      const content = buildTaskFileContent(issue);

      expect(content).toContain('No description provided.');
    });

    it('should include state', () => {
      const issue = createMockIssue();
      const content = buildTaskFileContent(issue);

      expect(content).toContain('## State');
      expect(content).toContain('In Progress');
    });

    it('should include priority', () => {
      const issue = createMockIssue();
      const content = buildTaskFileContent(issue);

      expect(content).toContain('## Priority');
      expect(content).toContain('High');
    });

    it('should include labels', () => {
      const issue = createMockIssue();
      const content = buildTaskFileContent(issue);

      expect(content).toContain('## Labels');
      expect(content).toContain('- ralph-ready');
      expect(content).toContain('- bug');
    });

    it('should handle empty labels', () => {
      const issue = createMockIssue({ labels: [] });
      const content = buildTaskFileContent(issue);

      expect(content).toContain('No labels');
    });

    it('should format all priority levels correctly', () => {
      expect(buildTaskFileContent(createMockIssue({ priority: 0 }))).toContain('No priority');
      expect(buildTaskFileContent(createMockIssue({ priority: 1 }))).toContain('Urgent');
      expect(buildTaskFileContent(createMockIssue({ priority: 2 }))).toContain('High');
      expect(buildTaskFileContent(createMockIssue({ priority: 3 }))).toContain('Medium');
      expect(buildTaskFileContent(createMockIssue({ priority: 4 }))).toContain('Low');
      expect(buildTaskFileContent(createMockIssue({ priority: 99 }))).toContain('Unknown');
    });
  });

  describe('buildInitialProgressContent', () => {
    it('should include issue identifier', () => {
      const issue = createMockIssue();
      const content = buildInitialProgressContent(issue);

      expect(content).toContain('# Progress: PROJ-42');
    });

    it('should include timestamp', () => {
      const issue = createMockIssue();
      const content = buildInitialProgressContent(issue);

      expect(content).toContain('Started:');
      // Should contain ISO date format
      expect(content).toMatch(/Started: \d{4}-\d{2}-\d{2}T/);
    });

    it('should include notes section', () => {
      const issue = createMockIssue();
      const content = buildInitialProgressContent(issue);

      expect(content).toContain('## Notes');
      expect(content).toContain('Add your progress notes below this line.');
    });
  });

  describe('buildPrompt', () => {
    const defaultOptions = {
      issue: createMockIssue(),
      iteration: 1,
      maxIterations: 10,
      progressFilePath: '.ralphy/context/progress.md',
      taskFilePath: '.ralphy/context/task.md',
    };

    it('should include task identifier and title', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain('# Task: PROJ-42 - Fix the bug');
    });

    it('should include iteration info', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain('**Iteration 1 of 10**');
    });

    it('should include context file references', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain('@.ralphy/context/task.md');
      expect(prompt).toContain('@.ralphy/context/progress.md');
    });

    it('should include description', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain('A detailed description of the bug.');
    });

    it('should include completion marker instruction', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain(COMPLETION_MARKER);
    });

    it('should include testing instructions', () => {
      const prompt = buildPrompt(defaultOptions);

      expect(prompt).toContain('npm test');
      expect(prompt).toContain('npm run typecheck');
    });
  });

  describe('buildClaudeArgs', () => {
    it('should include permission mode', () => {
      const args = buildClaudeArgs('test prompt');

      expect(args).toContain('--permission-mode');
      expect(args).toContain('acceptEdits');
    });

    it('should include prompt flag and prompt', () => {
      const args = buildClaudeArgs('test prompt');

      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
    });

    it('should include output format', () => {
      const args = buildClaudeArgs('test prompt');

      expect(args).toContain('--output-format');
      expect(args).toContain('text');
    });

    it('should return correct argument order', () => {
      const args = buildClaudeArgs('test prompt');

      expect(args).toEqual([
        '--permission-mode',
        'acceptEdits',
        '-p',
        'test prompt',
        '--output-format',
        'text',
      ]);
    });
  });
});
