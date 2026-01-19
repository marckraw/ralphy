import { describe, it, expect } from 'vitest';
import {
  buildEnrichmentPrompt,
  parseEnrichedContent,
  formatEnrichedMarkdown,
  isEnrichmentComplete,
  buildEnrichmentClaudeArgs,
  ENRICHMENT_MARKERS,
} from '../../src/services/claude/enricher.js';
import type { LinearIssue } from '../../src/types/linear.js';

const createMockIssue = (overrides: Partial<LinearIssue> = {}): LinearIssue => ({
  id: 'issue-123',
  identifier: 'PROJ-42',
  title: 'Add user authentication',
  description: 'Implement user login and registration.',
  priority: 2,
  state: {
    id: 'state-1',
    name: 'Todo',
    type: 'unstarted',
  },
  labels: [
    { id: 'label-1', name: 'ralph-candidate' },
    { id: 'label-2', name: 'feature' },
  ],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  ...overrides,
});

describe('Enricher', () => {
  describe('ENRICHMENT_MARKERS', () => {
    it('should have all required markers', () => {
      expect(ENRICHMENT_MARKERS.descriptionStart).toBe('## Description');
      expect(ENRICHMENT_MARKERS.stepsStart).toBe('## Steps');
      expect(ENRICHMENT_MARKERS.acceptanceCriteriaStart).toBe('## Acceptance Criteria');
      expect(ENRICHMENT_MARKERS.technicalNotesStart).toBe('## Technical Notes');
      expect(ENRICHMENT_MARKERS.enrichmentComplete).toBe('<enrichment>COMPLETE</enrichment>');
    });
  });

  describe('buildEnrichmentPrompt', () => {
    it('should include issue identifier and title', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('PROJ-42');
      expect(prompt).toContain('Add user authentication');
    });

    it('should include current description', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('Implement user login and registration.');
    });

    it('should handle missing description', () => {
      const issue = createMockIssue({ description: undefined });
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('_No description provided._');
    });

    it('should include priority and state', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('High');
      expect(prompt).toContain('Todo');
    });

    it('should include labels', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('ralph-candidate');
      expect(prompt).toContain('feature');
    });

    it('should include completion marker instruction', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain(ENRICHMENT_MARKERS.enrichmentComplete);
    });

    it('should include codebase context when provided', () => {
      const issue = createMockIssue();
      const context = 'This project uses React with TypeScript.';
      const prompt = buildEnrichmentPrompt(issue, context);

      expect(prompt).toContain('## Codebase Context');
      expect(prompt).toContain('This project uses React with TypeScript.');
    });

    it('should include output format instructions', () => {
      const issue = createMockIssue();
      const prompt = buildEnrichmentPrompt(issue);

      expect(prompt).toContain('## Description');
      expect(prompt).toContain('## Steps');
      expect(prompt).toContain('## Acceptance Criteria');
      expect(prompt).toContain('## Technical Notes');
    });
  });

  describe('parseEnrichedContent', () => {
    const validOutput = `
## Description
A detailed description of the user authentication feature.

## Steps
1. Create user model with email and password
2. Implement registration endpoint
3. Implement login endpoint
4. Add JWT token generation

## Acceptance Criteria
- [ ] Users can register with email and password
- [ ] Users can log in and receive a token
- [ ] Invalid credentials return an error

## Technical Notes
- Use bcrypt for password hashing
- Store tokens in localStorage
- Consider rate limiting

<enrichment>COMPLETE</enrichment>
`;

    it('should parse valid enriched output', () => {
      const result = parseEnrichedContent(validOutput);

      expect(result).not.toBeNull();
      expect(result?.description).toContain('detailed description');
    });

    it('should parse steps as numbered list', () => {
      const result = parseEnrichedContent(validOutput);

      expect(result?.steps).toHaveLength(4);
      expect(result?.steps[0]).toBe('Create user model with email and password');
      expect(result?.steps[3]).toBe('Add JWT token generation');
    });

    it('should parse acceptance criteria as checkbox list', () => {
      const result = parseEnrichedContent(validOutput);

      expect(result?.acceptanceCriteria).toHaveLength(3);
      expect(result?.acceptanceCriteria[0]).toBe('Users can register with email and password');
    });

    it('should parse technical notes as bullet list', () => {
      const result = parseEnrichedContent(validOutput);

      expect(result?.technicalNotes).toHaveLength(3);
      expect(result?.technicalNotes[0]).toBe('Use bcrypt for password hashing');
    });

    it('should return null for output without description', () => {
      const invalidOutput = 'Some random text without proper structure';
      const result = parseEnrichedContent(invalidOutput);

      expect(result).toBeNull();
    });

    it('should handle partial output', () => {
      const partialOutput = `
## Description
Just a description.

## Steps
1. First step

<enrichment>COMPLETE</enrichment>
`;
      const result = parseEnrichedContent(partialOutput);

      expect(result).not.toBeNull();
      expect(result?.steps).toHaveLength(1);
      expect(result?.acceptanceCriteria).toHaveLength(0);
      expect(result?.technicalNotes).toHaveLength(0);
    });
  });

  describe('formatEnrichedMarkdown', () => {
    const content = {
      description: 'A great feature description.',
      steps: ['First step', 'Second step', 'Third step'],
      acceptanceCriteria: ['Criterion A', 'Criterion B'],
      technicalNotes: ['Note 1', 'Note 2'],
    };

    it('should format description section', () => {
      const markdown = formatEnrichedMarkdown(content);

      expect(markdown).toContain('## Description');
      expect(markdown).toContain('A great feature description.');
    });

    it('should format steps as numbered list', () => {
      const markdown = formatEnrichedMarkdown(content);

      expect(markdown).toContain('## Steps');
      expect(markdown).toContain('1. First step');
      expect(markdown).toContain('2. Second step');
      expect(markdown).toContain('3. Third step');
    });

    it('should format acceptance criteria with checkboxes', () => {
      const markdown = formatEnrichedMarkdown(content);

      expect(markdown).toContain('## Acceptance Criteria');
      expect(markdown).toContain('- [ ] Criterion A');
      expect(markdown).toContain('- [ ] Criterion B');
    });

    it('should format technical notes as bullet list', () => {
      const markdown = formatEnrichedMarkdown(content);

      expect(markdown).toContain('## Technical Notes');
      expect(markdown).toContain('- Note 1');
      expect(markdown).toContain('- Note 2');
    });

    it('should omit empty sections', () => {
      const minimalContent = {
        description: 'Just description',
        steps: [],
        acceptanceCriteria: [],
        technicalNotes: [],
      };
      const markdown = formatEnrichedMarkdown(minimalContent);

      expect(markdown).toContain('## Description');
      expect(markdown).not.toContain('## Steps');
      expect(markdown).not.toContain('## Acceptance Criteria');
      expect(markdown).not.toContain('## Technical Notes');
    });
  });

  describe('isEnrichmentComplete', () => {
    it('should return true when completion marker is present', () => {
      const output = 'Some content\n<enrichment>COMPLETE</enrichment>\nMore content';
      expect(isEnrichmentComplete(output)).toBe(true);
    });

    it('should return false when completion marker is absent', () => {
      const output = 'Some content without the marker';
      expect(isEnrichmentComplete(output)).toBe(false);
    });

    it('should return false for empty output', () => {
      expect(isEnrichmentComplete('')).toBe(false);
    });
  });

  describe('buildEnrichmentClaudeArgs', () => {
    it('should include prompt flag and prompt', () => {
      const args = buildEnrichmentClaudeArgs('test prompt');
      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
    });

    it('should include output format', () => {
      const args = buildEnrichmentClaudeArgs('test prompt');
      expect(args).toContain('--output-format');
      expect(args).toContain('text');
    });

    it('should include model when provided', () => {
      const args = buildEnrichmentClaudeArgs('test prompt', 'opus');
      expect(args).toContain('--model');
      expect(args).toContain('opus');
    });

    it('should not include model when not provided', () => {
      const args = buildEnrichmentClaudeArgs('test prompt');
      expect(args).not.toContain('--model');
    });
  });
});
