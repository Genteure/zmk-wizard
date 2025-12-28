import { createSignal, type VoidComponent } from "solid-js";
import { createStore } from "solid-js/store";
import { App } from "./app";
import { type Navigation, WizardContext, type WizardContextType } from "./context";
import type { Keyboard, KeyboardSnapshot } from "../typedef";

export const Main: VoidComponent = () => {
  const context: WizardContextType = rootContextHelper();
  return <WizardContext.Provider value={context}><App /></WizardContext.Provider>;
}

function rootContextHelper(): WizardContextType {
  const [nav, setNav] = createStore<Navigation>({
    dialog: {
      info: false,
      build: false,
      generateLayout: false,
      importDevicetree: false,
      importLayoutJson: false
    },
    selectedTab: "layout",
    activeEditPart: null,
    selectedKeys: [],
    repoLink: "",
    activeWiringPin: null,
  });
  const [keyboard, setKeyboard] = createStore<Keyboard>({
    name: "",
    shield: "",
    dongle: false,
    layout: [],
    parts: [
      {
        name: "left",
        controller: "nice_nano_v2",
        wiring: "matrix_diode",
        keys: {},
        pins: {},
      },
      {
        name: "right",
        controller: "nice_nano_v2",
        wiring: "matrix_diode",
        keys: {},
        pins: {},
      },
    ],
  } satisfies Keyboard);
  const [snapshot, setSnapshot] = createSignal<KeyboardSnapshot | null>(null);
  return { nav, setNav, snapshot, setSnapshot, keyboard, setKeyboard };
}
