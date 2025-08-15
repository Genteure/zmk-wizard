import ArrowLeftToLine from "lucide-solid/icons/arrow-left-to-line";
import ArrowRightFromLine from "lucide-solid/icons/arrow-right-from-line";
import ExternalLink from "lucide-solid/icons/external-link";
import OctagonX from "lucide-solid/icons/octagon-x";
import X from "lucide-solid/icons/x";
import { Match, Show, Switch, type Accessor, type Component } from "solid-js";
import { type SetStoreFunction, type Store } from "solid-js/store";
import { pinoutContext, usePinoutContext, useWizardContext } from "~/components/context";
import { niceNanoV2, xiaoBle, xiaoBlePlus } from "~/lib/controllers";
import { Controller, PinMode, WiringType, type PinoutSelections } from "~/lib/types";

const PinModeSelector: Component<{ pin: string }> = (props) => {
  const context = usePinoutContext();
  const wizardContext = useWizardContext();
  return (
    <div class="flex items-center justify-between p-2 bg-base-200 rounded-lg w-72">
      <div class="flex flex-col">
        <div class="font-extrabold text-xl">{context.info()[props.pin].name}</div>
        <Switch fallback={<span class="text-gray-400">Unused</span>}>
          <Match when={context.pins()[props.pin] === PinMode.enum.input}>
            <span class="text-lime-500">Input</span>
          </Match>
          <Match when={context.pins()[props.pin] === PinMode.enum.output}>
            <span class="text-rose-500">Output</span>
          </Match>
        </Switch>
      </div>
      <div class="join">
        <button
          class="btn join-item"
          title="Unused"
          onClick={() => context.setPins()(props.pin, undefined)}
        >
          <X size={"1.5em"} />
        </button>
        <Show when={([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(wizardContext.keyboard.info.wiring)}>
          <button
            class="btn join-item text-rose-500"
            title="Output"
            onClick={() => context.setPins()(props.pin, PinMode.enum.output)}
          >
            <ArrowRightFromLine size={"1.5em"} />
          </button>
        </Show>
        <button
          class="btn join-item text-lime-500"
          title="Input"
          onClick={() => context.setPins()(props.pin, PinMode.enum.input)}
        >
          <ArrowLeftToLine size={"1.5em"} />
        </button>
      </div>
    </div>
  );
};

const XiaoBlePinMode: Component<{
  pins: Accessor<Store<PinoutSelections>>;
  setPins: Accessor<SetStoreFunction<PinoutSelections>>;
}> = (props) => {
  return (
    <pinoutContext.Provider value={{
      pins: props.pins,
      setPins: props.setPins,
      info: () => (xiaoBle.pins),
    }}>
      <div>
        <div class="text-2xl text-center font-bold m-2">
          Seeed XIAO nRF52840
        </div>
        <div class="text-center mb-2">
          <a class="link" target="_blank" href="https://files.seeedstudio.com/wiki/XIAO-BLE/pinout2.png">
            Pinout Reference
            <ExternalLink class="inline ml-1" />
          </a>
        </div>
        <div class="flex w-full flex-col md:flex-row justify-center items-center md:items-end p-2">
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d0" />
            <PinModeSelector pin="d1" />
            <PinModeSelector pin="d2" />
            <PinModeSelector pin="d3" />
            <PinModeSelector pin="d4" />
            <PinModeSelector pin="d5" />
            <PinModeSelector pin="d6" />
          </div>
          <div class="divider md:divider-horizontal"></div>
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d10" />
            <PinModeSelector pin="d9" />
            <PinModeSelector pin="d8" />
            <PinModeSelector pin="d7" />
          </div>
        </div>
      </div>
    </pinoutContext.Provider>
  );
}

const XiaoBlePlusPinMode: Component<{
  pins: Accessor<Store<PinoutSelections>>;
  setPins: Accessor<SetStoreFunction<PinoutSelections>>;
}> = (props) => {
  return (
    <pinoutContext.Provider value={{
      pins: props.pins,
      setPins: props.setPins,
      info: () => (xiaoBlePlus.pins),
    }}>
      <div>
        <div class="text-2xl text-center font-bold m-2">
          Seeed XIAO nRF52840 Plus
        </div>
        <div class="text-center mb-2">
          <a class="link" target="_blank" href="https://files.seeedstudio.com/wiki/XIAO-BLE/plus_pinout.png">
            Pinout Reference
            <ExternalLink class="inline ml-1" />
          </a>
        </div>
        <div class="flex w-full flex-col md:flex-row justify-center items-center md:items-end p-2">
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d0" />
            <PinModeSelector pin="d1" />
            <PinModeSelector pin="d2" />
            <PinModeSelector pin="d3" />
            <PinModeSelector pin="d4" />
            <PinModeSelector pin="d5" />
            <PinModeSelector pin="d6" />
          </div>
          <div class="divider md:divider-horizontal"></div>
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d10" />
            <PinModeSelector pin="d9" />
            <PinModeSelector pin="d8" />
            <PinModeSelector pin="d7" />
          </div>
        </div>
        <div class="divider md:w-1/3 p-2 mx-auto"></div>
        <div class="flex w-full flex-col md:flex-row justify-center items-center md:items-end p-2">
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d19" />
            <PinModeSelector pin="d18" />
            <PinModeSelector pin="d17" />
          </div>
          <div class="divider md:divider-horizontal"></div>
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d11" />
            <PinModeSelector pin="d12" />
            <PinModeSelector pin="d13" />
            <PinModeSelector pin="d14" />
            <PinModeSelector pin="d15" />

            <div class="flex items-center justify-between p-2 bg-base-200 rounded-lg w-72">
              <div class="flex flex-col">
                <div class="font-extrabold text-xl">D16</div>
                <div class="whitespace-nowrap text-gray-500">
                  Unusable
                </div>
              </div>

              <div class="mx-4 text-red-500">
                <OctagonX />
              </div>
              <div class="text-wrap text-xs">
                Despite marked as <span class="font-bold underline">D</span>igital, it's unusable due to hardware limitations.
              </div>
            </div>
          </div>
        </div>
      </div>
    </pinoutContext.Provider>
  );
}

const NiceNanoPinMode: Component<{
  pins: Accessor<Store<PinoutSelections>>;
  setPins: Accessor<SetStoreFunction<PinoutSelections>>;
}> = (props) => {
  return (
    <pinoutContext.Provider value={{
      pins: props.pins,
      setPins: props.setPins,
      info: () => (niceNanoV2.pins),
    }}>
      <div>
        <div class="text-2xl text-center font-bold mt-2">
          nice!nano v2
        </div>
        <div class="text-center text-xs mb-2">
          and clones
        </div>
        <div class="text-center mb-2">
          <a class="link" target="_blank" href="https://nicekeyboards.com/docs/nice-nano/pinout-schematic/">
            Pinout Reference
            <ExternalLink class="inline ml-1" />
          </a>
        </div>
        <div class="flex w-full flex-col md:flex-row justify-center items-center md:items-end p-2">
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d1" />
            <PinModeSelector pin="d0" />
            <PinModeSelector pin="d2" />
            <PinModeSelector pin="d3" />
            <PinModeSelector pin="d4" />
            <PinModeSelector pin="d5" />
            <PinModeSelector pin="d6" />
            <PinModeSelector pin="d7" />
            <PinModeSelector pin="d8" />
            <PinModeSelector pin="d9" />
          </div>
          <div class="divider md:divider-horizontal"></div>
          <div class="flex flex-col gap-2">
            <PinModeSelector pin="d21" />
            <PinModeSelector pin="d20" />
            <PinModeSelector pin="d19" />
            <PinModeSelector pin="d18" />
            <PinModeSelector pin="d15" />
            <PinModeSelector pin="d14" />
            <PinModeSelector pin="d16" />
            <PinModeSelector pin="d10" />
          </div>
        </div>
      </div>
    </pinoutContext.Provider>
  );
};

export const BoardPinModeSelectors: Record<Controller, Component<{
  pins: Accessor<Store<PinoutSelections>>;
  setPins: Accessor<SetStoreFunction<PinoutSelections>>
}>> = {
  [Controller.enum.nice_nano_v2]: NiceNanoPinMode,
  [Controller.enum.seeed_xiao_ble]: XiaoBlePinMode,
  [Controller.enum.seeed_xiao_ble_plus]: XiaoBlePlusPinMode,
}
