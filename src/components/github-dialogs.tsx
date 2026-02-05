import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Link } from "@kobalte/core/link";
import { actions } from "astro:actions";
import { PUBLIC_GITHUB_CLIENT_ID } from "astro:env/client";
import Check from "lucide-solid/icons/check";
import ExternalLink from "lucide-solid/icons/external-link";
import Github from "lucide-solid/icons/github";
import Loader2 from "lucide-solid/icons/loader-2";
import LogOut from "lucide-solid/icons/log-out";
import X from "lucide-solid/icons/x";
import { createEffect, createSignal, For, on, Show, type VoidComponent } from "solid-js";
import { useWizardContext } from "./context";
import { clearGitHubToken, saveGitHubToken } from "./main";

/**
 * GitHub OAuth scopes needed for editing repositories.
 * 
 * - `repo`: Full control of private repositories (includes public repos)
 *   - Required for reading and writing repository contents
 *   - Required for reading and writing `.github/workflows` files
 * - `workflow`: Update GitHub Action workflows
 *   - Required for pushing changes to `.github/workflows` directory
 * 
 * Note: For public repos only, `public_repo` scope would be sufficient,
 * but we use `repo` to support both public and private repositories.
 */
const GITHUB_SCOPES = "repo workflow";

/**
 * Generate a random state parameter for OAuth CSRF protection.
 * Uses 16 bytes (128 bits) of cryptographic randomness, which provides
 * sufficient entropy to prevent state guessing attacks.
 */
function generateOAuthState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

interface RepositoryInfo {
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
  hasShieldWizardConfig: boolean;
}

/**
 * Dialog for GitHub OAuth authentication.
 */
export const GitHubAuthDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [isAuthenticating, setIsAuthenticating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const isAuthenticated = () => !!context.nav.githubAuth.accessToken;

  // Handle OAuth callback from URL
  createEffect(on(
    () => context.nav.dialog.githubAuth,
    (isOpen) => {
      if (!isOpen) return;

      // Check if we're handling an OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const storedState = sessionStorage.getItem('github_oauth_state');

      if (code && state && storedState) {
        // Verify state matches
        if (state !== storedState) {
          setError('OAuth state mismatch. Please try again.');
          sessionStorage.removeItem('github_oauth_state');
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        // Clean up
        sessionStorage.removeItem('github_oauth_state');
        window.history.replaceState({}, document.title, window.location.pathname);

        // Exchange code for token
        handleOAuthCallback(code);
      }
    }
  ));

  const handleOAuthCallback = async (code: string) => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setError('GitHub OAuth is not configured.');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const { data, error: actionError } = await actions.githubExchangeCode({
        code,
        clientId: PUBLIC_GITHUB_CLIENT_ID,
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      if (!data?.accessToken) {
        throw new Error('No access token received');
      }

      // Save token
      saveGitHubToken(data.accessToken);
      context.setNav("githubAuth", "accessToken", data.accessToken);

      // Get user info
      await fetchUserInfo(data.accessToken);

      // Close auth dialog and open repo select dialog
      context.setNav("dialog", "githubAuth", false);
      context.setNav("dialog", "repoSelect", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const fetchUserInfo = async (token: string) => {
    try {
      const { data, error: actionError } = await actions.githubGetUser({
        accessToken: token,
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      if (data) {
        context.setNav("githubAuth", "user", {
          login: data.login,
          avatarUrl: data.avatarUrl,
          name: data.name,
        });
      }
    } catch (err) {
      // If we can't get user info, clear the token
      clearGitHubToken();
      context.setNav("githubAuth", "accessToken", null);
      throw err;
    }
  };

  const startOAuth = () => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setError('GitHub OAuth is not configured on this server.');
      return;
    }

    setError(null);
    const state = generateOAuthState();
    sessionStorage.setItem('github_oauth_state', state);

    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', PUBLIC_GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GITHUB_SCOPES);
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  };

  const handleLogout = () => {
    clearGitHubToken();
    context.setNav("githubAuth", {
      accessToken: null,
      user: null,
    });
    context.setNav("editRepository", null);
    setError(null);
  };

  const continueToRepoSelect = () => {
    context.setNav("dialog", "githubAuth", false);
    context.setNav("dialog", "repoSelect", true);
  };

  return (
    <Dialog 
      open={context.nav.dialog.githubAuth} 
      onOpenChange={v => context.setNav("dialog", "githubAuth", v)}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="dialog--overlay" />
        <div class="dialog--positioner">
          <Dialog.Content class="dialog--content max-w-md">
            <div class="dialog--header">
              <Dialog.Title class="dialog--title">
                <Github class="inline-block w-6 h-6 mr-2" />
                Connect to GitHub
              </Dialog.Title>
              <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
                <X class="w-6 h-6" />
              </Dialog.CloseButton>
            </div>
            <Dialog.Description as="div">
              <Show when={error()}>
                <div class="alert alert-error mb-4">
                  {error()}
                </div>
              </Show>

              <Show 
                when={isAuthenticated()}
                fallback={
                  <div class="text-center space-y-4">
                    <p class="text-base-content/80">
                      Connect your GitHub account to edit existing Shield Wizard configurations.
                    </p>
                    <p class="text-sm text-base-content/60">
                      We'll request access to your repositories so you can load and save configurations.
                    </p>
                    <Button
                      class="btn btn-primary btn-lg"
                      onClick={startOAuth}
                      disabled={isAuthenticating() || !PUBLIC_GITHUB_CLIENT_ID}
                    >
                      <Show when={isAuthenticating()} fallback={<Github class="w-5 h-5" />}>
                        <Loader2 class="w-5 h-5 animate-spin" />
                      </Show>
                      {isAuthenticating() ? 'Authenticating...' : 'Sign in with GitHub'}
                    </Button>
                    <Show when={!PUBLIC_GITHUB_CLIENT_ID}>
                      <p class="text-xs text-error">
                        GitHub OAuth is not configured on this server.
                      </p>
                    </Show>
                  </div>
                }
              >
                <div class="space-y-4">
                  <div class="flex items-center gap-4 p-4 bg-base-200 rounded-lg">
                    <img 
                      src={context.nav.githubAuth.user?.avatarUrl} 
                      alt={context.nav.githubAuth.user?.login}
                      class="w-12 h-12 rounded-full"
                    />
                    <div class="flex-1">
                      <div class="font-semibold">
                        {context.nav.githubAuth.user?.name || context.nav.githubAuth.user?.login}
                      </div>
                      <div class="text-sm text-base-content/70">
                        @{context.nav.githubAuth.user?.login}
                      </div>
                    </div>
                    <Check class="w-6 h-6 text-success" />
                  </div>

                  <div class="flex gap-2">
                    <Button
                      class="btn btn-primary flex-1"
                      onClick={continueToRepoSelect}
                    >
                      Select Repository
                    </Button>
                    <Button
                      class="btn btn-ghost"
                      onClick={handleLogout}
                      title="Sign out"
                    >
                      <LogOut class="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </Show>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};

/**
 * Dialog for selecting a repository to edit.
 */
export const RepoSelectDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [repositories, setRepositories] = createSignal<RepositoryInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(1);
  const [hasMore, setHasMore] = createSignal(false);
  const [loadingRepo, setLoadingRepo] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<'all' | 'wizard'>('wizard');

  // Fetch repositories when dialog opens
  createEffect(on(
    () => context.nav.dialog.repoSelect,
    async (isOpen) => {
      if (isOpen && context.nav.githubAuth.accessToken) {
        await fetchRepositories(true);
      }
    }
  ));

  const fetchRepositories = async (reset = false) => {
    const token = context.nav.githubAuth.accessToken;
    if (!token) return;

    setIsLoading(true);
    setError(null);

    const pageNum = reset ? 1 : page();
    if (reset) {
      setPage(1);
      setRepositories([]);
    }

    try {
      const { data, error: actionError } = await actions.githubListRepositories({
        accessToken: token,
        page: pageNum,
        perPage: 30,
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      if (data) {
        if (reset) {
          setRepositories(data.repos);
        } else {
          setRepositories(prev => [...prev, ...data.repos]);
        }
        setHasMore(data.hasMore);
        setPage(pageNum + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    if (!isLoading() && hasMore()) {
      fetchRepositories(false);
    }
  };

  const selectRepository = async (repo: RepositoryInfo) => {
    const token = context.nav.githubAuth.accessToken;
    if (!token) return;

    setLoadingRepo(repo.fullName);
    setError(null);

    try {
      const { data, error: actionError } = await actions.githubLoadConfig({
        accessToken: token,
        owner: repo.owner.login,
        repo: repo.name,
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      if (data) {
        // Set the keyboard configuration
        context.setKeyboard(data.keyboard);

        // Set edit mode
        context.setNav("editRepository", {
          owner: data.repository.owner.login,
          name: data.repository.name,
          fullName: data.repository.fullName,
          htmlUrl: data.repository.htmlUrl,
          defaultBranch: data.repository.defaultBranch,
        });

        // Close dialogs
        context.setNav("dialog", "repoSelect", false);
        context.setNav("dialog", "info", false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoadingRepo(null);
    }
  };

  const filteredRepos = () => {
    const repos = repositories();
    if (filter() === 'wizard') {
      return repos.filter(r => r.hasShieldWizardConfig);
    }
    return repos;
  };

  const handleBackToAuth = () => {
    context.setNav("dialog", "repoSelect", false);
    context.setNav("dialog", "githubAuth", true);
  };

  return (
    <Dialog 
      open={context.nav.dialog.repoSelect} 
      onOpenChange={v => context.setNav("dialog", "repoSelect", v)}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="dialog--overlay" />
        <div class="dialog--positioner">
          <Dialog.Content class="dialog--content max-w-xl">
            <div class="dialog--header">
              <Dialog.Title class="dialog--title">
                Select Repository
              </Dialog.Title>
              <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
                <X class="w-6 h-6" />
              </Dialog.CloseButton>
            </div>
            <Dialog.Description as="div">
              <Show when={error()}>
                <div class="alert alert-error mb-4">
                  {error()}
                </div>
              </Show>

              <div class="mb-4">
                <div class="flex items-center gap-2 mb-2">
                  <Button
                    class="btn btn-sm"
                    classList={{ 'btn-primary': filter() === 'wizard', 'btn-ghost': filter() !== 'wizard' }}
                    onClick={() => setFilter('wizard')}
                  >
                    Shield Wizard Repos
                  </Button>
                  <Button
                    class="btn btn-sm"
                    classList={{ 'btn-primary': filter() === 'all', 'btn-ghost': filter() !== 'all' }}
                    onClick={() => setFilter('all')}
                  >
                    All Repositories
                  </Button>
                </div>
                <p class="text-xs text-base-content/60">
                  {filter() === 'wizard' 
                    ? 'Showing repositories with Shield Wizard configuration' 
                    : 'Showing all repositories'
                  }
                </p>
              </div>

              <div class="max-h-80 overflow-y-auto space-y-2">
                <Show 
                  when={filteredRepos().length > 0}
                  fallback={
                    <Show when={!isLoading()}>
                      <div class="text-center py-8 text-base-content/60">
                        <Show 
                          when={filter() === 'wizard'}
                          fallback={<p>No repositories found.</p>}
                        >
                          <p>No Shield Wizard repositories found.</p>
                          <p class="text-sm mt-2">
                            Try viewing all repositories or create a new configuration first.
                          </p>
                        </Show>
                      </div>
                    </Show>
                  }
                >
                  <For each={filteredRepos()}>
                    {(repo) => (
                      <button 
                        type="button"
                        class="w-full p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors flex items-center gap-3 text-left"
                        onClick={() => repo.hasShieldWizardConfig && selectRepository(repo)}
                        disabled={!repo.hasShieldWizardConfig}
                        classList={{ 
                          'opacity-50 cursor-not-allowed': !repo.hasShieldWizardConfig,
                          'cursor-pointer': repo.hasShieldWizardConfig,
                        }}
                      >
                        <img 
                          src={repo.owner.avatarUrl} 
                          alt={repo.owner.login}
                          class="w-8 h-8 rounded"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="font-semibold truncate">
                            {repo.fullName}
                          </div>
                          <Show when={repo.description}>
                            <div class="text-xs text-base-content/60 truncate">
                              {repo.description}
                            </div>
                          </Show>
                        </div>
                        <div class="flex items-center gap-2">
                          <Show when={repo.private}>
                            <span class="badge badge-sm badge-outline">Private</span>
                          </Show>
                          <Show when={repo.hasShieldWizardConfig}>
                            <span class="badge badge-sm badge-success">Shield Wizard</span>
                          </Show>
                          <Show when={loadingRepo() === repo.fullName}>
                            <Loader2 class="w-4 h-4 animate-spin" />
                          </Show>
                        </div>
                      </button>
                    )}
                  </For>
                </Show>

                <Show when={isLoading()}>
                  <div class="flex items-center justify-center py-4">
                    <Loader2 class="w-6 h-6 animate-spin" />
                    <span class="ml-2">Loading repositories...</span>
                  </div>
                </Show>

                <Show when={hasMore() && !isLoading()}>
                  <div class="text-center">
                    <Button
                      class="btn btn-ghost btn-sm"
                      onClick={loadMore}
                    >
                      Load More
                    </Button>
                  </div>
                </Show>
              </div>

              <div class="mt-4 flex items-center justify-between">
                <Button
                  class="btn btn-ghost btn-sm"
                  onClick={handleBackToAuth}
                >
                  ← Back
                </Button>
                <Link
                  href="https://github.com/new"
                  target="_blank"
                  class="btn btn-ghost btn-sm"
                >
                  <ExternalLink class="w-4 h-4" />
                  Create New Repository
                </Link>
              </div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};
