/**
 * GitHub API integration for editing existing repositories.
 * 
 * This module provides functions to:
 * - Exchange OAuth codes for access tokens
 * - List user's GitHub App installations
 * - List repositories accessible through an installation
 * - Load keyboard configuration from a repository
 * - Commit and push changes to a repository
 * 
 * Uses the official Octokit library for GitHub API interactions.
 */

import { Octokit } from 'octokit';
import { SHIELD_WIZARD_CONFIG_PATH, PRESERVED_PATHS } from './templating';
import type { Keyboard, VirtualTextFolder } from '../typedef';
import { KeyboardSchema } from '../typedef';

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/access_token';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

/**
 * Represents a GitHub App installation for a user/organization.
 */
export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    avatar_url: string;
    type: 'User' | 'Organization';
  };
  repository_selection: 'all' | 'selected';
  html_url: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }

  static isRateLimited(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 403;
  }

  static isUnauthorized(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 401;
  }

  static isNotFound(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 404;
  }
}

/**
 * Create an Octokit instance with the given access token.
 */
function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

/**
 * Type guard to check if an error has the expected shape from Octokit.
 */
function isOctokitError(error: unknown): error is { status: number; message?: string; response?: unknown } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Convert Octokit errors to GitHubApiError for consistent error handling.
 * Also logs detailed error information for debugging purposes.
 */
function handleOctokitError(error: unknown, defaultMessage: string): never {
  // Log detailed error information for debugging
  console.error('[GitHub API Error]', defaultMessage, {
    error,
    type: error?.constructor?.name,
    message: isOctokitError(error) ? error.message : undefined,
    status: isOctokitError(error) ? error.status : undefined,
    response: isOctokitError(error) ? error.response : undefined,
  });

  if (isOctokitError(error)) {
    const message = error.message ? String(error.message) : defaultMessage;
    throw new GitHubApiError(message, error.status, error);
  }
  throw new GitHubApiError(defaultMessage, 500, error);
}

/**
 * Exchange an OAuth authorization code for an access token.
 * Note: This uses fetch directly because Octokit's OAuth app authentication
 * is designed for different use cases.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to exchange OAuth code for token',
      response.status
    );
  }

  const data = await response.json() as GitHubTokenResponse;
  
  if (data.error) {
    throw new GitHubApiError(
      data.error_description || data.error,
      400,
      data
    );
  }

  return data;
}

/**
 * Verify an access token and get the authenticated user.
 */
export async function getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.users.getAuthenticated();
    
    return {
      login: data.login,
      id: data.id,
      avatar_url: data.avatar_url,
      name: data.name,
    };
  } catch (error) {
    handleOctokitError(error, 'Failed to get authenticated user');
  }
}

/**
 * List all GitHub App installations accessible by the authenticated user.
 * 
 * This returns installations where the user has authorized the app.
 * Each installation represents an account (user or org) where the app is installed.
 */
export async function listUserInstallations(
  accessToken: string
): Promise<GitHubInstallation[]> {
  try {
    const octokit = createOctokit(accessToken);
    const installations: GitHubInstallation[] = [];
    
    // Paginate through all installations
    for await (const response of octokit.paginate.iterator(
      octokit.rest.apps.listInstallationsForAuthenticatedUser
    )) {
      for (const installation of response.data) {
        const account = installation.account;
        
        // Handle unexpected null/undefined account
        if (!account) {
          console.warn('[GitHub API] Installation', installation.id, 'has no account, skipping');
          continue;
        }
        
        // The account can be a User (SimpleUser) or an Enterprise
        // Both have id, avatar_url but they have different structures for identifying name
        // For User: login property
        // For Enterprise: name or slug property
        const accountLogin = 'login' in account ? account.login : 
                            'slug' in account ? account.slug : null;
        const accountType = 'type' in account ? 
                            (account.type as 'User' | 'Organization') : 'User';
        
        // Skip installations with missing required account data
        if (!accountLogin || !account.id) {
          console.warn('[GitHub API] Installation', installation.id, 'has incomplete account data, skipping');
          continue;
        }
        
        installations.push({
          id: installation.id,
          account: {
            login: accountLogin,
            id: account.id,
            avatar_url: account.avatar_url ?? '',
            type: accountType,
          },
          repository_selection: installation.repository_selection ?? 'selected',
          html_url: installation.html_url ?? '',
        });
      }
    }
    
    console.log('[GitHub API] Found', installations.length, 'app installations');
    return installations;
  } catch (error) {
    handleOctokitError(error, 'Failed to list app installations');
  }
}

/**
 * List repositories accessible through a specific GitHub App installation.
 * 
 * This returns only the repositories that the app has been granted access to
 * for the specified installation.
 */
export async function listInstallationRepositories(
  accessToken: string,
  installationId: number,
  page = 1,
  perPage = 30
): Promise<{ repos: GitHubRepository[]; hasMore: boolean }> {
  try {
    const octokit = createOctokit(accessToken);
    const { data, headers } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
      installation_id: installationId,
      per_page: perPage,
      page,
    });

    const repos: GitHubRepository[] = data.repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }));

    // Check the Link header for pagination
    const linkHeader = headers.link;
    const hasMore = linkHeader?.includes('rel="next"') ?? false;

    console.log('[GitHub API] Listed', repos.length, 'repos from installation', installationId);
    return { repos, hasMore };
  } catch (error) {
    handleOctokitError(error, 'Failed to list installation repositories');
  }
}

/**
 * List all repositories for the authenticated user.
 */
export async function listUserRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<{ repos: GitHubRepository[]; hasMore: boolean }> {
  try {
    const octokit = createOctokit(accessToken);
    const { data, headers } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: perPage,
      page,
    });

    const repos: GitHubRepository[] = data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }));

    // Check the Link header for pagination
    const linkHeader = headers.link;
    const hasMore = linkHeader?.includes('rel="next"') ?? false;

    return { repos, hasMore };
  } catch (error) {
    handleOctokitError(error, 'Failed to list repositories');
  }
}

/**
 * Check if a repository contains the shield-wizard.json file.
 */
export async function hasShieldWizardConfig(
  accessToken: string,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    const octokit = createOctokit(accessToken);
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path: SHIELD_WIZARD_CONFIG_PATH,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the keyboard configuration from a repository.
 */
export async function loadKeyboardConfig(
  accessToken: string,
  owner: string,
  repo: string
): Promise<{ keyboard: Keyboard; sha: string }> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: SHIELD_WIZARD_CONFIG_PATH,
    });

    // Ensure we got a file, not a directory or other content type
    if (Array.isArray(data)) {
      throw new GitHubApiError('Expected a file, got a directory', 400);
    }
    if (data.type !== 'file') {
      throw new GitHubApiError(`Expected a file, got ${data.type}`, 400);
    }

    if (data.encoding !== 'base64') {
      throw new GitHubApiError('Unexpected file encoding', 400);
    }

    // Note: atob() handles ASCII correctly. Since our JSON config only contains
    // ASCII-safe characters (keyboard names are limited to 16 bytes), this is safe.
    // For arbitrary UTF-8 content, a more robust decoder would be needed.
    const content = atob(data.content);
    const parsed = JSON.parse(content);
    
    // Validate the keyboard data
    const result = KeyboardSchema.safeParse(parsed);
    if (!result.success) {
      throw new GitHubApiError(
        'Invalid keyboard configuration in repository',
        400,
        result.error.issues
      );
    }

    return {
      keyboard: result.data,
      sha: data.sha,
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        throw new GitHubApiError(
          'Repository does not contain Shield Wizard configuration',
          404
        );
      }
    }
    handleOctokitError(error, 'Failed to load configuration');
  }
}

/**
 * Check if a path should be preserved (not overwritten).
 */
function shouldPreservePath(filePath: string): boolean {
  return PRESERVED_PATHS.some(preserved => 
    filePath === preserved || filePath.startsWith(preserved)
  );
}

/**
 * GraphQL mutation for creating a commit on a branch.
 * This is more efficient than the REST API as it performs all operations in a single request.
 */
const CREATE_COMMIT_ON_BRANCH_MUTATION = `
  mutation CreateCommitOnBranch($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
        url
      }
    }
  }
`;

/**
 * Push changes to a repository using the GraphQL createCommitOnBranch mutation.
 * 
 * This is more efficient than using the REST API because it:
 * - Performs all operations in a single request
 * - Reduces rate limiting issues (single API call vs 5+ calls)
 * - Handles all file changes atomically
 */
export async function pushChangesToRepository(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  files: VirtualTextFolder,
  commitMessage: string
): Promise<{ commitSha: string; commitUrl: string }> {
  try {
    const octokit = createOctokit(accessToken);

    // First, get the current HEAD SHA (required for expectedHeadOid)
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const expectedHeadOid = refData.object.sha;

    // Convert files to FileAddition format with base64-encoded contents
    // Filter out preserved paths that should not be overwritten
    // Use TextEncoder + btoa for proper UTF-8 to base64 encoding
    const additions = Object.entries(files)
      .filter(([path]) => !shouldPreservePath(path))
      .map(([path, content]) => ({
        path,
        // Convert UTF-8 string to base64: encode to UTF-8 bytes, then to binary string, then to base64
        contents: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
      }));

    // Execute the GraphQL mutation
    const response = await octokit.graphql<{
      createCommitOnBranch: {
        commit: {
          oid: string;
          url: string;
        };
      };
    }>(CREATE_COMMIT_ON_BRANCH_MUTATION, {
      input: {
        branch: {
          repositoryNameWithOwner: `${owner}/${repo}`,
          branchName: branch,
        },
        expectedHeadOid,
        message: {
          headline: commitMessage,
        },
        fileChanges: {
          additions,
        },
      },
    });

    return {
      commitSha: response.createCommitOnBranch.commit.oid,
      commitUrl: response.createCommitOnBranch.commit.url,
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }
    handleOctokitError(error, 'Failed to push changes to repository');
  }
}

/**
 * Get repository information.
 */
export async function getRepository(
  accessToken: string,
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      private: data.private,
      description: data.description,
      html_url: data.html_url,
      default_branch: data.default_branch,
      owner: {
        login: data.owner.login,
        avatar_url: data.owner.avatar_url,
      },
    };
  } catch (error) {
    handleOctokitError(error, 'Failed to get repository');
  }
}
