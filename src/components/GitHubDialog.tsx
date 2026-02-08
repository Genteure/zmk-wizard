/**
 * Unified GitHub Dialog for authentication, installation, and repository selection.
 * 
 * This component combines all GitHub-related workflows into a single dialog with internal
 * state management for switching between different views:
 * - 'auth': OAuth authentication flow
 * - 'install': App installation prompt
 * - 'repos': Repository selection
 * 
 * The dialog is designed to be layered on top of the Info dialog, allowing users to
 * load existing configurations without closing the keyboard info dialog.
 */

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Link } from "@kobalte/core/link";
import { actions } from "astro:actions";
import { PUBLIC_GITHUB_CLIENT_ID, PUBLIC_GITHUB_APP_SLUG } from "astro:env/client";
import AlertTriangle from "lucide-solid/icons/alert-triangle";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Check from "lucide-solid/icons/check";
import ExternalLink from "lucide-solid/icons/external-link";
import Github from "lucide-solid/icons/github";
import Loader2 from "lucide-solid/icons/loader-2";
import LogOut from "lucide-solid/icons/log-out";
import X from "lucide-solid/icons/x";
import { createEffect, createSignal, For, on, Show, type VoidComponent } from "solid-js";
import { useWizardContext } from "./context";
import { clearGitHubToken, saveGitHubToken } from "./main";

type DialogView = 'auth' | 'install' | 'repos';

/**
 * Generate a random state parameter for OAuth CSRF protection.
 * Uses 16 bytes (128 bits) of cryptographic randomness.
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
  if (!PUBLIC_GITHUB_APP_SLUG) {
    return 'https://github.com/apps';
  }
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  return `https://github.com/apps/${PUBLIC_GITHUB_APP_SLUG}/installations/new?state=${generateOAuthState()}&redirect_uri=${encodeURIComponent(redirectUri)}`;
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
 * Unified GitHub Dialog Component.
 * 
 * Props:
 * - keepInfoDialogOpen: If true, keeps the Info dialog open when loading a repo
 */
export const GitHubDialog: VoidComponent<{
  keepInfoDialogOpen?: boolean;
}> = (props) => {
  const context = useWizardContext();
  
  // Internal view state
  const [view, setView] = createSignal<DialogView>('auth');
  
  // Auth state
  const [isAuthenticating, setIsAuthenticating] = createSignal(false);
  const [isCheckingInstallation, setIsCheckingInstallation] = createSignal(false);
  const [authError, setAuthError] = createSignal<string | null>(null);
  
  // Repo state
  const [repositories, setRepositories] = createSignal<RepositoryInfo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = createSignal(false);
  const [repoError, setRepoError] = createSignal<string | null>(null);
  const [loadingRepo, setLoadingRepo] = createSignal<string | null>(null);
  const [repoFilter, setRepoFilter] = createSignal<'all' | 'wizard'>('wizard');
  const [failedInstallations, setFailedInstallations] = createSignal<string[]>([]);

  const isAuthenticated = () => !!context.nav.githubAuth.accessToken;
  const hasInstallations = () => (context.nav.githubAuth.installations?.length ?? 0) > 0;

  // Determine the initial view based on auth state
  const determineView = (): DialogView => {
    if (!isAuthenticated()) return 'auth';
    if (!hasInstallations()) return 'install';
    return 'repos';
  };

  // Handle dialog open
  createEffect(on(
    () => context.nav.dialog.githubAuth,
    (isOpen) => {
      if (!isOpen) return;

      // Check if we're handling an OAuth callback or installation callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const setupAction = urlParams.get('setup_action');
      const storedState = sessionStorage.getItem('github_oauth_state');

      // Handle OAuth callback
      if (code && state && storedState) {
        if (state !== storedState) {
          setAuthError('OAuth state mismatch. Please try again.');
          sessionStorage.removeItem('github_oauth_state');
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        sessionStorage.removeItem('github_oauth_state');
        window.history.replaceState({}, document.title, window.location.pathname);
        handleOAuthCallback(code);
        return;
      }

      // Handle installation callback
      if (setupAction) {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (context.nav.githubAuth.accessToken) {
          fetchInstallations(context.nav.githubAuth.accessToken).then(() => {
            setView(determineView());
          });
        }
        return;
      }

      // Set initial view and fetch data if needed
      const initialView = determineView();
      setView(initialView);

      if (isAuthenticated() && context.nav.githubAuth.installations === null) {
        fetchInstallations(context.nav.githubAuth.accessToken!);
      } else if (initialView === 'repos' && repositories().length === 0) {
        fetchAllRepositories();
      }
    }
  ));

  // Update view when auth state changes (only when dialog is open and auth state changes)
  createEffect(on(
    () => [context.nav.dialog.githubAuth, isAuthenticated(), hasInstallations()] as const,
    ([isOpen, authenticated, hasInstalls]) => {
      if (!isOpen) return;
      
      const newView = authenticated 
        ? (hasInstalls ? 'repos' : 'install')
        : 'auth';
      
      if (newView === 'repos' && view() !== 'repos' && repositories().length === 0) {
        fetchAllRepositories();
      }
      setView(newView);
    }
  ));

  const handleOAuthCallback = async (code: string) => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setAuthError('GitHub App is not configured.');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

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

      saveGitHubToken(data.accessToken);
      context.setNav("githubAuth", "accessToken", data.accessToken);

      await fetchUserInfo(data.accessToken);
      await fetchInstallations(data.accessToken);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to authenticate');
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
      context.setNav("githubAuth", "installations", []);
    } finally {
      setIsCheckingInstallation(false);
    }
  };

  const fetchAllRepositories = async () => {
    const token = context.nav.githubAuth.accessToken;
    const installations = context.nav.githubAuth.installations;
    if (!token || !installations || installations.length === 0) return;

    setIsLoadingRepos(true);
    setRepoError(null);
    setRepositories([]);
    setFailedInstallations([]);

    try {
      const allRepos: RepositoryInfo[] = [];
      const failed: string[] = [];
      
      for (const installation of installations) {
        // Note: Currently fetches only the first 30 repositories per installation.
        // For users with more repositories, they can use the installation page
        // to manage which repos have the app installed.
        const { data, error: actionError } = await actions.githubListInstallationRepositories({
          accessToken: token,
          installationId: installation.id,
          page: 1,
          perPage: 30,
        });

        if (actionError) {
          console.error('Failed to fetch repos for installation', installation.account.login, actionError);
          failed.push(installation.account.login);
          continue;
        }

        if (data) {
          allRepos.push(...data.repos);
        }
      }

      allRepos.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setRepositories(allRepos);
      setFailedInstallations(failed);
      
      console.log('[GitHub] Loaded', allRepos.length, 'repositories from', installations.length, 'installation(s)');
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const selectRepository = async (repo: RepositoryInfo) => {
    const token = context.nav.githubAuth.accessToken;
    if (!token) return;

    setLoadingRepo(repo.fullName);
    setRepoError(null);

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
        context.setKeyboard(data.keyboard);
        context.setNav("editRepository", {
          owner: data.repository.owner.login,
          name: data.repository.name,
          fullName: data.repository.fullName,
          htmlUrl: data.repository.htmlUrl,
          defaultBranch: data.repository.defaultBranch,
        });

        // Close GitHub dialog
        context.setNav("dialog", "githubAuth", false);
        
        // If not keeping info dialog open, close it too
        if (!props.keepInfoDialogOpen) {
          context.setNav("dialog", "info", false);
        }
      }
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoadingRepo(null);
    }
  };

  const startOAuth = () => {
    if (!PUBLIC_GITHUB_CLIENT_ID) {
      setAuthError('GitHub App is not configured on this server.');
      return;
    }

    setAuthError(null);
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
    setAuthError(null);
    setRepoError(null);
    setRepositories([]);
    setView('auth');
  };

  const filteredRepos = () => {
    const repos = repositories();
    if (repoFilter() === 'wizard') {
      return repos.filter(r => r.hasShieldWizardConfig);
    }
    return repos;
  };

  const goBack = () => {
    if (view() === 'repos') {
      setView('auth');
    } else if (view() === 'install') {
      setView('auth');
    }
  };

  return (
    <Dialog 
      open={context.nav.dialog.githubAuth} 
      onOpenChange={v => context.setNav("dialog", "githubAuth", v)}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="dialog--overlay" />
        <div class="dialog--positioner">
          <Dialog.Content class="dialog--content max-w-xl">
            <div class="dialog--header">
              <Show when={view() !== 'auth' && isAuthenticated()}>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-circle mr-2"
                  onClick={goBack}
                >
                  <ArrowLeft class="w-5 h-5" />
                </button>
              </Show>
              <Dialog.Title class="dialog--title flex-1">
                <Github class="inline-block w-6 h-6 mr-2" />
                <Show when={view() === 'repos'} fallback="Connect to GitHub">
                  Select Repository
                </Show>
              </Dialog.Title>
              <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
                <X class="w-6 h-6" />
              </Dialog.CloseButton>
            </div>
            
            <Dialog.Description as="div">
              {/* Auth View */}
              <Show when={view() === 'auth'}>
                <Show when={authError()}>
                  <div class="alert alert-error mb-4">
                    {authError()}
                  </div>
                </Show>

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

                    <Show when={isCheckingInstallation()}>
                      <div class="flex items-center justify-center py-4 text-base-content/70">
                        <Loader2 class="w-5 h-5 animate-spin mr-2" />
                        Checking app installation...
                      </div>
                    </Show>

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
                        onClick={() => {
                          setView('repos');
                          if (repositories().length === 0) {
                            fetchAllRepositories();
                          }
                        }}
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
              </Show>

              {/* Install View */}
              <Show when={view() === 'install'}>
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
                    disabled={!PUBLIC_GITHUB_APP_SLUG}
                  >
                    <ExternalLink class="w-5 h-5" />
                    Install Shield Wizard App
                  </Button>
                  <Show when={!PUBLIC_GITHUB_APP_SLUG}>
                    <p class="text-xs text-error text-center">
                      GitHub App name is not configured on this server.
                    </p>
                  </Show>

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

              {/* Repos View */}
              <Show when={view() === 'repos'}>
                <Show when={repoError()}>
                  <div class="alert alert-error mb-4">
                    {repoError()}
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
                      classList={{ 'btn-primary': repoFilter() === 'wizard', 'btn-ghost': repoFilter() !== 'wizard' }}
                      onClick={() => setRepoFilter('wizard')}
                    >
                      Shield Wizard Repos
                    </Button>
                    <Button
                      class="btn btn-sm"
                      classList={{ 'btn-primary': repoFilter() === 'all', 'btn-ghost': repoFilter() !== 'all' }}
                      onClick={() => setRepoFilter('all')}
                    >
                      All Repositories
                    </Button>
                  </div>
                  <p class="text-xs text-base-content/60">
                    {repoFilter() === 'wizard' 
                      ? 'Showing repositories with Shield Wizard configuration' 
                      : 'Showing all repositories'
                    }
                  </p>
                </div>

                <div class="max-h-80 overflow-y-auto space-y-2">
                  <Show 
                    when={filteredRepos().length > 0}
                    fallback={
                      <Show when={!isLoadingRepos()}>
                        <div class="text-center py-8 text-base-content/60">
                          <Show 
                            when={repoFilter() === 'wizard'}
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

                  <Show when={isLoadingRepos()}>
                    <div class="flex items-center justify-center py-4">
                      <Loader2 class="w-6 h-6 animate-spin" />
                      <span class="ml-2">Loading repositories...</span>
                    </div>
                  </Show>
                </div>

                <div class="mt-4 flex items-center justify-end">
                  <Link
                    href={getInstallationUrl()}
                    class="btn btn-ghost btn-sm"
                  >
                    <ExternalLink class="w-4 h-4" />
                    Add More Repositories
                  </Link>
                </div>
              </Show>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};
