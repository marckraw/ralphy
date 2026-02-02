import inquirer from 'inquirer';
import { initializeClient, validateApiKey } from '../services/linear/client.js';
import { fetchTeams, fetchProjects } from '../services/linear/projects.js';
import { isInitialized, saveStoredConfig, loadAndResolveConfig, updateStoredConfig } from '../services/config/manager.js';
import { createRalphyStructure } from '../services/config/paths.js';
import {
  validateGitHubToken,
  validateRepoAccess,
} from '../services/github/client.js';
import {
  logger,
  createLinearConfigStored,
  createJiraConfigStored,
  ENV_VARS,
  type NormalizedTeam,
  type NormalizedProject,
  type RalphyConfigStored,
  type RalphyConfigV2,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';
import { Version3Client } from 'jira.js';

/**
 * Secrets collected during init that user needs to add to .env
 */
interface CollectedSecrets {
  LINEAR_API_KEY?: string;
  JIRA_API_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

/**
 * Prints the secrets that the user needs to add to their .env file.
 * Does NOT modify any files - user must copy/paste manually.
 */
function printEnvInstructions(secrets: CollectedSecrets): void {
  const entries = Object.entries(secrets).filter(([, value]) => value);

  if (entries.length === 0) {
    return;
  }

  logger.info('\n' + '═'.repeat(50));
  logger.info(logger.bold('⚠️  ACTION REQUIRED: Add these to your .env file'));
  logger.info('═'.repeat(50));
  logger.info('');
  logger.info('Copy the following lines to your .env file:');
  logger.info('');
  logger.info(logger.dim('─'.repeat(40)));

  for (const [key, value] of entries) {
    logger.info(`${key}=${value}`);
  }

  logger.info(logger.dim('─'.repeat(40)));
  logger.info('');
  logger.warn('Ralphy does NOT modify your .env file automatically.');
  logger.info('═'.repeat(50) + '\n');
}

type Provider = 'linear' | 'jira';

interface InitOptions {
  force?: boolean | undefined;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const { force = false } = options;

  // Check existing configuration
  const alreadyInitialized = await isInitialized();

  if (force) {
    // Force mode: full reconfiguration
    logger.info('Force mode: reconfiguring from scratch...');
    await fullInitialization();
    return;
  }

  if (!alreadyInitialized) {
    // First run: full initialization
    await fullInitialization();
    return;
  }

  // Load existing config to check what's configured
  const configResult = await loadAndResolveConfig();
  if (!configResult.success) {
    logger.error(`Failed to load config: ${configResult.error}`);
    logger.info('Run `ralphy init --force` to reconfigure.');
    return;
  }

  const config = configResult.data;

  // Check what's already configured
  const hasProvider = Boolean(config.provider);
  const hasGitHub = Boolean(config.integrations?.github);

  if (hasProvider && hasGitHub) {
    // Everything configured - show status
    showConfigurationStatus(config);
    await promptForReconfiguration(config);
    return;
  }

  if (hasProvider && !hasGitHub) {
    // Provider exists but no GitHub - offer to configure GitHub
    showConfigurationStatus(config);
    const { addGitHub } = await inquirer.prompt<{ addGitHub: boolean }>([
      {
        type: 'confirm',
        name: 'addGitHub',
        message: 'Do you want to configure GitHub integration for PR review imports?',
        default: true,
      },
    ]);

    if (addGitHub) {
      const secrets = await configureGitHubIntegration();
      if (secrets) {
        printEnvInstructions(secrets);
      }
    }
    return;
  }

  // Shouldn't reach here, but fallback to full init
  await fullInitialization();
}

/**
 * Shows the current configuration status.
 */
function showConfigurationStatus(config: RalphyConfigV2): void {
  logger.info('\nCurrent Ralphy Configuration:');
  logger.info('─'.repeat(40));

  // Provider info
  const providerType = config.provider.type;
  const providerName = providerType === 'linear' ? 'Linear' : 'Jira Cloud';
  logger.info(`Provider: ${logger.highlight(providerName)}`);

  if (providerType === 'linear') {
    logger.info(`  Project: ${logger.highlight(config.provider.config.projectName)}`);
  } else {
    logger.info(`  Project: ${logger.highlight(config.provider.config.projectName)} (${config.provider.config.projectKey})`);
    logger.info(`  Host: ${logger.dim(config.provider.config.host)}`);
  }

  // GitHub integration
  if (config.integrations?.github) {
    const gh = config.integrations.github;
    logger.info(`GitHub: ${logger.highlight(`${gh.owner}/${gh.repo}`)}`);
  } else {
    logger.info(`GitHub: ${logger.dim('Not configured')}`);
  }

  // Labels
  logger.info('\nLabels:');
  logger.info(`  Ready: ${logger.highlight(config.labels.ready)}`);
  logger.info(`  Candidate: ${logger.highlight(config.labels.candidate)}`);
  logger.info(`  Enriched: ${logger.highlight(config.labels.enriched)}`);
  logger.info(`  PR Feedback: ${logger.highlight(config.labels.prFeedback)}`);

  logger.info('─'.repeat(40));
}

/**
 * Prompts for reconfiguration options.
 */
async function promptForReconfiguration(_config: RalphyConfigV2): Promise<void> {
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Keep current configuration', value: 'keep' },
        { name: 'Reconfigure GitHub integration', value: 'github' },
        { name: 'Reconfigure everything (--force)', value: 'force' },
      ],
    },
  ]);

  switch (action) {
    case 'github': {
      const secrets = await configureGitHubIntegration();
      if (secrets) {
        printEnvInstructions(secrets);
      }
      break;
    }
    case 'force':
      await fullInitialization();
      break;
    default:
      logger.info('Configuration unchanged.');
  }
}

/**
 * Full initialization flow (provider + optionally GitHub).
 */
async function fullInitialization(): Promise<void> {
  // Select provider
  const provider = await selectProvider();

  let collectedSecrets: CollectedSecrets = {};

  if (provider === 'linear') {
    const result = await initLinear();
    if (!result) return;
    collectedSecrets = { ...collectedSecrets, ...result.secrets };
  } else {
    const result = await initJira();
    if (!result) return;
    collectedSecrets = { ...collectedSecrets, ...result.secrets };
  }

  // Offer to configure GitHub
  const { addGitHub } = await inquirer.prompt<{ addGitHub: boolean }>([
    {
      type: 'confirm',
      name: 'addGitHub',
      message: 'Do you want to configure GitHub integration for PR review imports?',
      default: false,
    },
  ]);

  if (addGitHub) {
    const githubSecrets = await configureGitHubIntegration();
    if (githubSecrets) {
      collectedSecrets = { ...collectedSecrets, ...githubSecrets };
    }
  }

  // Print all collected secrets at the end for user to add manually
  printEnvInstructions(collectedSecrets);

  printNextSteps();
}

async function selectProvider(): Promise<Provider> {
  const { provider } = await inquirer.prompt<{ provider: Provider }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your issue tracker:',
      choices: [
        { name: 'Linear', value: 'linear' },
        { name: 'Jira Cloud', value: 'jira' },
      ],
    },
  ]);

  return provider;
}

async function initLinear(): Promise<{ config: RalphyConfigStored; secrets: CollectedSecrets } | null> {
  // Get Linear API key
  const apiKeyInfo = await getLinearApiKey();
  if (!apiKeyInfo) {
    logger.error('Linear API key is required.');
    return null;
  }

  const { apiKey, isFromEnv } = apiKeyInfo;

  // Validate API key
  const validatingSpinner = createSpinner('Validating Linear API key...').start();
  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    validatingSpinner.fail('Invalid Linear API key');
    return null;
  }
  validatingSpinner.succeed('Linear API key validated');

  // Initialize client
  initializeClient(apiKey);

  // Fetch and select team
  const team = await selectLinearTeam();
  if (!team) {
    return null;
  }

  // Fetch and select project
  const project = await selectLinearProject(team.id);
  if (!project) {
    return null;
  }

  // Create directory structure and save config
  const structureSpinner = createSpinner('Creating Ralphy configuration...').start();
  await createRalphyStructure();

  // Save config WITHOUT the API key (user will add it to .env manually)
  const config = createLinearConfigStored(project.id, project.name, team.id);
  const result = await saveStoredConfig(config);
  if (!result.success) {
    structureSpinner.fail('Failed to create configuration');
    logger.error(result.error);
    return null;
  }
  structureSpinner.succeed('Ralphy configuration created');

  logger.success('\nRalphy initialized successfully!');
  logger.info(`Provider: ${logger.highlight('Linear')}`);
  logger.info(`Project: ${logger.highlight(project.name)}`);
  logger.info(`Team: ${logger.highlight(team.name)}`);

  // Collect secrets for user to add manually (if not already from env)
  const secrets: CollectedSecrets = {};
  if (!isFromEnv) {
    secrets.LINEAR_API_KEY = apiKey;
  } else {
    logger.info(`API key: ${logger.dim(`Using ${ENV_VARS.LINEAR_API_KEY} from environment`)}`);
  }

  return { config, secrets };
}

async function initJira(): Promise<{ config: RalphyConfigStored; secrets: CollectedSecrets } | null> {
  // Get Jira credentials
  const credentials = await getJiraCredentials();
  if (!credentials) {
    return null;
  }

  const { host, email, apiToken, isFromEnv } = credentials;

  // Validate credentials
  const validatingSpinner = createSpinner('Validating Jira credentials...').start();
  const client = new Version3Client({
    host,
    authentication: {
      basic: { email, apiToken },
    },
  });

  try {
    const myself = await client.myself.getCurrentUser();
    if (!myself.accountId) {
      validatingSpinner.fail('Invalid Jira credentials');
      return null;
    }
    validatingSpinner.succeed(`Jira credentials validated (${myself.displayName ?? email})`);
  } catch (err) {
    validatingSpinner.fail('Invalid Jira credentials');
    logger.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return null;
  }

  // Select project
  const project = await selectJiraProject(client);
  if (!project) {
    return null;
  }

  // Create directory structure and save config
  const structureSpinner = createSpinner('Creating Ralphy configuration...').start();
  await createRalphyStructure();

  // Save config WITHOUT the API token (user will add it to .env manually)
  const config = createJiraConfigStored(
    host,
    email,
    project.key ?? '',
    project.id,
    project.name
  );
  const result = await saveStoredConfig(config);
  if (!result.success) {
    structureSpinner.fail('Failed to create configuration');
    logger.error(result.error);
    return null;
  }
  structureSpinner.succeed('Ralphy configuration created');

  logger.success('\nRalphy initialized successfully!');
  logger.info(`Provider: ${logger.highlight('Jira Cloud')}`);
  logger.info(`Project: ${logger.highlight(project.name)} (${project.key})`);

  // Collect secrets for user to add manually (if not already from env)
  const secrets: CollectedSecrets = {};
  if (!isFromEnv) {
    secrets.JIRA_API_TOKEN = apiToken;
  } else {
    logger.info(`API token: ${logger.dim(`Using ${ENV_VARS.JIRA_API_TOKEN} from environment`)}`);
  }

  return { config, secrets };
}

function printNextSteps(): void {
  logger.info('\nNext steps:');
  logger.info(`  1. Add the ${logger.highlight('ralph-candidate')} label to issues you want to consider`);
  logger.info(`  2. Add the ${logger.highlight('ralph-ready')} label to issues ready for automation`);
  logger.info(`  3. Run ${logger.formatCommand('ralphy candidates')} to see candidate issues`);
  logger.info(`  4. Run ${logger.formatCommand('ralphy ready')} to see ready issues`);
}

// ============ GitHub Configuration ============

async function configureGitHubIntegration(): Promise<CollectedSecrets | null> {
  logger.info('\nConfiguring GitHub Integration...');

  // Get token
  const tokenInfo = await getGitHubToken();
  if (!tokenInfo) {
    logger.error('GitHub token is required for PR integration.');
    return null;
  }

  const { token, isFromEnv } = tokenInfo;

  // Validate token
  const validatingSpinner = createSpinner('Validating GitHub token...').start();
  const tokenResult = await validateGitHubToken(token);
  if (!tokenResult.success) {
    validatingSpinner.fail(tokenResult.error);
    return null;
  }
  validatingSpinner.succeed(`GitHub token validated (${tokenResult.data})`);

  // Get repository info
  const repoInfo = await getRepositoryInfo();
  if (!repoInfo) {
    return null;
  }

  // Validate repo access
  const repoSpinner = createSpinner(`Validating access to ${repoInfo.owner}/${repoInfo.repo}...`).start();
  const repoResult = await validateRepoAccess(token, repoInfo.owner, repoInfo.repo);
  if (!repoResult.success) {
    repoSpinner.fail(repoResult.error);
    return null;
  }
  repoSpinner.succeed(`Repository access validated`);

  // Update config
  const updateSpinner = createSpinner('Updating configuration...').start();

  // Update config WITHOUT the token (user will add it to .env manually)
  const updateResult = await updateStoredConfig({
    integrations: {
      github: {
        owner: repoInfo.owner,
        repo: repoInfo.repo,
      },
    },
  });

  if (!updateResult.success) {
    updateSpinner.fail('Failed to update configuration');
    logger.error(updateResult.error);
    return null;
  }
  updateSpinner.succeed('GitHub integration configured');

  logger.success('\nGitHub integration added!');
  logger.info(`Repository: ${logger.highlight(`${repoInfo.owner}/${repoInfo.repo}`)}`);

  // Collect secrets for user to add manually (if not already from env)
  const secrets: CollectedSecrets = {};
  if (!isFromEnv) {
    secrets.GITHUB_TOKEN = token;
  } else {
    logger.info(`Token: ${logger.dim(`Using ${ENV_VARS.GITHUB_TOKEN} from environment`)}`);
  }

  logger.info(`\nYou can now use:`);
  logger.info(`  ${logger.formatCommand('ralphy github prs')} - List PRs with review comments`);
  logger.info(`  ${logger.formatCommand('ralphy github import <pr>')} - Import PR comments as tasks`);

  return secrets;
}

interface TokenInfo {
  token: string;
  isFromEnv: boolean;
}

async function getGitHubToken(): Promise<TokenInfo | null> {
  // First check environment variable
  const envToken = process.env[ENV_VARS.GITHUB_TOKEN];
  if (envToken) {
    logger.info(`Using GitHub token from ${ENV_VARS.GITHUB_TOKEN} environment variable`);
    return { token: envToken, isFromEnv: true };
  }

  // Otherwise prompt for it
  const { token } = await inquirer.prompt<{ token: string }>([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your GitHub Personal Access Token (needs repo scope):',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'GitHub token is required';
        }
        return true;
      },
    },
  ]);

  return { token: token.trim(), isFromEnv: false };
}

interface RepositoryInfo {
  owner: string;
  repo: string;
}

async function getRepositoryInfo(): Promise<RepositoryInfo | null> {
  // Try to detect from git remote
  const detectedRepo = await detectGitHubRepo();

  if (detectedRepo) {
    const { useDetected } = await inquirer.prompt<{ useDetected: boolean }>([
      {
        type: 'confirm',
        name: 'useDetected',
        message: `Use detected repository ${detectedRepo.owner}/${detectedRepo.repo}?`,
        default: true,
      },
    ]);

    if (useDetected) {
      return detectedRepo;
    }
  }

  // Manual entry
  const answers = await inquirer.prompt<RepositoryInfo>([
    {
      type: 'input',
      name: 'owner',
      message: 'Enter the repository owner (user or organization):',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Repository owner is required';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'repo',
      message: 'Enter the repository name:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Repository name is required';
        }
        return true;
      },
    },
  ]);

  return {
    owner: answers.owner.trim(),
    repo: answers.repo.trim(),
  };
}

async function detectGitHubRepo(): Promise<RepositoryInfo | null> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin']);
    const remoteUrl = stdout.trim();

    // Parse GitHub URL formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const httpsMatch = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
    const sshMatch = /github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);

    const match = httpsMatch ?? sshMatch;
    if (match?.[1] && match?.[2]) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ============ Linear Helper Functions ============

interface ApiKeyInfo {
  apiKey: string;
  isFromEnv: boolean;
}

async function getLinearApiKey(): Promise<ApiKeyInfo | null> {
  // First check environment variable
  const envKey = process.env[ENV_VARS.LINEAR_API_KEY];
  if (envKey) {
    logger.info(`Using Linear API key from ${ENV_VARS.LINEAR_API_KEY} environment variable`);
    return { apiKey: envKey, isFromEnv: true };
  }

  // Otherwise prompt for it
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your Linear API key:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      },
    },
  ]);

  return { apiKey: apiKey.trim(), isFromEnv: false };
}

async function selectLinearTeam(): Promise<NormalizedTeam | null> {
  const spinner = createSpinner('Fetching teams...').start();
  const teamsResult = await fetchTeams();

  if (!teamsResult.success) {
    spinner.fail('Failed to fetch teams');
    logger.error(teamsResult.error);
    return null;
  }

  const teams = teamsResult.data;
  if (teams.length === 0) {
    spinner.fail('No teams found');
    logger.error('Your Linear workspace has no teams.');
    return null;
  }

  spinner.succeed(`Found ${teams.length} team(s)`);

  if (teams.length === 1) {
    const team = teams[0];
    if (team) {
      logger.info(`Using team: ${logger.highlight(team.name)}`);
      return team;
    }
  }

  const { teamId } = await inquirer.prompt<{ teamId: string }>([
    {
      type: 'list',
      name: 'teamId',
      message: 'Select a team:',
      choices: teams.map((t) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);

  const selectedTeam = teams.find((t) => t.id === teamId);
  return selectedTeam ?? null;
}

async function selectLinearProject(teamId: string): Promise<NormalizedProject | null> {
  const spinner = createSpinner('Fetching projects...').start();
  const projectsResult = await fetchProjects(teamId);

  if (!projectsResult.success) {
    spinner.fail('Failed to fetch projects');
    logger.error(projectsResult.error);
    return null;
  }

  const projects = projectsResult.data;
  if (projects.length === 0) {
    spinner.fail('No projects found');
    logger.error('The selected team has no projects. Create a project in Linear first.');
    return null;
  }

  spinner.succeed(`Found ${projects.length} project(s)`);

  const { projectId } = await inquirer.prompt<{ projectId: string }>([
    {
      type: 'list',
      name: 'projectId',
      message: 'Select a project:',
      choices: projects.map((p) => ({
        name: p.name,
        value: p.id,
      })),
    },
  ]);

  const selectedProject = projects.find((p) => p.id === projectId);
  return selectedProject ?? null;
}

// ============ Jira Helper Functions ============

interface JiraCredentials {
  host: string;
  email: string;
  apiToken: string;
  isFromEnv: boolean;
}

async function getJiraCredentials(): Promise<JiraCredentials | null> {
  // Check environment variables first
  const envHost = process.env['JIRA_HOST'];
  const envEmail = process.env['JIRA_EMAIL'];
  const envToken = process.env[ENV_VARS.JIRA_API_TOKEN];

  if (envHost && envEmail && envToken) {
    logger.info('Using Jira credentials from environment variables');
    return { host: envHost, email: envEmail, apiToken: envToken, isFromEnv: true };
  }

  // Prompt for credentials
  const answers = await inquirer.prompt<{ host: string; email: string; apiToken: string }>([
    {
      type: 'input',
      name: 'host',
      message: 'Enter your Jira Cloud host URL (e.g., https://company.atlassian.net):',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Host URL is required';
        }
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      },
      filter: (input: string) => input.trim().replace(/\/$/, ''), // Remove trailing slash
    },
    {
      type: 'input',
      name: 'email',
      message: 'Enter your Atlassian account email:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Email is required';
        }
        if (!input.includes('@')) {
          return 'Please enter a valid email address';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'apiToken',
      message: 'Enter your Jira API token (from https://id.atlassian.com/manage-profile/security/api-tokens):',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API token is required';
        }
        return true;
      },
    },
  ]);

  return { ...answers, isFromEnv: false };
}

async function selectJiraProject(client: Version3Client): Promise<NormalizedProject | null> {
  const spinner = createSpinner('Fetching projects...').start();

  try {
    const projects = await client.projects.searchProjects();
    const projectList = projects.values ?? [];

    if (projectList.length === 0) {
      spinner.fail('No projects found');
      logger.error('No Jira projects found. Make sure you have access to at least one project.');
      return null;
    }

    spinner.succeed(`Found ${projectList.length} project(s)`);

    const { projectId } = await inquirer.prompt<{ projectId: string }>([
      {
        type: 'list',
        name: 'projectId',
        message: 'Select a project:',
        choices: projectList.map((p) => ({
          name: `${p.name} (${p.key})`,
          value: p.id,
        })),
      },
    ]);

    const selectedProject = projectList.find((p) => p.id === projectId);
    if (!selectedProject) {
      return null;
    }

    return {
      id: selectedProject.id ?? '',
      name: selectedProject.name ?? '',
      key: selectedProject.key ?? undefined,
      description: undefined,
    };
  } catch (err) {
    spinner.fail('Failed to fetch projects');
    logger.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return null;
  }
}
