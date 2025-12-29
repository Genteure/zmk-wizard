import { createContext, useContext, type Accessor, type Setter } from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";
import type { Keyboard, KeyboardSnapshot } from "../typedef";

export interface Navigation {
  dialog: {
    info: boolean;
    build: boolean;
    generateLayout: boolean;
    importDevicetree: boolean;
    importLayoutJson: boolean;
    importKleJson: boolean;
  };
  repoLink: string;
  selectedTab: string;
  activeEditPart: number | null;
  selectedKeys: string[];
  /**
   * Currently selected controller pin for wiring interactions
   */
  activeWiringPin: string | null;
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
