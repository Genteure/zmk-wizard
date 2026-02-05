import { createContext, useContext, type Accessor, type Setter } from "solid-js";
import { produce, type SetStoreFunction, type Store } from "solid-js/store";
import type { Keyboard, KeyboardSnapshot } from "../typedef";

/**
 * Information about a GitHub repository being edited.
 */
export interface EditRepositoryInfo {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
}

/**
 * Information about a GitHub App installation.
 */
export interface GitHubInstallationInfo {
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

/**
 * GitHub authentication state.
 */
export interface GitHubAuthState {
  accessToken: string | null;
  user: {
    login: string;
    avatarUrl: string;
    name: string | null;
  } | null;
  /**
   * List of GitHub App installations accessible by the user.
   * Empty array means user is authenticated but has no app installations.
   * null means we haven't checked yet.
   */
  installations: GitHubInstallationInfo[] | null;
}

export interface Navigation {
  dialog: {
    info: boolean;
    build: boolean;
    generateLayout: boolean;
    importDevicetree: boolean;
    importLayoutJson: boolean;
    importKleJson: boolean;
    exportTextboxContent: string | null;
    /** GitHub authentication dialog */
    githubAuth: boolean;
    /** Repository selection dialog */
    repoSelect: boolean;
  };
  repoLink: string;
  selectedTab: string;
  activeEditPart: number | null;
  selectedKeys: string[];
  /**
   * Currently selected controller pin for wiring interactions
   */
  activeWiringPin: string | null;
  /**
   * Information about the repository being edited (null if creating new).
   */
  editRepository: EditRepositoryInfo | null;
  /**
   * GitHub authentication state.
   */
  githubAuth: GitHubAuthState;
}

export interface WizardContextType {
  nav: Store<Navigation>;
  setNav: SetStoreFunction<Navigation>;
  snapshot: Accessor<KeyboardSnapshot | null>;
  setSnapshot: Setter<KeyboardSnapshot | null>;
  keyboard: Store<Keyboard>;
  setKeyboard: SetStoreFunction<Keyboard>;
}

export const WizardContext = createContext<WizardContextType>();

export function useWizardContext(): WizardContextType {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("Wizard context not found");
  }
  return context;
}

export function normalizeKeys(context: WizardContextType) {
  context.setKeyboard("layout", produce(draft => {
    const minX = Math.min(...draft.map(k => k.x));
    const minY = Math.min(...draft.map(k => k.y));
    if (minX !== 0 || minY !== 0) {
      draft.forEach(k => {
        k.x -= minX;
        k.y -= minY;
        if (k.rx !== 0) k.rx -= minX;
        if (k.ry !== 0) k.ry -= minY;
      });
    }

    const minRow = Math.min(...draft.map(k => k.row));
    const minCol = Math.min(...draft.map(k => k.col));
    if (minRow !== 0 || minCol !== 0) {
      draft.forEach(k => {
        k.row -= minRow;
        k.col -= minCol;
      });
    }

    // Round everything to 2 decimal places
    draft.forEach(k => {
      k.x = Math.round(k.x * 100) / 100;
      k.y = Math.round(k.y * 100) / 100;
      k.r = Math.round(k.r * 100) / 100;
      k.rx = Math.round(k.rx * 100) / 100;
      k.ry = Math.round(k.ry * 100) / 100;
    });

    // Sort keys by logical row/col
    draft.sort((a, b) => (a.row - b.row) || (a.col - b.col));
  }));
}


