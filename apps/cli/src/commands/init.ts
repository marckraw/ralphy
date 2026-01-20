import inquirer from 'inquirer';
import { initializeClient, validateApiKey } from '../services/linear/client.js';
import { fetchTeams, fetchProjects } from '../services/linear/projects.js';
import { isInitialized, saveConfigV2 } from '../services/config/manager.js';
import { createRalphyStructure } from '../services/config/paths.js';
import {
  logger,
  createLinearConfigV2,
  createJiraConfigV2,
  type NormalizedTeam,
  type NormalizedProject,
} from '@mrck-labs/ralphy-shared';
import { createSpinner } from '../utils/spinner.js';
import { Version3Client } from 'jira.js';

type Provider = 'linear' | 'jira';

interface InitOptions {
  force?: boolean | undefined;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const { force = false } = options;

  // Check if already initialized
  const alreadyInitialized = await isInitialized();
  if (alreadyInitialized && !force) {
    logger.warn('Ralphy is already initialized in this directory.');
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to reinitialize? This will overwrite existing configuration.',
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Initialization cancelled.');
      return;
    }
  }

  // Select provider
  const provider = await selectProvider();

  if (provider === 'linear') {
    await initLinear();
  } else {
    await initJira();
  }
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

async function initLinear(): Promise<void> {
  // Get Linear API key
  const apiKey = await getLinearApiKey();
  if (!apiKey) {
    logger.error('Linear API key is required.');
    return;
  }

  // Validate API key
  const validatingSpinner = createSpinner('Validating Linear API key...').start();
  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    validatingSpinner.fail('Invalid Linear API key');
    return;
  }
  validatingSpinner.succeed('Linear API key validated');

  // Initialize client
  initializeClient(apiKey);

  // Fetch and select team
  const team = await selectLinearTeam();
  if (!team) {
    return;
  }

  // Fetch and select project
  const project = await selectLinearProject(team.id);
  if (!project) {
    return;
  }

  // Create directory structure and save config
  const structureSpinner = createSpinner('Creating Ralphy configuration...').start();
  await createRalphyStructure();

  const config = createLinearConfigV2(apiKey, project.id, project.name, team.id);
  const result = await saveConfigV2(config);
  if (!result.success) {
    structureSpinner.fail('Failed to create configuration');
    logger.error(result.error);
    return;
  }
  structureSpinner.succeed('Ralphy configuration created');

  logger.success('\nRalphy initialized successfully!');
  logger.info(`Provider: ${logger.highlight('Linear')}`);
  logger.info(`Project: ${logger.highlight(project.name)}`);
  logger.info(`Team: ${logger.highlight(team.name)}`);
  printNextSteps();
}

async function initJira(): Promise<void> {
  // Get Jira credentials
  const credentials = await getJiraCredentials();
  if (!credentials) {
    return;
  }

  const { host, email, apiToken } = credentials;

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
      return;
    }
    validatingSpinner.succeed(`Jira credentials validated (${myself.displayName ?? email})`);
  } catch (err) {
    validatingSpinner.fail('Invalid Jira credentials');
    logger.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }

  // Select project
  const project = await selectJiraProject(client);
  if (!project) {
    return;
  }

  // Create directory structure and save config
  const structureSpinner = createSpinner('Creating Ralphy configuration...').start();
  await createRalphyStructure();

  const config = createJiraConfigV2(
    host,
    email,
    apiToken,
    project.key ?? '',
    project.id,
    project.name
  );
  const result = await saveConfigV2(config);
  if (!result.success) {
    structureSpinner.fail('Failed to create configuration');
    logger.error(result.error);
    return;
  }
  structureSpinner.succeed('Ralphy configuration created');

  logger.success('\nRalphy initialized successfully!');
  logger.info(`Provider: ${logger.highlight('Jira Cloud')}`);
  logger.info(`Project: ${logger.highlight(project.name)} (${project.key})`);
  printNextSteps();
}

function printNextSteps(): void {
  logger.info('\nNext steps:');
  logger.info(`  1. Add the ${logger.highlight('ralph-candidate')} label to issues you want to consider`);
  logger.info(`  2. Add the ${logger.highlight('ralph-ready')} label to issues ready for automation`);
  logger.info(`  3. Run ${logger.formatCommand('ralphy candidates')} to see candidate issues`);
  logger.info(`  4. Run ${logger.formatCommand('ralphy ready')} to see ready issues`);
}

// ============ Linear Helper Functions ============

async function getLinearApiKey(): Promise<string | null> {
  // First check environment variable
  const envKey = process.env['LINEAR_API_KEY'];
  if (envKey) {
    logger.info('Using Linear API key from LINEAR_API_KEY environment variable');
    return envKey;
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

  return apiKey.trim();
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
}

async function getJiraCredentials(): Promise<JiraCredentials | null> {
  // Check environment variables first
  const envHost = process.env['JIRA_HOST'];
  const envEmail = process.env['JIRA_EMAIL'];
  const envToken = process.env['JIRA_API_TOKEN'];

  if (envHost && envEmail && envToken) {
    logger.info('Using Jira credentials from environment variables');
    return { host: envHost, email: envEmail, apiToken: envToken };
  }

  // Prompt for credentials
  const answers = await inquirer.prompt<JiraCredentials>([
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

  return answers;
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
