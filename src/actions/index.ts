import type { ActionAPIContext } from 'astro:actions';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import {
  PUBLIC_GITHUB_APP_SLUG,
  PUBLIC_GITHUB_CLIENT_ID,
} from 'astro:env/client';
import {
  FEEDBACK_WEBHOOK_URL,
  GITHUB_CLIENT_SECRET,
  GITHUB_SESSION_SECRET,
  TURNSTILE_SECRET,
} from 'astro:env/server';
import { createTarGzipStream } from 'nanotar';
import { ulid } from 'ulidx';
import { createZMKConfig } from '~/export';
import {
  commitRepositoryChanges,
  exchangeGithubCode,
  getGithubRepository,
  getGithubUser,
  GithubApiError,
  listGithubInstallations,
  listInstallationRepositories,
  markRepositoriesWithShieldConfig,
  readGithubTextFile,
  type GithubInstallation,
  type GithubUser,
} from '~/lib/githubApi';
import {
  createGithubOAuthState,
  GITHUB_SESSION_COOKIE,
  GITHUB_SESSION_MAX_AGE_SECONDS,
  openGithubSession,
  sealGithubSession,
  verifyGithubOAuthState,
} from '~/lib/githubSession';
import { compareGithubRepos } from '~/lib/githubRepoOrder';
import { createGitRepository } from '~/lib/gitrepo';
import { getRepoKV } from '~/lib/kv';
import { parseShieldWizardData, SHIELD_WIZARD_DATA_FILE } from '~/lib/dataFormat';
import { KeyboardSchema, type Keyboard } from '~/types/keyboard';
import { ValidatedKeyboardSchema } from '~/lib/validators';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isGithubConfigured(): boolean {
  return Boolean(
    PUBLIC_GITHUB_CLIENT_ID
    && GITHUB_CLIENT_SECRET
    && GITHUB_SESSION_SECRET,
  );
}

function requireGithubSessionSecret(): string {
  if (!GITHUB_SESSION_SECRET) githubNotConfiguredError();
  return GITHUB_SESSION_SECRET;
}

function requireGithubClientSecret(): string {
  if (!GITHUB_CLIENT_SECRET) githubNotConfiguredError();
  return GITHUB_CLIENT_SECRET;
}

function githubNotConfiguredError(): never {
  throw new ActionError({
    code: 'BAD_REQUEST',
    message: 'GitHub integration is not configured on this server. Set PUBLIC_GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_SESSION_SECRET.',
  });
}

function sessionCookieOptions(): Parameters<ActionAPIContext['cookies']['set']>[2] {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: GITHUB_SESSION_MAX_AGE_SECONDS,
  };
}

function clearGithubCookie(context: ActionAPIContext): void {
  context.cookies.delete(GITHUB_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
  });
}

/** Decrypt the stateless session cookie. Throws UNAUTHORIZED when absent/invalid. */
async function requireGithubToken(context: ActionAPIContext): Promise<string> {
  if (!isGithubConfigured()) githubNotConfiguredError();

  const token = await openGithubSession(
    context.cookies.get(GITHUB_SESSION_COOKIE)?.value,
    requireGithubSessionSecret(),
  );
  if (!token) {
    clearGithubCookie(context);
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'GitHub session is missing or expired. Please sign in again.',
    });
  }
  return token;
}

async function verifyTurnstile(captcha: string, purpose: string): Promise<void> {
  if (TURNSTILE_SECRET) {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET,
        response: captcha,
      }),
    });
    const verifyJson = await verifyRes.json() as { success: boolean; [key: string]: unknown };
    if (!verifyJson.success) {
      const msg = 'Captcha validation failed: ' + ((verifyJson['error-codes'] as string[])?.join(', ') || 'unknown error');
      console.log(msg);
      throw new ActionError({
        code: 'UNAUTHORIZED',
        message: msg,
      });
    }
  }
  else if (import.meta.env.DEV) {
    // Add a 3s delay locally so the captcha-gated flow is exercised.
    console.log(`Dev mode: adding delay to simulate captcha verification for ${purpose}`);
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 3000);
    await promise;
  }
  else {
    console.warn(`TURNSTILE_SECRET not configured, skipping captcha verification for ${purpose}`);
  }
}

function githubActionError(error: unknown, fallbackCode: ActionError['code']): never {
  console.error('[GitHub action]', error);
  if (GithubApiError.isUnauthorized(error)) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'GitHub session expired or was revoked. Please sign in again.',
    });
  }
  if (GithubApiError.isRateLimited(error)) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: 'GitHub API rate limit exceeded. Please wait a few minutes and try again.',
    });
  }
  if (GithubApiError.isNotFound(error)) {
    throw new ActionError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  if (error instanceof GithubApiError) {
    throw new ActionError({
      code: fallbackCode,
      message: error.message,
    });
  }
  throw new ActionError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected GitHub API error',
  });
}

interface GithubSessionResult {
  configured: boolean;
  user: GithubUser | null;
  installations: GithubInstallation[] | null;
  installUrl: string | null;
  githubError: string | null;
}

function githubErrorLooksLikeRateLimit(error: GithubApiError): boolean {
  const body = error.body;
  if (!body || typeof body !== 'object') return false;
  const text = JSON.stringify(body).toLowerCase();
  return text.includes('rate limit') || text.includes('rate_limit');
}

async function makeInstallUrl(repo?: string): Promise<string | null> {
  if (!PUBLIC_GITHUB_APP_SLUG || !GITHUB_SESSION_SECRET) return null;
  const state = await createGithubOAuthState(requireGithubSessionSecret(), {
    intent: 'edit',
    repo,
  });
  const url = new URL(`https://github.com/apps/${encodeURIComponent(PUBLIC_GITHUB_APP_SLUG)}/installations/new`);
  url.searchParams.set('state', state);
  return url.toString();
}

async function readGithubSession(
  context: ActionAPIContext,
  repo?: string,
): Promise<GithubSessionResult> {
  if (!isGithubConfigured()) {
    return { configured: false, user: null, installations: null, installUrl: null, githubError: null };
  }

  const cookieValue = context.cookies.get(GITHUB_SESSION_COOKIE)?.value;
  const token = await openGithubSession(
    cookieValue,
    requireGithubSessionSecret(),
  );
  if (!token) {
    if (cookieValue) clearGithubCookie(context);
    return {
      configured: true,
      user: null,
      installations: null,
      installUrl: await makeInstallUrl(repo),
      githubError: null,
    };
  }

  try {
    const user = await getGithubUser(token);
    const installations = await listGithubInstallations(token);
    return {
      configured: true,
      user,
      installations,
      installUrl: await makeInstallUrl(repo),
      githubError: null,
    };
  }
  catch (error) {
    // Invalid or revoked user tokens are a normal logged-out state: clear
    // the cookie and let the client route back to "sign in".
    if (GithubApiError.isUnauthorized(error)) {
      clearGithubCookie(context);
      return {
        configured: true,
        user: null,
        installations: null,
        installUrl: await makeInstallUrl(repo),
        githubError: null,
      };
    }

    // Rate limits keep the token around; the client only shows an error.
    if (error instanceof GithubApiError && githubErrorLooksLikeRateLimit(error)) {
      return {
        configured: true,
        user: null,
        installations: null,
        installUrl: await makeInstallUrl(repo),
        githubError: error.message,
      };
    }

    // Any other GitHub rejection (including revoked credentials that some
    // runtimes report as 403 instead of 401) must not take the launcher
    // down. Clear it and present the normal signed-out state.
    console.warn('[githubGetSession] clearing unusable session:', error);
    clearGithubCookie(context);
    return {
      configured: true,
      user: null,
      installations: null,
      installUrl: await makeInstallUrl(repo),
      githubError: null,
    };
  }
}

/**
 * Load `.shield-wizard.json` from a repository into editable keyboard
 * state. Accepts both the stable versioned envelope and the legacy raw
 * `Keyboard` JSON produced before the stable format landed, but a
 * legacy document is never silently rewritten: it is migrated on the
 * next server-side save.
 */
function parseRepositoryKeyboard(content: string): { keyboard: Keyboard; wasLegacy: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  }
  catch (error) {
    throw new GithubApiError(
      `Repository data file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      422,
    );
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'formatVersion' in parsed) {
    try {
      return {
        keyboard: parseShieldWizardData(parsed, { allowPartial: false }).keyboard,
        wasLegacy: false,
      };
    }
    catch (error) {
      throw new GithubApiError(
        `Repository data file is invalid: ${error instanceof Error ? error.message : String(error)}`,
        422,
      );
    }
  }

  const legacy = KeyboardSchema.safeParse(parsed);
  if (!legacy.success) {
    const issueText = legacy.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new GithubApiError(`Repository contains a legacy keyboard file that failed validation: ${issueText}`, 422);
  }
  return { keyboard: legacy.data, wasLegacy: true };
}

/**
 * Generated files that users commonly customize. They are preserved
 * only when the repository copy differs from what Shield Wizard itself
 * would generate for the stored keyboard, so untouched files still get
 * refreshed on save. `config/**` is always preserved by the commit
 * policy and is intentionally not listed here.
 */
const CONDITIONALLY_PRESERVED_PATHS = [
  'README.md',
  'build.yaml',
  '.github/workflows/build.yml',
] as const;

async function computeUserModifiedPreservedPaths(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  existingKeyboard: Keyboard,
): Promise<Set<string>> {
  const baseline = createZMKConfig(existingKeyboard);
  const preserved = new Set<string>();

  for (const filePath of CONDITIONALLY_PRESERVED_PATHS) {
    const baselineContent = baseline[filePath];
    if (baselineContent === undefined) continue;

    try {
      const current = await readGithubTextFile(token, owner, repo, filePath, branch);
      if (current.content !== baselineContent) {
        preserved.add(filePath);
      }
    }
    catch (error) {
      // A missing file means the user deleted it; let Shield Wizard
      // recreate it instead of treating the deletion as a customization.
      if (!GithubApiError.isNotFound(error)) throw error;
    }
  }

  return preserved;
}

// ─────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────

export const server = {
  buildRepository: defineAction({
    input: z.object({
      keyboard: ValidatedKeyboardSchema,
      captcha: z.string(),
    }),
    async handler(input) {
      await verifyTurnstile(input.captcha, 'repository build');

      console.log('Building repository for keyboard:', input.keyboard.name);
      const keyboardConfig = createZMKConfig(input.keyboard);
      const gitRepo = await createGitRepository(keyboardConfig);

      // Two separate copies, two different purposes:
      // - `createZMKConfig` put `.shield-wizard.json` inside the git pack,
      //   so it travels with the repository and can be read back for editing
      //   (issue #20).
      // - This loose tar entry is NOT part of the git pack. It exists for
      //   online developer audit/tests at `/repo/<id>.git/.shield-wizard.json`.
      gitRepo[SHIELD_WIZARD_DATA_FILE] = new TextEncoder().encode(keyboardConfig[SHIELD_WIZARD_DATA_FILE]);

      const tarStream = createTarGzipStream(
        Object
          .entries(gitRepo)
          .map(
            ([filePath, content]) => ({
              name: filePath,
              data: content,
            }),
          ),
      );

      const kv = getRepoKV();
      const repoId = ulid();
      console.log('Storing repository in KV with id:', repoId);
      await kv.setData(repoId, tarStream);

      return {
        repoId,
      };
    },
  }),

  sendFeedback: defineAction({
    input: z.object({
      type: z.enum(['bug', 'feature', 'other']),
      text: z.string().min(1, 'Feedback text is required').max(5000, 'Feedback text is too long'),
      captcha: z.string(),
      keyboardState: z.any().optional(),
      uiState: z.object({
        activeTab: z.string().optional(),
        activePart: z.number().nullable().optional(),
      }).optional(),
    }),
    async handler(input, context) {
      await verifyTurnstile(input.captcha, 'feedback submission');

      // Build Discord embed
      const typeLabels: Record<string, string> = {
        bug: 'Bug Report',
        feature: 'Feature Request',
        other: 'Other / Not Sure',
      };
      const colorMap: Record<string, number> = {
        bug: 0xf54242, // red
        feature: 0x42a5f5, // blue
        other: 0x9e9e9e, // grey
      };

      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Type', value: typeLabels[input.type] || input.type, inline: true },
      ];
      // Raw Accept-Language header from the request
      const acceptLanguage = context.request.headers.get('Accept-Language');
      if (acceptLanguage) {
        fields.push({ name: 'Locale', value: acceptLanguage, inline: true });
      }
      const host = context.request.headers.get('Host');
      if (host) {
        fields.push({ name: 'Host', value: host, inline: true });
      }
      if (input.uiState?.activeTab) {
        fields.push({ name: 'Active Tab', value: input.uiState.activeTab, inline: true });
      }
      if (input.uiState?.activePart !== undefined && input.uiState.activePart !== null) {
        fields.push({ name: 'Active Part', value: String(input.uiState.activePart), inline: true });
      }

      // Keyboard state: inline summary only; full JSON attached as a file
      const kb = input.keyboardState;
      if (kb) {
        const parts: string[] = [];
        if (kb.name) parts.push(`Name: ${kb.name}`);
        if (kb.shield) parts.push(`Shield: ${kb.shield}`);
        if (kb.layout?.length) parts.push(`Keys: ${kb.layout.length}`);
        if (kb.parts?.length) parts.push(`Parts: ${kb.parts.length}`);

        // if parts is array and parts[n].controller is string, list controllers for each part
        if (Array.isArray(kb.parts)) {
          const controllers: string[] = [];
          (kb.parts as Array<{ controller?: unknown }>).forEach((part) => {
            if (typeof part.controller === 'string') {
              controllers.push(`${part.controller}`);
            }
            else {
              controllers.push(`(unknown)`);
            }
          });
          if (controllers.length) {
            parts.push(`Controllers: ${controllers.join(', ')}`);
          }
        }

        fields.push({ name: 'Keyboard State', value: parts.join('\n') });
      }

      // Feedback text in description (last field, may be large)
      const textValue = input.text.slice(0, 1500);
      fields.push({ name: 'Feedback', value: textValue || '(empty)' });

      const embed = {
        title: '📬 New Feedback',
        color: colorMap[input.type] || 0x9e9e9e,
        fields,
        timestamp: new Date().toISOString(),
      };

      const payload: Record<string, unknown> = { embeds: [embed] };

      if (FEEDBACK_WEBHOOK_URL) {
        try {
          const form = new FormData();
          form.append('payload_json', JSON.stringify(payload));

          // Attach full keyboard state JSON as a file
          if (input.keyboardState) {
            const jsonBlob = new Blob(
              [JSON.stringify(input.keyboardState)],
              { type: 'application/json' },
            );
            form.append('files[0]', jsonBlob, 'keyboard.json');
          }

          const res = await fetch(FEEDBACK_WEBHOOK_URL, {
            method: 'POST',
            body: form,
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => 'unknown');
            console.log(`Feedback webhook failed (${res.status}): ${errText}`);
            throw new Error('Webhook returned non-OK status');
          }
        }
        catch (error) {
          console.log('Failed to send feedback webhook:', error);
          throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send feedback' });
        }
      }
      else {
        console.log('FEEDBACK_WEBHOOK_URL not configured, logging feedback:', JSON.stringify(payload));
      }

      return { success: true };
    },
  }),

  // ─── GitHub session (stateless cookie) ───────────────────────

  githubGetSession: defineAction({
    async handler(_input, context) {
      return readGithubSession(context);
    },
  }),

  githubBeginAuth: defineAction({
    input: z.object({
      intent: z.enum(['edit', 'login']),
      repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repo must be in owner/name form').optional(),
      returnScreen: z.enum(['start', 'editor']).optional(),
      returnMode: z.enum(['new', 'edit']).nullable().optional(),
    }),
    async handler(input, context) {
      if (!isGithubConfigured()) githubNotConfiguredError();

      const state = await createGithubOAuthState(requireGithubSessionSecret(), {
        intent: input.intent,
        repo: input.repo,
        returnScreen: input.returnScreen,
        returnMode: input.returnMode,
      });

      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', PUBLIC_GITHUB_CLIENT_ID);
      url.searchParams.set('redirect_uri', `${context.url.origin}/`);
      url.searchParams.set('state', state);

      return { authorizeUrl: url.toString() };
    },
  }),

  githubCompleteAuth: defineAction({
    input: z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }),
    async handler(input, context) {
      if (!isGithubConfigured()) githubNotConfiguredError();

      const oauthState = await verifyGithubOAuthState(requireGithubSessionSecret(), input.state);
      if (!oauthState) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired OAuth state. Please start the flow again.',
        });
      }

      let accessToken: string;
      try {
        const tokenResponse = await exchangeGithubCode(
          input.code,
          PUBLIC_GITHUB_CLIENT_ID,
          requireGithubClientSecret(),
        );
        accessToken = tokenResponse.access_token;
      }
      catch (error) {
        throw githubActionError(error, 'BAD_REQUEST');
      }

      const cookie = await sealGithubSession(accessToken, requireGithubSessionSecret());
      context.cookies.set(GITHUB_SESSION_COOKIE, cookie, sessionCookieOptions());

      try {
        const user = await getGithubUser(accessToken);
        const installations = await listGithubInstallations(accessToken);
        return {
          configured: true,
          intent: oauthState.intent,
          returnScreen: oauthState.returnScreen ?? null,
          returnMode: oauthState.returnMode ?? null,
          repo: oauthState.repo ?? null,
          user,
          installations,
          installUrl: await makeInstallUrl(oauthState.repo),
          githubError: null,
        };
      }
      catch (error) {
        if (GithubApiError.isUnauthorized(error)) clearGithubCookie(context);
        throw githubActionError(error, 'BAD_REQUEST');
      }
    },
  }),

  githubLogout: defineAction({
    async handler(_input, context) {
      clearGithubCookie(context);
      return { success: true };
    },
  }),

  // ─── GitHub repository flow ──────────────────────────────────

  githubListRepositories: defineAction({
    input: z.object({
      installationId: z.number().int().positive(),
      page: z.number().int().min(1).max(1000).default(1),
      perPage: z.number().int().min(1).max(100).default(30),
    }),
    async handler(input, context) {
      const token = await requireGithubToken(context);

      try {
        const { repos, hasMore } = await listInstallationRepositories(
          token,
          input.installationId,
          input.page,
          input.perPage,
        );
        const annotated = await markRepositoriesWithShieldConfig(token, repos);
        annotated.sort(compareGithubRepos);
        return { repos: annotated, hasMore };
      }
      catch (error) {
        if (GithubApiError.isUnauthorized(error)) clearGithubCookie(context);
        throw githubActionError(error, 'BAD_REQUEST');
      }
    },
  }),

  githubLoadRepository: defineAction({
    input: z.object({
      owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
      repo: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
    }),
    async handler(input, context) {
      const token = await requireGithubToken(context);

      try {
        const repository = await getGithubRepository(token, input.owner, input.repo);
        const file = await readGithubTextFile(
          token,
          input.owner,
          input.repo,
          SHIELD_WIZARD_DATA_FILE,
          repository.defaultBranch,
        );
        const { keyboard, wasLegacy } = parseRepositoryKeyboard(file.content);
        const validation = ValidatedKeyboardSchema.safeParse(keyboard);

        return {
          keyboard,
          wasLegacy,
          repository: {
            id: repository.id,
            name: repository.name,
            fullName: repository.fullName,
            htmlUrl: repository.htmlUrl,
            defaultBranch: repository.defaultBranch,
            private: repository.private,
            owner: {
              login: repository.owner.login,
              avatarUrl: repository.owner.avatarUrl,
            },
          },
          dataFileSha: file.sha,
          validationIssues: validation.success
            ? []
            : validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
        };
      }
      catch (error) {
        if (GithubApiError.isUnauthorized(error)) clearGithubCookie(context);
        throw githubActionError(error, 'BAD_REQUEST');
      }
    },
  }),

  githubCommitChanges: defineAction({
    input: z.object({
      owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
      repo: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
      branch: z.string().min(1).max(250).regex(/^(?![-.])[A-Za-z0-9_./-]+(?<!\.)$/),
      commitMessage: z.string().trim().min(1).max(100),
      keyboard: ValidatedKeyboardSchema,
    }),
    async handler(input, context) {
      const token = await requireGithubToken(context);

      try {
        // The shield name is part of every generated file name. Renaming it
        // in place would strand the preserved `config/` files and delete the
        // board/shield tree, so refuse it and point the user at New Shield.
        const existingFile = await readGithubTextFile(
          token,
          input.owner,
          input.repo,
          SHIELD_WIZARD_DATA_FILE,
          input.branch,
        );
        const existing = parseRepositoryKeyboard(existingFile.content);
        if (existing.keyboard.shield !== input.keyboard.shield) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'The shield name cannot be changed when editing an existing repository. Start a new shield instead.',
          });
        }
        if (JSON.stringify(existing.keyboard) === JSON.stringify(input.keyboard)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'No changes to save. Edit the keyboard configuration first.',
          });
        }

        console.log('Committing Shield Wizard changes to:', `${input.owner}/${input.repo}@${input.branch}`);
        const files = createZMKConfig(input.keyboard);
        const preservedPaths = await computeUserModifiedPreservedPaths(
          token,
          input.owner,
          input.repo,
          input.branch,
          existing.keyboard,
        );
        const result = await commitRepositoryChanges(token, {
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          files,
          commitMessage: input.commitMessage,
          preservedPaths,
        });

        return {
          commitSha: result.commitSha,
          commitUrl: result.commitUrl,
          commitHtmlUrl: result.commitHtmlUrl,
        };
      }
      catch (error) {
        if (error instanceof ActionError) throw error;
        if (GithubApiError.isUnauthorized(error)) clearGithubCookie(context);
        throw githubActionError(error, 'BAD_REQUEST');
      }
    },
  }),
};
