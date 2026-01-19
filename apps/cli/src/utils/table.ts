import chalk from 'chalk';

export interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface TableOptions {
  columns: TableColumn[];
  padding?: number;
}

function padString(str: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padAmount = Math.max(0, width - stripped.length);

  switch (align) {
    case 'right':
      return ' '.repeat(padAmount) + str;
    case 'center': {
      const leftPad = Math.floor(padAmount / 2);
      const rightPad = padAmount - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    default:
      return str + ' '.repeat(padAmount);
  }
}

function truncateString(str: string, maxWidth: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (stripped.length <= maxWidth) return str;
  return stripped.slice(0, maxWidth - 3) + '...';
}

export function createTable(options: TableOptions): {
  addRow: (cells: string[]) => void;
  render: () => string;
} {
  const { columns, padding = 2 } = options;
  const rows: string[][] = [];
  const separator = ' '.repeat(padding);

  return {
    addRow(cells: string[]): void {
      rows.push(cells);
    },
    render(): string {
      const lines: string[] = [];
      const headerLine = columns
        .map((col) => padString(chalk.bold(col.header), col.width, col.align))
        .join(separator);
      lines.push(headerLine);
      lines.push(columns.map((col) => chalk.gray('-'.repeat(col.width))).join(separator));

      for (const row of rows) {
        const rowLine = columns
          .map((col, colIndex) => {
            const cell = row[colIndex] ?? '';
            return padString(truncateString(cell, col.width), col.width, col.align);
          })
          .join(separator);
        lines.push(rowLine);
      }

      return lines.join('\n');
    },
  };
}

function formatPriority(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'urgent': return chalk.red(priority);
    case 'high': return chalk.yellow(priority);
    case 'medium': return chalk.blue(priority);
    default: return chalk.gray(priority);
  }
}

export function formatIssueTable(
  issues: Array<{ identifier: string; title: string; priority: string; state: string }>
): string {
  const table = createTable({
    columns: [
      { header: 'ID', width: 12 },
      { header: 'Title', width: 50 },
      { header: 'Priority', width: 12 },
      { header: 'State', width: 15 },
    ],
  });

  for (const issue of issues) {
    table.addRow([chalk.cyan(issue.identifier), issue.title, formatPriority(issue.priority), issue.state]);
  }

  return table.render();
}
