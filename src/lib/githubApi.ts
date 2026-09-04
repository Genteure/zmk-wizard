// ─────────────────────────────────────────────────────────────
// GitHub API client for editing existing repositories
//
// Server-only. Uses plain `fetch` so there is no framework dependency
// and no client bundle cost. Auth is the GitHub App user-to-server
// token from the stateless session cookie (see githubSession.ts).
//
// API reference:
//   https://docs.github.com/en/rest
//   https://docs.github.com/en/graphql
// ─────────────────────────────────────────────────────────────

import { SHIELD_WIZARD_DATA_FILE } from './dataFormat';
import { githubFileAdditions, githubFileDeletions } from './githubPolicy';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export class GithubApiError extends Error {
  override name = 'GithubApiError';

  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }

  static isUnauthorized(error: unknown): error is GithubApiError {
    return error instanceof GithubApiError && error.status === 401;
  }

  static isNotFound(error: unknown): error is GithubApiError {
    return error instanceof GithubApiError && error.status === 404;
  }

  static isRateLimited(error: unknown): error is GithubApiError {
    return error instanceof GithubApiError && error.status === 403;
  }
}

export interface GithubUser {
  login: string;
  id: number;
  avatarUrl: string;
  name: string | null;
}

export interface GithubInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    avatarUrl: string;
    type: 'User' | 'Organization';
  };
  repositorySelection: 'all' | 'selected';
  htmlUrl: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

export interface GithubRepositoryWithConfig extends GithubRepository {
  hasShieldWizardConfig: boolean;
}

export interface GithubTextFile {
  content: string;
  sha: string;
}

// ─────────────────────────────────────────────────────────────
// Base helpers
// ─────────────────────────────────────────────────────────────

interface GithubErrorBody {
  message?: string;
  documentation_url?: string;
}

async function githubFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    }
    catch {
      body = undefined;
    }
    const message = (body as GithubErrorBody | undefined)?.message
      ?? `GitHub API request failed (${response.status})`;
    console.error('[GitHub API error]', path, response.status, JSON.stringify(body));
    throw new GithubApiError(message, response.status, body);
  }

  return response.json() as Promise<T>;
}

function decodeBase64Utf8(value: string): string {
  const compact = value.replace(/\s/g, '');
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────────

export interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

/**
 * Exchange the temporary `code` from GitHub's authorization redirect
 * for a user-to-server access token. This is the web application flow
 * for a GitHub App acting as an OAuth app.
 */
export async function exchangeGithubCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<GithubTokenResponse> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const body = await response.json() as GithubTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new GithubApiError(
      body.error_description || body.error || `Failed to exchange OAuth code (${response.status})`,
      response.status,
      body,
    );
  }

  return body;
}

// ─────────────────────────────────────────────────────────────
// Read APIs
// ─────────────────────────────────────────────────────────────

export async function getGithubUser(accessToken: string): Promise<GithubUser> {
  const data = await githubFetch<{
    login: string;
    id: number;
    avatar_url: string;
    name: string | null;
  }>(accessToken, '/user');

  return {
    login: data.login,
    id: data.id,
    avatarUrl: data.avatar_url,
    name: data.name,
  };
}

export async function listGithubInstallations(
  accessToken: string,
): Promise<GithubInstallation[]> {
  const data = await githubFetch<{
    total_count: number;
    installations: Array<{
      id: number;
      account: {
        login?: string;
        id: number;
        avatar_url: string;
        type: 'User' | 'Organization';
      } | null;
      repository_selection?: 'all' | 'selected';
      html_url: string;
    }>;
  }>(accessToken, '/user/installations?per_page=100');

  return data.installations.flatMap((installation) => {
    const account = installation.account;
    if (!account?.login || !account.id) return [];
    return [{
      id: installation.id,
      account: {
        login: account.login,
        id: account.id,
        avatarUrl: account.avatar_url,
        type: account.type,
      },
      repositorySelection: installation.repository_selection ?? 'selected',
      htmlUrl: installation.html_url,
    }];
  });
}

export async function listInstallationRepositories(
  accessToken: string,
  installationId: number,
  page: number,
  perPage: number,
): Promise<{ repos: GithubRepository[]; hasMore: boolean }> {
  const data = await githubFetch<{
    total_count: number;
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      description: string | null;
      html_url: string;
      default_branch: string;
      owner: { login: string; avatar_url: string };
    }>;
  }>(
    accessToken,
    `/user/installations/${installationId}/repositories?per_page=${perPage}&page=${page}`,
  );

  const repos = data.repositories.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    description: repo.description,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    owner: {
      login: repo.owner.login,
      avatarUrl: repo.owner.avatar_url,
    },
  }));

  const end = page * perPage;
  const hasMore = end < data.total_count;

  return { repos, hasMore };
}

async function repositoryHasShieldWizardData(
  accessToken: string,
  repo: GithubRepository,
): Promise<boolean> {
  try {
    await readGithubTextFile(
      accessToken,
      repo.owner.login,
      repo.name,
      SHIELD_WIZARD_DATA_FILE,
      repo.defaultBranch,
    );
    return true;
  }
  catch (error) {
    if (GithubApiError.isNotFound(error)) return false;
    throw error;
  }
}

/**
 * Annotate one page of repositories with whether they contain the
 * canonical `.shield-wizard.json` file. Checks run with bounded
 * concurrency so a page of 30 repos does not hammer the API.
 */
export async function markRepositoriesWithShieldConfig(
  accessToken: string,
  repos: GithubRepository[],
): Promise<GithubRepositoryWithConfig[]> {
  const results = new Array<GithubRepositoryWithConfig>(repos.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < repos.length) {
      const index = cursor;
      cursor += 1;
      const repo = repos[index];
      results[index] = {
        ...repo,
        hasShieldWizardConfig: await repositoryHasShieldWizardData(accessToken, repo),
      };
    }
  }

  const workerCount = Math.min(4, repos.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function getGithubRepository(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<GithubRepository> {
  const data = await githubFetch<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    description: string | null;
    html_url: string;
    default_branch: string;
    owner: { login: string; avatar_url: string };
  }>(accessToken, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name,
    private: data.private,
    description: data.description,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch,
    owner: {
      login: data.owner.login,
      avatarUrl: data.owner.avatar_url,
    },
  };
}

export async function readGithubTextFile(
  accessToken: string,
  owner: string,
  repo: string,
  filePath: string,
  branch?: string,
): Promise<GithubTextFile> {
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const data = await githubFetch<{
    type: string;
    encoding: string;
    content: string;
    sha: string;
  } | Array<unknown>>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}${suffix}`,
  );

  if (Array.isArray(data) || data.type !== 'file' || data.encoding !== 'base64') {
    throw new GithubApiError(`Expected ${filePath} to be a file`, 422);
  }

  return {
    content: decodeBase64Utf8(data.content),
    sha: data.sha,
  };
}

// ─────────────────────────────────────────────────────────────
// Commit API
// ─────────────────────────────────────────────────────────────

async function getBranchHeadOid(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const data = await githubFetch<{ object: { sha: string; type: string } }>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  return data.object.sha;
}

async function getCommitTreeSha(
  accessToken: string,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<string> {
  const data = await githubFetch<{ tree: { sha: string } }>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${commitSha}`,
  );
  return data.tree.sha;
}

async function listRepositoryTreePaths(
  accessToken: string,
  owner: string,
  repo: string,
  treeSha: string,
): Promise<string[]> {
  const data = await githubFetch<{
    truncated: boolean;
    tree: Array<{ type: string; path?: string }>;
  }>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeSha}?recursive=1`,
  );

  if (data.truncated) {
    throw new GithubApiError('Repository tree is too large for Shield Wizard', 422);
  }

  return data.tree
    .filter(entry => entry.type === 'blob' && entry.path)
    .map(entry => entry.path as string);
}

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

export interface GithubCommitResult {
  commitSha: string;
  commitUrl: string;
  commitHtmlUrl: string;
}

/**
 * Replace every wizard-owned file in the repository with the freshly
 * generated versions and delete stale generated files, in one atomic
 * GraphQL mutation. `files` must be complete and already validated by
 * the caller; preserved user files are filtered out here.
 */
export async function commitRepositoryChanges(
  accessToken: string,
  params: {
    owner: string;
    repo: string;
    branch: string;
    files: Record<string, string>;
    commitMessage: string;
    /** User-modified generated files that must not be overwritten. */
    preservedPaths?: ReadonlySet<string>;
  },
): Promise<GithubCommitResult> {
  const { owner, repo, branch, files, commitMessage, preservedPaths = new Set<string>() } = params;

  const expectedHeadOid = await getBranchHeadOid(accessToken, owner, repo, branch);
  const treeSha = await getCommitTreeSha(accessToken, owner, repo, expectedHeadOid);
  const existingPaths = await listRepositoryTreePaths(accessToken, owner, repo, treeSha);

  const additions = githubFileAdditions(files, preservedPaths).map(({ path, contents }) => ({
    path,
    contents: encodeBase64Utf8(contents),
  }));
  const deletions = githubFileDeletions(existingPaths, new Set(Object.keys(files)), preservedPaths);

  if (additions.length === 0) {
    throw new GithubApiError('No generated files can be updated: all generated paths are preserved', 422);
  }

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      query: CREATE_COMMIT_ON_BRANCH_MUTATION,
      variables: {
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
            ...(deletions.length > 0 ? { deletions } : {}),
          },
        },
      },
    }),
  });

  const body = await response.json() as {
    data?: {
      createCommitOnBranch?: {
        commit?: { oid: string; url: string };
      };
    };
    errors?: Array<{ message: string }>;
  };

  const commit = body.data?.createCommitOnBranch?.commit;
  if (!response.ok || !commit) {
    const message = body.errors?.[0]?.message
      ?? `GitHub failed to create the commit (${response.status})`;
    throw new GithubApiError(message, response.ok ? 422 : response.status, body);
  }

  return {
    commitSha: commit.oid,
    commitUrl: commit.url,
    commitHtmlUrl: `https://github.com/${owner}/${repo}/commit/${commit.oid}`,
  };
}
