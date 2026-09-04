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
import { planFileChanges, type FilePolicy } from './filePolicy';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const GITHUB_USER_AGENT = 'shield-wizard-for-zmk';

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
  pushedAt: string | null;
  updatedAt: string;
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
  const method = init.method ?? 'GET';
  const maskedToken = `${accessToken.slice(0, 4)}…${accessToken.slice(-4)}`;
  console.log('[GitHub API request]', method, path, `token=${maskedToken}`);

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': GITHUB_USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });

  console.log(
    '[GitHub API response]',
    method,
    path,
    response.status,
    response.headers.get('content-type'),
  );

  if (!response.ok) {
    const rawText = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    }
    catch {
      body = undefined;
    }
    const message = (body as GithubErrorBody | undefined)?.message
      ?? `GitHub API request failed (${response.status})`;
    console.error(
      '[GitHub API error]',
      { method, path, status: response.status, contentType: response.headers.get('content-type'), body, rawText: rawText.slice(0, 500) },
    );
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

interface GithubGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** POST a GraphQL query to the GitHub API and return the parsed response body. */
async function githubGraphqlFetch<T>(
  accessToken: string,
  query: string,
  variables: Record<string, string>,
): Promise<GithubGraphqlResponse<T>> {
  console.log(
    '[GitHub GraphQL request]',
    `query=${query.length} bytes`,
    `variables=${Object.keys(variables).length}`,
    `token=${accessToken.slice(0, 4)}…${accessToken.slice(-4)}`,
  );

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': GITHUB_USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json() as GithubGraphqlResponse<T>;
  if (!response.ok) {
    const message = body.errors?.[0]?.message
      ?? `GitHub GraphQL request failed (${response.status})`;
    throw new GithubApiError(message, response.status, body);
  }
  return body;
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
  console.log('[GitHub OAuth] exchanging code at github.com/login/oauth/access_token');
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': GITHUB_USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  console.log(
    '[GitHub OAuth response]',
    response.status,
    response.headers.get('content-type'),
  );

  const rawText = await response.text();
  let body: GithubTokenResponse & { error?: string; error_description?: string };
  try {
    body = JSON.parse(rawText) as GithubTokenResponse & { error?: string; error_description?: string };
  }
  catch {
    console.error('[GitHub OAuth error] non-JSON response body:', rawText.slice(0, 500));
    throw new GithubApiError(`GitHub OAuth returned a non-JSON response (${response.status})`, response.status, rawText);
  }

  if (!response.ok || !body.access_token) {
    console.error('[GitHub OAuth error]', { status: response.status, body });
    throw new GithubApiError(
      body.error_description || body.error || `Failed to exchange OAuth code (${response.status})`,
      response.status,
      body,
    );
  }

  console.log(
    '[GitHub OAuth success]',
    `token_type=${body.token_type}`,
    `scope=${body.scope ?? '(empty)'}`,
    `token=${body.access_token.slice(0, 4)}…${body.access_token.slice(-4)}`,
  );

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
      pushed_at: string | null;
      updated_at: string;
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
    pushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    owner: {
      login: repo.owner.login,
      avatarUrl: repo.owner.avatar_url,
    },
  }));

  const end = page * perPage;
  const hasMore = end < data.total_count;

  return { repos, hasMore };
}

/**
 * Mark which repositories in a page contain the canonical
 * `.shield-wizard.json` data file.
 *
 * The check is batched into a single GraphQL query with one aliased
 * `repository` field per repo, so a page of `N` repositories costs one
 * round trip instead of the `N` contents-API calls the previous
 * implementation made. A missing file — or a repository that is no
 * longer accessible — comes back as a `null` object and is treated as
 * "no config".
 */
export async function markRepositoriesWithShieldConfig(
  accessToken: string,
  repos: GithubRepository[],
): Promise<GithubRepositoryWithConfig[]> {
  if (repos.length === 0) return [];

  const variableDeclarations: string[] = [];
  const selections: string[] = [];
  const variables: Record<string, string> = {};

  repos.forEach((repo, index) => {
    const ownerVar = `owner${index}`;
    const nameVar = `name${index}`;
    const exprVar = `expr${index}`;
    variableDeclarations.push(
      `$${ownerVar}: String!, $${nameVar}: String!, $${exprVar}: String!`,
    );
    selections.push(
      `r${index}: repository(owner: $${ownerVar}, name: $${nameVar}) `
      + `{ object(expression: $${exprVar}) { ... on Blob { oid } } }`,
    );
    variables[ownerVar] = repo.owner.login;
    variables[nameVar] = repo.name;
    variables[exprVar] = `refs/heads/${repo.defaultBranch}:${SHIELD_WIZARD_DATA_FILE}`;
  });

  const query = `query(${variableDeclarations.join(', ')}) {
  ${selections.join('\n  ')}
}`;
  const body = await githubGraphqlFetch<
    Record<string, { object?: { oid: string } | null } | null>
  >(accessToken, query, variables);

  if (!body.data) {
    const message = body.errors?.[0]?.message ?? 'GitHub GraphQL request failed';
    throw new GithubApiError(message, 422, body);
  }
  const data = body.data;

  return repos.map((repo, index) => ({
    ...repo,
    hasShieldWizardConfig: data[`r${index}`]?.object != null,
  }));
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
    pushed_at: string | null;
    updated_at: string;
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
    pushedAt: data.pushed_at,
    updatedAt: data.updated_at,
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

/** Return every blob path reachable from a branch's current commit. */
export async function listRepositoryTreePathsForBranch(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string[]> {
  const headOid = await getBranchHeadOid(accessToken, owner, repo, branch);
  const treeSha = await getCommitTreeSha(accessToken, owner, repo, headOid);
  return listRepositoryTreePaths(accessToken, owner, repo, treeSha);
}

/**
 * Read many text files from a branch in a small number of GraphQL
 * requests. The REST contents API only supports one file per request,
 * so the preview flow uses this batched reader instead.
 *
 * Missing files return `null` in the result map. Files that are too
 * large for GraphQL (`text` is truncated) throw a 422 error.
 */
export async function fetchGithubTextFilesBatch(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
): Promise<Map<string, GithubTextFile | null>> {
  const uniquePaths = Array.from(new Set(paths));
  const results = new Map<string, GithubTextFile | null>();
  const BATCH_SIZE = 50;

  for (let offset = 0; offset < uniquePaths.length; offset += BATCH_SIZE) {
    const batch = uniquePaths.slice(offset, offset + BATCH_SIZE);
    const aliases = batch.map((_, index) => `f${index}`);
    const variableDeclarations = aliases
      .map(alias => `$${alias}: String!`)
      .join(', ');
    const selections = aliases
      .map(alias => `${alias}: object(expression: $${alias}) { ... on Blob { oid text isTruncated } }`)
      .join('\n    ');

    const query = `
      query PreviewFileContents($owner: String!, $name: String!, ${variableDeclarations}) {
        repository(owner: $owner, name: $name) {
          ${selections}
        }
      }
    `;
    const variables: Record<string, string> = { owner, name: repo };
    batch.forEach((path, index) => {
      variables[`f${index}`] = `refs/heads/${branch}:${path}`;
    });

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': GITHUB_USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json() as {
      data?: {
        repository?: Record<string, {
          oid: string;
          text: string | null;
          isTruncated: boolean;
        } | null>;
      };
      errors?: Array<{ message: string }>;
    };
    const repository = body.data?.repository;
    if (!response.ok || !repository) {
      const message = body.errors?.[0]?.message
        ?? `GitHub GraphQL request failed (${response.status})`;
      throw new GithubApiError(message, response.ok ? 422 : response.status, body);
    }

    aliases.forEach((alias, index) => {
      const path = batch[index];
      const blob = repository[alias];
      if (blob === null || blob === undefined) {
        results.set(path, null);
        return;
      }
      if (blob.isTruncated || blob.text === null) {
        throw new GithubApiError(`File ${path} is too large to preview`, 422);
      }
      results.set(path, { content: blob.text, sha: blob.oid });
    });
  }

  return results;
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
 * the caller; untouchable paths are filtered out here.
 */
export async function commitRepositoryChanges(
  accessToken: string,
  params: {
    owner: string;
    repo: string;
    branch: string;
    files: Record<string, string>;
    commitMessage: string;
    /** The generic file policy controlling which paths may be touched. */
    policy: FilePolicy;
    /** User-modified conditional generated files that must not be overwritten. */
    userModifiedPaths?: ReadonlySet<string>;
  },
): Promise<GithubCommitResult> {
  const { owner, repo, branch, files, commitMessage, policy, userModifiedPaths = new Set<string>() } = params;

  const expectedHeadOid = await getBranchHeadOid(accessToken, owner, repo, branch);
  const treeSha = await getCommitTreeSha(accessToken, owner, repo, expectedHeadOid);
  const existingPaths = await listRepositoryTreePaths(accessToken, owner, repo, treeSha);

  const { additions: fileAdditions, deletions } = planFileChanges(
    files,
    existingPaths,
    policy,
    userModifiedPaths,
  );
  const additions = fileAdditions.map(({ path, contents }) => ({
    path,
    contents: encodeBase64Utf8(contents),
  }));

  if (additions.length === 0) {
    throw new GithubApiError('No generated files can be updated: all writable paths are protected', 422);
  }

  console.log('[GitHub GraphQL request]', 'createCommitOnBranch', `${owner}/${repo}@${branch}`, `token=${accessToken.slice(0, 4)}…${accessToken.slice(-4)}`);
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': GITHUB_USER_AGENT,
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
