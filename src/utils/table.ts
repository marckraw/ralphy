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
  if (stripped.length <= maxWidth) {
    return str;
  }
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

      // Header
      const headerLine = columns
        .map((col) => {
          const text = chalk.bold(col.header);
          return padString(text, col.width, col.align);
        })
        .join(separator);
      lines.push(headerLine);

      // Separator line
      const separatorLine = columns.map((col) => chalk.gray('-'.repeat(col.width))).join(separator);
      lines.push(separatorLine);

      // Data rows
      for (const row of rows) {
        const rowLine = columns
          .map((col, colIndex) => {
            const cell = row[colIndex] ?? '';
            const truncated = truncateString(cell, col.width);
            return padString(truncated, col.width, col.align);
          })
          .join(separator);
        lines.push(rowLine);
      }

      return lines.join('\n');
    },
  };
}

export function formatIssueTable(
  issues: Array<{
    identifier: string;
    title: string;
    priority: string;
    state: string;
  }>
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
    table.addRow([
      chalk.cyan(issue.identifier),
      issue.title,
      formatPriority(issue.priority),
      issue.state,
    ]);
  }

  return table.render();
}

function formatPriority(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return chalk.red(priority);
    case 'high':
      return chalk.yellow(priority);
    case 'medium':
      return chalk.blue(priority);
    case 'low':
      return chalk.gray(priority);
    default:
      return chalk.gray(priority);
  }
}

export function formatProjectTable(
  projects: Array<{
    name: string;
    state: string;
    description?: string;
  }>
): string {
  const table = createTable({
    columns: [
      { header: 'Name', width: 30 },
      { header: 'State', width: 15 },
      { header: 'Description', width: 40 },
    ],
  });

  for (const project of projects) {
    table.addRow([chalk.cyan(project.name), project.state, project.description ?? '']);
  }

  return table.render();
}
