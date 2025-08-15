import { createContext, useContext, type Accessor } from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";
import type { KeyboardContext, PinoutSelections } from "~/lib/types";

export const WizardContext = createContext<{
  stepBack: () => void;
  stepNext: () => void;
  keyboard: Store<KeyboardContext>;
  setKeyboard: SetStoreFunction<KeyboardContext>;
}>();

export const WizardProvider = WizardContext.Provider;

export function useWizardContext() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("Keyboard context not found");
  }
  return context;
}

export interface PinoutInfo {
  [pin: string]: {
    name: string;
    handle: string;
  }
}

export const pinoutContext = createContext<{
  info: Accessor<PinoutInfo>;
  pins: Accessor<Store<PinoutSelections>>;
  setPins: Accessor<SetStoreFunction<PinoutSelections>>;
}>();

export const usePinoutContext = () => {
  const context = useContext(pinoutContext);
  if (!context) {
    throw new Error("Pinout context not found");
  }
  return context;
}
