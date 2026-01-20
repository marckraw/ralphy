/**
 * Stream parser for Claude CLI's --output-format stream-json output.
 * Parses structured JSON events and formats them for display.
 */

import { z } from 'zod';

/**
 * Tool icons for visual clarity in verbose output.
 */
const TOOL_ICONS: Record<string, string> = {
  Bash: '💻',
  Read: '📂',
  Edit: '✏️ ',
  Write: '📝',
  Grep: '🔍',
  Glob: '📁',
  Task: '🤖',
  WebFetch: '🌐',
  WebSearch: '🔎',
  TodoWrite: '📋',
  AskQuestion: '❓',
  default: '🔧',
};

/**
 * Schema for tool use content in assistant messages.
 */
const ToolUseSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string(),
  input: z.record(z.unknown()).optional(),
});

/**
 * Schema for text content in assistant messages.
 */
const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Schema for assistant message content.
 */
const AssistantContentSchema = z.discriminatedUnion('type', [
  ToolUseSchema,
  TextContentSchema,
]);

/**
 * Schema for assistant stream events.
 */
const AssistantEventSchema = z.object({
  type: z.literal('assistant'),
  message: z.object({
    content: z.array(AssistantContentSchema).optional(),
  }),
});

/**
 * Schema for user (tool result) stream events.
 */
const UserEventSchema = z.object({
  type: z.literal('user'),
  tool_use_result: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional(),
  }).optional(),
});

/**
 * Schema for result stream events.
 */
const ResultEventSchema = z.object({
  type: z.literal('result'),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  num_turns: z.number().optional(),
});

/**
 * Schema for system stream events.
 */
const SystemEventSchema = z.object({
  type: z.literal('system'),
});

/**
 * Union of all possible stream event types.
 */
const StreamEventSchema = z.discriminatedUnion('type', [
  AssistantEventSchema,
  UserEventSchema,
  ResultEventSchema,
  SystemEventSchema,
]);

/**
 * Parsed stream event type.
 */
export type ClaudeStreamEvent = z.infer<typeof StreamEventSchema>;

/**
 * Tool activity for display.
 */
export interface ToolActivity {
  tool: string;
  input?: Record<string, unknown> | undefined;
  description?: string | undefined;
}

/**
 * Result statistics from Claude execution.
 */
export interface ExecutionStats {
  costUsd?: number | undefined;
  durationMs?: number | undefined;
  numTurns?: number | undefined;
}

/**
 * Parses a single line of stream-json output.
 *
 * @param line - The raw JSON line to parse
 * @returns Parsed event or null if parsing fails
 */
export function parseStreamLine(line: string): ClaudeStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const result = StreamEventSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts tool activities from an assistant event.
 *
 * @param event - The parsed stream event
 * @returns Array of tool activities or empty array
 */
export function extractToolActivities(event: ClaudeStreamEvent): ToolActivity[] {
  if (event.type !== 'assistant') {
    return [];
  }

  const content = event.message.content ?? [];
  const activities: ToolActivity[] = [];

  for (const item of content) {
    if (item.type === 'tool_use') {
      activities.push({
        tool: item.name,
        input: item.input,
        description: formatToolDescription(item.name, item.input),
      });
    }
  }

  return activities;
}

/**
 * Extracts execution stats from a result event.
 *
 * @param event - The parsed stream event
 * @returns Execution stats or null if not a result event
 */
export function extractStats(event: ClaudeStreamEvent): ExecutionStats | null {
  if (event.type !== 'result') {
    return null;
  }

  return {
    costUsd: event.total_cost_usd,
    durationMs: event.duration_ms,
    numTurns: event.num_turns,
  };
}

/**
 * Formats a tool description for display.
 *
 * @param tool - The tool name
 * @param input - The tool input
 * @returns Formatted description
 */
function formatToolDescription(tool: string, input?: Record<string, unknown>): string {
  if (!input) {
    return tool;
  }

  switch (tool) {
    case 'Bash': {
      const command = input['command'];
      if (typeof command === 'string') {
        // Truncate long commands
        const truncated = command.length > 60 ? command.slice(0, 57) + '...' : command;
        return truncated;
      }
      break;
    }
    case 'Read': {
      const filePath = input['file_path'];
      if (typeof filePath === 'string') {
        // Show just filename for brevity
        const filename = filePath.split('/').pop() ?? filePath;
        return filename;
      }
      break;
    }
    case 'Edit': {
      const filePath = input['file_path'];
      if (typeof filePath === 'string') {
        const filename = filePath.split('/').pop() ?? filePath;
        return filename;
      }
      break;
    }
    case 'Write': {
      const filePath = input['file_path'];
      if (typeof filePath === 'string') {
        const filename = filePath.split('/').pop() ?? filePath;
        return filename;
      }
      break;
    }
    case 'Grep': {
      const pattern = input['pattern'];
      if (typeof pattern === 'string') {
        const truncated = pattern.length > 40 ? pattern.slice(0, 37) + '...' : pattern;
        return `"${truncated}"`;
      }
      break;
    }
    case 'Glob': {
      const pattern = input['pattern'];
      if (typeof pattern === 'string') {
        return pattern;
      }
      break;
    }
    case 'Task': {
      const description = input['description'];
      if (typeof description === 'string') {
        return description;
      }
      break;
    }
    case 'WebFetch': {
      const url = input['url'];
      if (typeof url === 'string') {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname;
        } catch {
          return url.slice(0, 40);
        }
      }
      break;
    }
    case 'WebSearch': {
      const query = input['query'];
      if (typeof query === 'string') {
        const truncated = query.length > 40 ? query.slice(0, 37) + '...' : query;
        return `"${truncated}"`;
      }
      break;
    }
  }

  return '';
}

/**
 * Gets the icon for a tool.
 *
 * @param tool - The tool name
 * @returns The icon string
 */
export function getToolIcon(tool: string): string {
  return TOOL_ICONS[tool] ?? TOOL_ICONS['default'] ?? '🔧';
}

/**
 * Formats a tool activity for display.
 *
 * @param activity - The tool activity
 * @returns Formatted string for display
 */
export function formatToolActivity(activity: ToolActivity): string {
  const icon = getToolIcon(activity.tool);
  const description = activity.description ? `: ${activity.description}` : '';
  return `${icon} ${activity.tool}${description}`;
}

/**
 * Formats execution stats for display.
 *
 * @param stats - The execution stats
 * @returns Formatted string for display
 */
export function formatStats(stats: ExecutionStats): string {
  const parts: string[] = [];

  if (stats.durationMs !== undefined) {
    const seconds = Math.round(stats.durationMs / 1000);
    parts.push(`${seconds}s`);
  }

  if (stats.costUsd !== undefined) {
    parts.push(`$${stats.costUsd.toFixed(3)}`);
  }

  if (stats.numTurns !== undefined) {
    parts.push(`${stats.numTurns} turns`);
  }

  return parts.join(', ');
}
