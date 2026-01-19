import { z } from 'zod';

const RepoConfigSchema = z.object({
  jiraProjectKey: z.string(),
  repoUrl: z.string(),
  localPath: z.string(),
  defaultBranch: z.string().default('main'),
});

const ConfigSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  jira: z.object({
    host: z.string().url(),
    email: z.string().email(),
    apiToken: z.string().min(1),
    ralphyUserId: z.string().optional(),
  }),
  github: z.object({
    token: z.string().min(1),
  }),
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
  }),
  repos: z.array(RepoConfigSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export function loadConfig(): Config {
  const reposJson = process.env['REPOS_CONFIG'];
  let repos: unknown[] = [];

  if (reposJson) {
    try {
      repos = JSON.parse(reposJson) as unknown[];
    } catch {
      console.error('Failed to parse REPOS_CONFIG JSON');
    }
  }

  const raw = {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    jira: {
      host: process.env['JIRA_HOST'] ?? '',
      email: process.env['JIRA_EMAIL'] ?? '',
      apiToken: process.env['JIRA_API_TOKEN'] ?? '',
      ralphyUserId: process.env['RALPHY_JIRA_USER_ID'],
    },
    github: {
      token: process.env['GITHUB_TOKEN'] ?? '',
    },
    redis: {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    },
    repos,
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    throw new Error('Invalid configuration');
  }

  return result.data;
}
