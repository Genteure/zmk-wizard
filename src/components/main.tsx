import { createSignal, onMount, type VoidComponent } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { actions } from "astro:actions";
import type { Keyboard, KeyboardSnapshot } from "../typedef";
import { loadBusesForController } from "./controllerInfo";
import { App } from "./app";
import { type Navigation, WizardContext, type WizardContextType } from "./context";

// Local storage key for GitHub access token
const GITHUB_TOKEN_STORAGE_KEY = 'shield-wizard-github-token';

export const Main: VoidComponent = () => {
  const context: WizardContextType = rootContextHelper();

  if (import.meta.env.DEV) {
    (window as any).wizardContext = context;
    (window as any).solidJsUnwrap = unwrap
  }

  document.documentElement.dataset.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  // Restore GitHub token and handle OAuth/installation callbacks on mount
  onMount(async () => {
    // Check for OAuth callback or installation callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const setupAction = urlParams.get('setup_action');
    const storedState = sessionStorage.getItem('github_oauth_state');

    // Handle OAuth callback
    if (code && state && storedState) {
      // We have an OAuth callback - open the auth dialog to process it
      context.setNav("dialog", "githubAuth", true);
      return; // Let the dialog handle the callback
    }

    // Handle installation callback
    if (setupAction) {
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Try to restore token and open auth dialog
      try {
        const storedToken = localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
        if (storedToken) {
          context.setNav("githubAuth", "accessToken", storedToken);
          await fetchUserInfoOnMount(storedToken, context);
          // Open auth dialog to show updated installations
          context.setNav("dialog", "githubAuth", true);
        }
      } catch (err) {
        console.warn('[GitHub Auth] Failed to restore session after installation:', err);
      }
      return;
    }

    // No callback, try to restore token from localStorage
    try {
      const storedToken = localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
      if (storedToken) {
        context.setNav("githubAuth", "accessToken", storedToken);
        // Also try to fetch user info to validate token and populate user data
        // Note: fetchUserInfoOnMount has its own error handling, so failures here
        // should only be from localStorage access issues
        await fetchUserInfoOnMount(storedToken, context);
      }
    } catch (err) {
      // localStorage access may fail in some browser contexts (e.g., private mode)
      console.warn('[GitHub Auth] Failed to restore session from localStorage:', err);
    }
  });

  return <WizardContext.Provider value={context}><App /></WizardContext.Provider>;
}

/**
 * Fetch user info on mount to validate token and populate user data.
 */
async function fetchUserInfoOnMount(token: string, context: WizardContextType): Promise<void> {
  try {
    const { data, error: actionError } = await actions.githubGetUser({
      accessToken: token,
    });

    if (actionError) {
      // Token is invalid, clear it
      console.warn('[GitHub Auth] Stored token is invalid, clearing');
      clearGitHubToken();
      context.setNav("githubAuth", "accessToken", null);
      return;
    }

    if (data) {
      context.setNav("githubAuth", "user", {
        login: data.login,
        avatarUrl: data.avatarUrl,
        name: data.name,
      });
      console.log('[GitHub Auth] Restored user session for:', data.login);
      
      // Also fetch installations
      await fetchInstallationsOnMount(token, context);
    }
  } catch (err) {
    // If we can't get user info, clear the token
    console.warn('[GitHub Auth] Failed to validate stored token:', err);
    clearGitHubToken();
    context.setNav("githubAuth", "accessToken", null);
  }
}

/**
 * Fetch installations on mount.
 */
async function fetchInstallationsOnMount(token: string, context: WizardContextType): Promise<void> {
  try {
    const { data, error: actionError } = await actions.githubListInstallations({
      accessToken: token,
    });

    if (actionError) {
      console.warn('[GitHub Auth] Failed to fetch installations:', actionError);
      context.setNav("githubAuth", "installations", []);
      return;
    }

    if (data) {
      context.setNav("githubAuth", "installations", data.installations);
      console.log('[GitHub Auth] Found', data.installations.length, 'installations');
    }
  } catch (err) {
    console.warn('[GitHub Auth] Failed to fetch installations:', err);
    context.setNav("githubAuth", "installations", []);
  }
}

/**
 * Save the GitHub token to localStorage.
 */
export function saveGitHubToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage may not be available
  }
}

/**
 * Clear the GitHub token from localStorage.
 */
export function clearGitHubToken(): void {
  saveGitHubToken(null);
}

function rootContextHelper(): WizardContextType {
  const [nav, setNav] = createStore<Navigation>({
    dialog: {
      info: false,
      build: false,
      generateLayout: false,
      importDevicetree: false,
      importLayoutJson: false,
      importKleJson: false,
      exportTextboxContent: null,
      githubAuth: false,
      repoSelect: false,
    },
    selectedTab: "layout",
    activeEditPart: null,
    selectedKeys: [],
    repoLink: "",
    activeWiringPin: null,
    editRepository: null,
    githubAuth: {
      accessToken: null,
      user: null,
      installations: null,
    },
  });
  const [keyboard, setKeyboard] = createStore<Keyboard>({
    name: "",
    shield: "",
    dongle: false,
    modules: [],
    layout: [],
    parts: [
      {
        name: "left",
        controller: "nice_nano_v2",
        wiring: "matrix_diode",
        keys: {},
        encoders: [],
        pins: {},
        buses: loadBusesForController("nice_nano_v2"),
      },
      {
        name: "right",
        controller: "nice_nano_v2",
        wiring: "matrix_diode",
        keys: {},
        encoders: [],
        pins: {},
        buses: loadBusesForController("nice_nano_v2"),
      },
    ],
  } satisfies Keyboard);
  const [snapshot, setSnapshot] = createSignal<KeyboardSnapshot | null>(null);
  return { nav, setNav, snapshot, setSnapshot, keyboard, setKeyboard };
}
