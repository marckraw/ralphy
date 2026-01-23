/**
 * Status command - displays comprehensive status information about the Ralphy CLI environment.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { execa } from 'execa';
import { loadConfigV2, isInitialized } from '../services/config/manager.js';
import { getHistoryDir } from '../services/config/paths.js';
import { isClaudeAvailable } from '../services/claude/executor.js';
import {
  createTicketService,
  logger,
  isLinearProvider,
  type RalphyConfigV2,
  type Result,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';

// ============ Types ============

export type RunStatus = 'completed' | 'max_iterations' | 'error';

export const HistoryRunSchema = z.object({
  identifier: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['completed', 'failed', 'in-progress']),
  iterations: z.number(),
  totalDurationMs: z.number(),
});

export type HistoryRun = z.infer<typeof HistoryRunSchema>;

export interface ConfigStatusInfo {
  initialized: boolean;
  providerType: 'linear' | 'jira' | null;
  projectName: string | null;
  teamId: string | null;
  teamName: string | null;
  projectId: string | null;
  labels: {
    candidate: string;
    ready: string;
    enriched: string;
  } | null;
  claude: {
    maxIterations: number;
    timeout: number;
    model: string;
  } | null;
}

export interface IssueStats {
  candidates: number;
  ready: number;
  enriched: number;
  error: string | null;
}

export interface HistorySummary {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  inProgressRuns: number;
  completionRate: number;
  recentRuns: HistoryRun[];
}

export interface SystemHealth {
  claudeAvailable: boolean;
  claudeVersion: string | null;
  providerConnected: boolean;
  providerError: string | null;
}

export interface StatusData {
  config: ConfigStatusInfo;
  issues: IssueStats | null;
  history: HistorySummary | null;
  health: SystemHealth;
}

export interface StatusOptions {
  json?: boolean | undefined;
}

// ============ Pure Functions ============

/**
 * Parses a history run JSON file content.
 */
export function parseHistoryRun(raw: unknown): Result<HistoryRun> {
  const result = HistoryRunSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: 'Invalid history run format',
  };
}

/**
 * Calculates history summary from an array of runs.
 */
export function calculateHistorySummary(runs: HistoryRun[], limit: number = 5): HistorySummary {
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const failedRuns = runs.filter(r => r.status === 'failed').length;
  const inProgressRuns = runs.filter(r => r.status === 'in-progress').length;
  const totalRuns = runs.length;
  const completionRate = totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0;

  // Sort by startedAt descending and take the most recent
  const sortedRuns = [...runs].sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  const recentRuns = sortedRuns.slice(0, limit);

  return {
    totalRuns,
    completedRuns,
    failedRuns,
    inProgressRuns,
    completionRate,
    recentRuns,
  };
}

/**
 * Extracts config status info from config.
 */
export function extractConfigStatus(config: RalphyConfigV2): ConfigStatusInfo {
  const providerType = config.provider.type;
  const projectName = isLinearProvider(config.provider)
    ? config.provider.config.projectName
    : config.provider.config.projectName;
  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectKey;
  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : config.provider.config.projectId;

  return {
    initialized: true,
    providerType,
    projectName,
    teamId,
    teamName: null, // Will be populated by fetching from API
    projectId,
    labels: config.labels,
    claude: config.claude,
  };
}

/**
 * Formats duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Formats a date string to relative time.
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  return 'just now';
}

/**
 * Formats status symbol and color.
 */
export function formatStatusSymbol(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'in-progress':
      return '⋯';
    default:
      return '?';
  }
}

/**
 * Formats the complete status output for display.
 */
export function formatStatusOutput(data: StatusData): string {
  const lines: string[] = [];

  // Header
  lines.push(logger.bold('\n═══ Ralphy Status ═══\n'));

  // Configuration Section
  lines.push(logger.bold('📋 Configuration'));
  lines.push('─'.repeat(40));

  if (!data.config.initialized) {
    lines.push(`  Status: ${logger.highlight('Not initialized')}`);
    lines.push(`  Run ${logger.formatCommand('ralphy init')} to get started.\n`);
  } else {
    lines.push(`  Status: ${logger.highlight('Initialized')}`);
    lines.push(`  Provider: ${logger.highlight(data.config.providerType ?? 'unknown')}`);
    lines.push(`  Team: ${logger.highlight(data.config.teamName ?? 'unknown')} ${logger.dim(`(${data.config.teamId ?? 'unknown'})`)}`);
    lines.push(`  Project: ${logger.highlight(data.config.projectName ?? 'unknown')} ${logger.dim(`(${data.config.projectId ?? 'unknown'})`)}`);

    if (data.config.labels) {
      lines.push(`  Labels:`);
      lines.push(`    • Candidate: ${logger.dim(data.config.labels.candidate)}`);
      lines.push(`    • Ready: ${logger.dim(data.config.labels.ready)}`);
      lines.push(`    • Enriched: ${logger.dim(data.config.labels.enriched)}`);
    }

    if (data.config.claude) {
      lines.push(`  Claude Settings:`);
      lines.push(`    • Model: ${logger.dim(data.config.claude.model)}`);
      lines.push(`    • Max Iterations: ${logger.dim(String(data.config.claude.maxIterations))}`);
      lines.push(`    • Timeout: ${logger.dim(formatDuration(data.config.claude.timeout))}`);
    }
  }

  lines.push('');

  // Issue Statistics Section
  lines.push(logger.bold('📊 Issue Statistics'));
  lines.push('─'.repeat(40));

  if (!data.issues) {
    lines.push(`  ${logger.dim('Skipped (not initialized)')}`);
  } else if (data.issues.error) {
    lines.push(`  ${logger.highlight('Error:')} ${data.issues.error}`);
  } else {
    lines.push(`  Candidates: ${logger.formatNumber(data.issues.candidates)}`);
    lines.push(`  Ready: ${logger.formatNumber(data.issues.ready)}`);
    lines.push(`  Enriched: ${logger.formatNumber(data.issues.enriched)}`);
  }

  lines.push('');

  // Execution History Section
  lines.push(logger.bold('📜 Execution History'));
  lines.push('─'.repeat(40));

  if (!data.history) {
    lines.push(`  ${logger.dim('No runs yet')}`);
  } else {
    lines.push(`  Total Runs: ${logger.formatNumber(data.history.totalRuns)}`);
    lines.push(`  Completed: ${logger.formatNumber(data.history.completedRuns)}`);
    lines.push(`  Failed: ${logger.formatNumber(data.history.failedRuns)}`);
    lines.push(`  In Progress: ${logger.formatNumber(data.history.inProgressRuns)}`);
    lines.push(`  Completion Rate: ${logger.highlight(`${data.history.completionRate.toFixed(1)}%`)}`);

    if (data.history.recentRuns.length > 0) {
      lines.push(`\n  Recent Runs:`);
      for (const run of data.history.recentRuns) {
        const symbol = formatStatusSymbol(run.status);
        const duration = formatDuration(run.totalDurationMs);
        const relTime = formatRelativeTime(run.startedAt);
        lines.push(`    ${symbol} ${logger.highlight(run.identifier)} - ${run.status} (${duration}) - ${logger.dim(relTime)}`);
      }
    }
  }

  lines.push('');

  // System Health Section
  lines.push(logger.bold('🔧 System Health'));
  lines.push('─'.repeat(40));

  const claudeStatus = data.health.claudeAvailable
    ? `Available${data.health.claudeVersion ? ` (${data.health.claudeVersion})` : ''}`
    : 'Not available';
  lines.push(`  Claude CLI: ${data.health.claudeAvailable ? logger.highlight(claudeStatus) : logger.dim(claudeStatus)}`);

  if (data.config.initialized) {
    const providerStatus = data.health.providerConnected
      ? 'Connected'
      : `Error: ${data.health.providerError ?? 'Unknown error'}`;
    lines.push(`  ${data.config.providerType === 'linear' ? 'Linear' : 'Jira'} API: ${data.health.providerConnected ? logger.highlight(providerStatus) : logger.dim(providerStatus)}`);
  }

  lines.push('');

  return lines.join('\n');
}

// ============ IO Functions ============

/**
 * Gets the Claude CLI version.
 */
async function getClaudeVersion(): Promise<string | null> {
  try {
    const result = await execa('claude', ['--version']);
    // Claude CLI typically outputs version info to stdout
    const output = result.stdout.trim();
    // Extract version number from output (format may vary)
    const match = output.match(/(\d+\.\d+\.\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    const firstLine = output.split('\n')[0];
    return firstLine ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads all history runs from the history directory.
 */
async function readHistoryRuns(cwd: string = process.cwd()): Promise<HistoryRun[]> {
  const historyDir = getHistoryDir(cwd);
  const runs: HistoryRun[] = [];

  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const runPath = path.join(historyDir, entry.name, 'run.json');
        try {
          const content = await fs.readFile(runPath, 'utf-8');
          const raw: unknown = JSON.parse(content);
          const result = parseHistoryRun(raw);
          if (result.success) {
            runs.push(result.data);
          }
        } catch {
          // Skip invalid or missing run files
        }
      }
    }
  } catch {
    // History directory doesn't exist or isn't readable
  }

  return runs;
}

/**
 * Fetches issue statistics from the ticket provider.
 */
async function fetchIssueStats(config: RalphyConfigV2): Promise<IssueStats> {
  const ticketService = createTicketService(config);

  const teamId = isLinearProvider(config.provider)
    ? config.provider.config.teamId
    : config.provider.config.projectId;

  const projectId = isLinearProvider(config.provider)
    ? config.provider.config.projectId
    : undefined;

  try {
    const [candidatesResult, readyResult, enrichedResult] = await Promise.all([
      ticketService.fetchIssuesByLabel({
        teamId,
        labelName: config.labels.candidate,
        projectId,
      }),
      ticketService.fetchIssuesByLabel({
        teamId,
        labelName: config.labels.ready,
        projectId,
      }),
      ticketService.fetchIssuesByLabel({
        teamId,
        labelName: config.labels.enriched,
        projectId,
      }),
    ]);

    return {
      candidates: candidatesResult.success ? candidatesResult.data.length : 0,
      ready: readyResult.success ? readyResult.data.length : 0,
      enriched: enrichedResult.success ? enrichedResult.data.length : 0,
      error: !candidatesResult.success || !readyResult.success || !enrichedResult.success
        ? 'Failed to fetch some issue counts'
        : null,
    };
  } catch (err) {
    return {
      candidates: 0,
      ready: 0,
      enriched: 0,
      error: err instanceof Error ? err.message : 'Unknown error fetching issues',
    };
  }
}

/**
 * Validates connection to the ticket provider.
 */
async function validateProviderConnection(config: RalphyConfigV2): Promise<{ connected: boolean; error: string | null }> {
  try {
    const ticketService = createTicketService(config);
    const result = await ticketService.validateConnection();

    if (result.success) {
      return { connected: true, error: null };
    }
    return { connected: false, error: result.error };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============ Main Command ============

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const { json = false } = options;

  logger.debug('Starting status command');

  // Check initialization status
  const initialized = await isInitialized();

  // Build status data object
  const statusData: StatusData = {
    config: {
      initialized,
      providerType: null,
      projectName: null,
      teamId: null,
      teamName: null,
      projectId: null,
      labels: null,
      claude: null,
    },
    issues: null,
    history: null,
    health: {
      claudeAvailable: false,
      claudeVersion: null,
      providerConnected: false,
      providerError: null,
    },
  };

  // Gather Claude status (always check this)
  const spinner = createSpinner('Checking system status...').start();

  statusData.health.claudeAvailable = await isClaudeAvailable();
  if (statusData.health.claudeAvailable) {
    statusData.health.claudeVersion = await getClaudeVersion();
  }

  // If initialized, gather more data
  if (initialized) {
    const configResult = await loadConfigV2();

    if (configResult.success) {
      const config = configResult.data;
      statusData.config = extractConfigStatus(config);

      // Fetch issue stats, provider validation, and team name in parallel
      spinner.text('Fetching issue statistics...');

      const ticketService = createTicketService(config);
      const [issueStats, providerStatus, teamsResult] = await Promise.all([
        fetchIssueStats(config),
        validateProviderConnection(config),
        ticketService.fetchTeams(),
      ]);

      statusData.issues = issueStats;
      statusData.health.providerConnected = providerStatus.connected;
      statusData.health.providerError = providerStatus.error;

      // Resolve team name from ID
      if (teamsResult.success && statusData.config.teamId) {
        const team = teamsResult.data.find(t => t.id === statusData.config.teamId);
        if (team) {
          statusData.config.teamName = team.name;
        }
      }
    } else {
      statusData.config.initialized = false;
      spinner.warn('Config file exists but is invalid');
    }
  }

  // Read execution history
  spinner.text('Reading execution history...');
  const historyRuns = await readHistoryRuns();

  if (historyRuns.length > 0) {
    statusData.history = calculateHistorySummary(historyRuns);
  }

  spinner.succeed('Status gathered');

  // Output
  if (json) {
    console.log(JSON.stringify(statusData, null, 2));
    return;
  }

  console.log(formatStatusOutput(statusData));
}
