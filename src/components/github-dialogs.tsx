import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Link } from "@kobalte/core/link";
import { actions } from "astro:actions";
import { PUBLIC_GITHUB_CLIENT_ID, PUBLIC_GITHUB_APP_NAME } from "astro:env/client";
import AlertTriangle from "lucide-solid/icons/alert-triangle";
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
 * Generate a random state parameter for OAuth CSRF protection.
 * Uses 16 bytes (128 bits) of cryptographic randomness, which provides
 * sufficient entropy to prevent state guessing attacks.
 */
function generateOAuthState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the GitHub App installation URL.
 */
function getInstallationUrl(): string {
  if (!PUBLIC_GITHUB_APP_NAME) {
    return 'https://github.com/apps';
  }
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  return `https://github.com/apps/${PUBLIC_GITHUB_APP_NAME}/installations/new?state=${generateOAuthState()}&redirect_uri=${encodeURIComponent(redirectUri)}`;
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
 * Dialog for GitHub App authentication and installation.
 * 
 * Flow:
 * 1. User clicks "Connect to GitHub" to authorize the app
 * 2. After authorization, we check if the app is installed
 * 3. If not installed, user is prompted to install the app
 * 4. After installation, user can proceed to select repositories
 */
export const GitHubAuthDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [isAuthenticating, setIsAuthenticating] = createSignal(false);
  const [isCheckingInstallation, setIsCheckingInstallation] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const isAuthenticated = () => !!context.nav.githubAuth.accessToken;
  const hasInstallations = () => (context.nav.githubAuth.installations?.length ?? 0) > 0;

  // Handle OAuth callback and installation callback from URL
  createEffect(on(
    () => context.nav.dialog.githubAuth,
    (isOpen) => {
      if (!isOpen) return;

      // Check if we're handling an OAuth callback or installation callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const setupAction = urlParams.get('setup_action'); // Installation callback
      const storedState = sessionStorage.getItem('github_oauth_state');

      // Handle OAuth callback
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
        return;
      }

      // Handle installation callback (user just installed the app)
      if (setupAction) {
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // If user is already authenticated, refresh installations
        if (context.nav.githubAuth.accessToken) {
          fetchInstallations(context.nav.githubAuth.accessToken);
        }
        return;
      }

      // If authenticated but haven't checked installations yet, check now
      if (context.nav.githubAuth.accessToken && context.nav.githubAuth.installations === null) {
        fetchInstallations(context.nav.githubAuth.accessToken);
      }
    }
  ));

  const handleOAuthCallback = async (code: string) => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setError('GitHub App is not configured.');
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

      // Check installations
      await fetchInstallations(data.accessToken);
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

  const fetchInstallations = async (token: string) => {
    setIsCheckingInstallation(true);
    try {
      const { data, error: actionError } = await actions.githubListInstallations({
        accessToken: token,
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      if (data) {
        context.setNav("githubAuth", "installations", data.installations);
        console.log('[GitHub Auth] Found', data.installations.length, 'installations');
      }
    } catch (err) {
      console.error('[GitHub Auth] Failed to fetch installations:', err);
      // Don't clear the token, just set empty installations
      context.setNav("githubAuth", "installations", []);
    } finally {
      setIsCheckingInstallation(false);
    }
  };

  const startOAuth = () => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setError('GitHub App is not configured on this server.');
      return;
    }

    setError(null);
    const state = generateOAuthState();
    sessionStorage.setItem('github_oauth_state', state);

    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', PUBLIC_GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  };

  const startInstallation = () => {
    // Redirect to GitHub App installation page
    window.location.href = getInstallationUrl();
  };

  const handleLogout = () => {
    clearGitHubToken();
    context.setNav("githubAuth", {
      accessToken: null,
      user: null,
      installations: null,
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

              {/* Step 1: Not authenticated - show sign in button */}
              <Show when={!isAuthenticated()}>
                <div class="text-center space-y-4">
                  <p class="text-base-content/80">
                    Connect your GitHub account to edit existing Shield Wizard configurations.
                  </p>
                  <p class="text-sm text-base-content/60">
                    You'll authorize the Shield Wizard app to access your repositories.
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
                      GitHub App is not configured on this server.
                    </p>
                  </Show>
                </div>
              </Show>

              {/* Authenticated - show user info and installation status */}
              <Show when={isAuthenticated()}>
                <div class="space-y-4">
                  {/* User info card */}
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

                  {/* Checking installation status */}
                  <Show when={isCheckingInstallation()}>
                    <div class="flex items-center justify-center py-4 text-base-content/70">
                      <Loader2 class="w-5 h-5 animate-spin mr-2" />
                      Checking app installation...
                    </div>
                  </Show>

                  {/* Step 2: No installations - prompt to install */}
                  <Show when={!isCheckingInstallation() && !hasInstallations()}>
                    <div class="alert alert-warning">
                      <AlertTriangle class="w-5 h-5" />
                      <div>
                        <p class="font-semibold">App installation required</p>
                        <p class="text-sm">
                          To access your repositories, you need to install the Shield Wizard app.
                        </p>
                      </div>
                    </div>
                    <Button
                      class="btn btn-primary w-full"
                      onClick={startInstallation}
                      disabled={!PUBLIC_GITHUB_APP_NAME}
                    >
                      <ExternalLink class="w-5 h-5" />
                      Install Shield Wizard App
                    </Button>
                    <Show when={!PUBLIC_GITHUB_APP_NAME}>
                      <p class="text-xs text-error text-center">
                        GitHub App name is not configured on this server.
                      </p>
                    </Show>
                  </Show>

                  {/* Step 3: Has installations - show count and continue button */}
                  <Show when={!isCheckingInstallation() && hasInstallations()}>
                    <div class="alert alert-success">
                      <Check class="w-5 h-5" />
                      <div>
                        <p class="font-semibold">App installed</p>
                        <p class="text-sm">
                          {context.nav.githubAuth.installations?.length === 1
                            ? '1 account has the Shield Wizard app installed.'
                            : `${context.nav.githubAuth.installations?.length} accounts have the Shield Wizard app installed.`
                          }
                        </p>
                      </div>
                    </div>
                    <Button
                      class="btn btn-primary w-full"
                      onClick={continueToRepoSelect}
                    >
                      Select Repository
                    </Button>
                    <div class="text-center">
                      <button
                        type="button"
                        class="text-sm text-base-content/60 hover:text-base-content underline"
                        onClick={startInstallation}
                      >
                        Add more repositories
                      </button>
                    </div>
                  </Show>

                  {/* Logout button */}
                  <div class="border-t border-base-300 pt-4 mt-4">
                    <Button
                      class="btn btn-ghost btn-sm w-full"
                      onClick={handleLogout}
                    >
                      <LogOut class="w-4 h-4" />
                      Sign out
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
 * 
 * This dialog shows repositories from all GitHub App installations.
 * Users can filter to show only repositories with Shield Wizard configurations.
 */
export const RepoSelectDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [repositories, setRepositories] = createSignal<RepositoryInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [loadingRepo, setLoadingRepo] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<'all' | 'wizard'>('wizard');
  const [failedInstallations, setFailedInstallations] = createSignal<string[]>([]);

  // Fetch repositories when dialog opens
  createEffect(on(
    () => context.nav.dialog.repoSelect,
    async (isOpen) => {
      if (isOpen && context.nav.githubAuth.accessToken) {
        await fetchAllRepositories();
      }
    }
  ));

  /**
   * Fetch repositories from all installations.
   */
  const fetchAllRepositories = async () => {
    const token = context.nav.githubAuth.accessToken;
    const installations = context.nav.githubAuth.installations;
    if (!token || !installations || installations.length === 0) return;

    setIsLoading(true);
    setError(null);
    setRepositories([]);
    setFailedInstallations([]);

    try {
      // Fetch repositories from all installations
      const allRepos: RepositoryInfo[] = [];
      const failed: string[] = [];
      
      for (const installation of installations) {
        const { data, error: actionError } = await actions.githubListInstallationRepositories({
          accessToken: token,
          installationId: installation.id,
          page: 1,
          perPage: 30, // Use consistent page size with other listings
        });

        if (actionError) {
          console.error('Failed to fetch repos for installation', installation.account.login, actionError);
          failed.push(installation.account.login);
          continue; // Skip this installation but continue with others
        }

        if (data) {
          allRepos.push(...data.repos);
        }
      }

      // Sort by full name
      allRepos.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setRepositories(allRepos);
      setFailedInstallations(failed);
      
      console.log('[GitHub] Loaded', allRepos.length, 'repositories from', installations.length, 'installation(s)');
      if (failed.length > 0) {
        console.warn('[GitHub] Failed to load repos from:', failed.join(', '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoading(false);
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

              <Show when={failedInstallations().length > 0}>
                <div class="alert alert-warning mb-4">
                  <AlertTriangle class="w-5 h-5" />
                  <span class="text-sm">
                    Could not load repositories from: {failedInstallations().join(', ')}
                  </span>
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
              </div>

              <div class="mt-4 flex items-center justify-between">
                <Button
                  class="btn btn-ghost btn-sm"
                  onClick={handleBackToAuth}
                >
                  ← Back
                </Button>
                <Link
                  href={getInstallationUrl()}
                  class="btn btn-ghost btn-sm"
                >
                  <ExternalLink class="w-4 h-4" />
                  Add More Repositories
                </Link>
              </div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};
