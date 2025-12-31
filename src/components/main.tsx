import { createSignal, type VoidComponent } from "solid-js";
import { createStore } from "solid-js/store";
import type { Keyboard, KeyboardSnapshot } from "../typedef";
import { loadBusesForController } from "./controllerInfo";
import { App } from "./app";
import { type Navigation, WizardContext, type WizardContextType } from "./context";

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
      importLayoutJson: false,
      importKleJson: false
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
        buses: loadBusesForController("nice_nano_v2"),
      },
      {
        name: "right",
        controller: "nice_nano_v2",
        wiring: "matrix_diode",
        keys: {},
        pins: {},
        buses: loadBusesForController("nice_nano_v2"),
      },
    ],
  } satisfies Keyboard);
  const [snapshot, setSnapshot] = createSignal<KeyboardSnapshot | null>(null);
  return { nav, setNav, snapshot, setSnapshot, keyboard, setKeyboard };
}
