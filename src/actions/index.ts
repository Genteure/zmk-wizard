import { z } from 'astro/zod';
import { ActionError, defineAction } from 'astro:actions';
import { GITHUB_CLIENT_SECRET, TURNSTILE_SECRET } from 'astro:env/server';
import { createTarGzipStream, type TarFileInput } from 'nanotar';
import { ulid } from 'ulidx';
import { createGitRepository } from '~/lib/gitrepo';
import {
  exchangeCodeForToken,
  getAuthenticatedUser,
  getRepository,
  GitHubApiError,
  hasShieldWizardConfig,
  listInstallationRepositories,
  listUserInstallations,
  listUserRepositories,
  loadKeyboardConfig,
  pushChangesToRepository,
} from '~/lib/github';
import { getRepoKV } from '~/lib/kv';
import { createZMKConfig } from '~/lib/templating';
import { validateKeyboard } from '~/lib/validators';
import { KeyboardSchema } from '~/typedef';

export const server = {
  buildRepository: defineAction({
    input: z.object({
      keyboard: KeyboardSchema,
      captcha: z.string(),
    }),
    async handler(input, context) {
      if (!input.captcha) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Captcha must be solved",
        });
      }

      // add 3 sec delay if running locally in dev mode
      if (import.meta.env.DEV) {
        console.log("Dev mode: adding delay to simulate captcha verification");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (TURNSTILE_SECRET) {
        // Validate with Cloudflare Turnstile API
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET,
            response: input.captcha,
            // TODO remoteip: context.request?.headers.get("CF-Connecting-IP")
          }),
        });
        const verifyJson = await verifyRes.json() as { success: boolean;[key: string]: any };
        if (!verifyJson.success) {
          const msg = "Captcha validation failed: " + (verifyJson["error-codes"]?.join(", ") || "unknown error");
          console.log(msg);
          throw new ActionError({
            code: "UNAUTHORIZED",
            // TODO check best practices for error messages
            // Probably not a good idea to return raw error codes?
            message: msg,
          });
        }
      }

      const errors = validateKeyboard(input.keyboard);
      if (errors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Keyboard validation failed, invalid keyboard configuration",
        });
      }

      console.log("Building repository for keyboard:", input.keyboard.name);

      const keyboardConfig = createZMKConfig(input.keyboard);
      const gitRepo = await createGitRepository(keyboardConfig);

      const tarStream = createTarGzipStream(
        Object
          .entries(gitRepo)
          .map(
            ([filePath, content]) => ({
              name: filePath,
              data: content,
            }) as TarFileInput
          )
      )

      const kv = getRepoKV(context.locals);
      const repoId = ulid();
      console.log("Storing repository in KV with id:", repoId);
      await kv.setData(repoId, tarStream);

      return {
        repoId,
      }
    }
  }),

  /**
   * Exchange a GitHub OAuth authorization code for an access token.
   * This uses the Device Authorization flow for public clients.
   */
  githubExchangeCode: defineAction({
    input: z.object({
      code: z.string(),
      clientId: z.string(),
    }),
    async handler(input) {
      if (!GITHUB_CLIENT_SECRET) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "GitHub OAuth is not configured on this server",
        });
      }

      try {
        const tokenResponse = await exchangeCodeForToken(
          input.code,
          input.clientId,
          GITHUB_CLIENT_SECRET
        );

        console.log('[GitHub OAuth] Token exchange successful, scope:', tokenResponse.scope);

        return {
          accessToken: tokenResponse.access_token,
          tokenType: tokenResponse.token_type,
          scope: tokenResponse.scope,
        };
      } catch (error) {
        console.error('[GitHub OAuth] Token exchange failed:', error);
        if (error instanceof GitHubApiError) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to exchange OAuth code",
        });
      }
    }
  }),

  /**
   * Get the authenticated GitHub user's information.
   */
  githubGetUser: defineAction({
    input: z.object({
      accessToken: z.string(),
    }),
    async handler(input) {
      try {
        const user = await getAuthenticatedUser(input.accessToken);
        console.log('[GitHub API] User authenticated:', user.login);
        return {
          login: user.login,
          id: user.id,
          avatarUrl: user.avatar_url,
          name: user.name,
        };
      } catch (error) {
        console.error('[GitHub API] Failed to get user:', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get GitHub user",
        });
      }
    }
  }),

  /**
   * List GitHub App installations for the authenticated user.
   * Returns all installations where the user has authorized the app.
   */
  githubListInstallations: defineAction({
    input: z.object({
      accessToken: z.string(),
    }),
    async handler(input) {
      try {
        const installations = await listUserInstallations(input.accessToken);
        
        return {
          installations: installations.map(inst => ({
            id: inst.id,
            account: {
              login: inst.account.login,
              id: inst.account.id,
              avatarUrl: inst.account.avatar_url,
              type: inst.account.type,
            },
            repositorySelection: inst.repository_selection,
            htmlUrl: inst.html_url,
          })),
        };
      } catch (error) {
        console.error('[GitHub API] Failed to list installations:', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list app installations",
        });
      }
    }
  }),

  /**
   * List repositories for a specific GitHub App installation.
   * Only returns repositories that the app has been granted access to.
   */
  githubListInstallationRepositories: defineAction({
    input: z.object({
      accessToken: z.string(),
      installationId: z.number(),
      page: z.number().min(1).default(1),
      perPage: z.number().min(1).max(100).default(30),
    }),
    async handler(input) {
      try {
        const { repos, hasMore } = await listInstallationRepositories(
          input.accessToken,
          input.installationId,
          input.page,
          input.perPage
        );

        // Check each repo for shield-wizard.json file
        const reposWithConfig = await Promise.all(
          repos.map(async (repo) => {
            const hasConfig = await hasShieldWizardConfig(
              input.accessToken,
              repo.owner.login,
              repo.name
            );
            return {
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
              hasShieldWizardConfig: hasConfig,
            };
          })
        );

        return {
          repos: reposWithConfig,
          hasMore,
        };
      } catch (error) {
        console.error('[GitHub API] Failed to list installation repositories:', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        if (GitHubApiError.isRateLimited(error)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: "GitHub API rate limit exceeded. Please try again later.",
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list installation repositories",
        });
      }
    }
  }),

  /**
   * List repositories for the authenticated user.
   * @deprecated Use githubListInstallationRepositories instead for GitHub App flow.
   */
  githubListRepositories: defineAction({
    input: z.object({
      accessToken: z.string(),
      page: z.number().min(1).default(1),
      perPage: z.number().min(1).max(100).default(30),
    }),
    async handler(input) {
      try {
        const { repos, hasMore } = await listUserRepositories(
          input.accessToken,
          input.page,
          input.perPage
        );

        console.log('[GitHub API] Listed repositories, count:', repos.length, 'hasMore:', hasMore);

        // Check each repo for shield-wizard.json file
        const reposWithConfig = await Promise.all(
          repos.map(async (repo) => {
            const hasConfig = await hasShieldWizardConfig(
              input.accessToken,
              repo.owner.login,
              repo.name
            );
            return {
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
              hasShieldWizardConfig: hasConfig,
            };
          })
        );

        return {
          repos: reposWithConfig,
          hasMore,
        };
      } catch (error) {
        console.error('[GitHub API] Failed to list repositories:', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        if (GitHubApiError.isRateLimited(error)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: "GitHub API rate limit exceeded. Please try again later.",
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list repositories",
        });
      }
    }
  }),

  /**
   * Load keyboard configuration from a GitHub repository.
   */
  githubLoadConfig: defineAction({
    input: z.object({
      accessToken: z.string(),
      owner: z.string(),
      repo: z.string(),
    }),
    async handler(input) {
      try {
        const repoInfo = await getRepository(
          input.accessToken,
          input.owner,
          input.repo
        );

        console.log('[GitHub API] Loading config from:', input.owner + '/' + input.repo);

        const { keyboard } = await loadKeyboardConfig(
          input.accessToken,
          input.owner,
          input.repo
        );

        console.log('[GitHub API] Loaded keyboard config:', keyboard.name);

        return {
          keyboard,
          repository: {
            id: repoInfo.id,
            name: repoInfo.name,
            fullName: repoInfo.full_name,
            htmlUrl: repoInfo.html_url,
            defaultBranch: repoInfo.default_branch,
            owner: {
              login: repoInfo.owner.login,
              avatarUrl: repoInfo.owner.avatar_url,
            },
          },
        };
      } catch (error) {
        console.error('[GitHub API] Failed to load config from ' + input.owner + '/' + input.repo + ':', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        if (GitHubApiError.isNotFound(error)) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Repository not found or does not contain Shield Wizard configuration",
          });
        }
        if (error instanceof GitHubApiError) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load configuration",
        });
      }
    }
  }),

  /**
   * Push changes to a GitHub repository.
   */
  githubPushChanges: defineAction({
    input: z.object({
      accessToken: z.string(),
      owner: z.string(),
      repo: z.string(),
      branch: z.string(),
      keyboard: KeyboardSchema,
    }),
    async handler(input) {
      // Validate keyboard configuration
      const errors = validateKeyboard(input.keyboard);
      if (errors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Keyboard validation failed, invalid keyboard configuration",
        });
      }

      try {
        // Generate the new configuration files
        const files = createZMKConfig(input.keyboard);

        console.log('[GitHub API] Pushing changes to:', input.owner + '/' + input.repo + ' branch:', input.branch);

        // Push changes to the repository
        // Always delete obsolete files to prevent broken configurations
        const result = await pushChangesToRepository(
          input.accessToken,
          input.owner,
          input.repo,
          input.branch,
          files,
          "Update keyboard configuration via Shield Wizard"
        );

        console.log('[GitHub API] Push successful, commit:', result.commitSha);

        return {
          commitSha: result.commitSha,
          commitUrl: result.commitUrl,
        };
      } catch (error) {
        console.error('[GitHub API] Failed to push changes to ' + input.owner + '/' + input.repo + ':', error);
        if (GitHubApiError.isUnauthorized(error)) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "GitHub access token is invalid or expired",
          });
        }
        if (GitHubApiError.isRateLimited(error)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: "GitHub API rate limit exceeded. Please try again later.",
          });
        }
        if (error instanceof GitHubApiError) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to push changes to repository",
        });
      }
    }
  }),
}
