import { createSignal, onMount, type VoidComponent } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
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

  // Restore GitHub token from localStorage on mount
  onMount(() => {
    try {
      const storedToken = localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
      if (storedToken) {
        context.setNav("githubAuth", "accessToken", storedToken);
      }
    } catch {
      // localStorage may not be available
    }
  });

  return <WizardContext.Provider value={context}><App /></WizardContext.Provider>;
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
