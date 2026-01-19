import { describe, it, expect } from 'vitest';
import { createTable, formatIssueTable, formatProjectTable } from '../../src/utils/table.js';

describe('Table Utilities', () => {
  describe('createTable', () => {
    it('should create a table with headers', () => {
      const table = createTable({
        columns: [
          { header: 'Name', width: 10 },
          { header: 'Value', width: 10 },
        ],
      });

      const output = table.render();
      expect(output).toContain('Name');
      expect(output).toContain('Value');
    });

    it('should add rows to the table', () => {
      const table = createTable({
        columns: [
          { header: 'A', width: 5 },
          { header: 'B', width: 5 },
        ],
      });

      table.addRow(['foo', 'bar']);
      table.addRow(['baz', 'qux']);

      const output = table.render();
      expect(output).toContain('foo');
      expect(output).toContain('bar');
      expect(output).toContain('baz');
      expect(output).toContain('qux');
    });

    it('should truncate long strings', () => {
      const table = createTable({
        columns: [{ header: 'Short', width: 10 }],
      });

      table.addRow(['This is a very long string that should be truncated']);

      const output = table.render();
      expect(output).toContain('...');
    });

    it('should handle empty tables', () => {
      const table = createTable({
        columns: [{ header: 'Empty', width: 10 }],
      });

      const output = table.render();
      expect(output).toContain('Empty');
      // Should have header and separator, but no data rows
      const lines = output.split('\n');
      expect(lines.length).toBe(2); // header + separator
    });

    it('should handle custom padding', () => {
      const tableWith4Padding = createTable({
        columns: [
          { header: 'A', width: 5 },
          { header: 'B', width: 5 },
        ],
        padding: 4,
      });

      tableWith4Padding.addRow(['1', '2']);
      const output = tableWith4Padding.render();
      // With padding of 4, there should be 4 spaces between columns
      expect(output).toContain('    ');
    });
  });

  describe('formatIssueTable', () => {
    it('should format issues into a table', () => {
      const issues = [
        { identifier: 'PROJ-1', title: 'First issue', priority: 'High', state: 'Open' },
        { identifier: 'PROJ-2', title: 'Second issue', priority: 'Low', state: 'Done' },
      ];

      const output = formatIssueTable(issues);
      expect(output).toContain('ID');
      expect(output).toContain('Title');
      expect(output).toContain('Priority');
      expect(output).toContain('State');
      expect(output).toContain('PROJ-1');
      expect(output).toContain('PROJ-2');
      expect(output).toContain('First issue');
    });

    it('should handle empty issues array', () => {
      const output = formatIssueTable([]);
      expect(output).toContain('ID');
      // Should still have headers
    });
  });

  describe('formatProjectTable', () => {
    it('should format projects into a table', () => {
      const projects = [
        { name: 'Project A', state: 'active', description: 'Description A' },
        { name: 'Project B', state: 'completed' },
      ];

      const output = formatProjectTable(projects);
      expect(output).toContain('Name');
      expect(output).toContain('State');
      expect(output).toContain('Description');
      expect(output).toContain('Project A');
      expect(output).toContain('Project B');
      expect(output).toContain('Description A');
    });
  });
});
