import { createScheduled, leadingAndTrailing, throttle } from "@solid-primitives/scheduled";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import { createEffect, createMemo, createSignal, For, Match, mergeProps, onMount, Show, Switch, type Accessor, type Component } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { niceNanoV2, xiaoBle, xiaoBlePlus } from "~/lib/controllers";
import { Controller, PinMode, WiringType, type ControllerInfo, type Key, type PinoutSelections } from "~/lib/types";
import { useWizardContext } from "../context";
import { KeyboardLayoutPreview } from "../layout/preview";

export const StepWiring: Component = function () {
  const wizardContext = useWizardContext();

  const [currentPart, setCurrentPart] = createSignal(0);

  const keys = (() => wizardContext.keyboard.layout);
  const logicalKeys = createMemo(() => keys().map(key => ({
    ...key,
    width: 1,
    height: 1,
    x: key.column,
    y: key.row,
    r: 0,
    rx: 0,
    ry: 0,
  })));

  const currentController = createMemo<ControllerInfo>(() => {
    switch (wizardContext.keyboard.info.controller) {
      case Controller.enum.nice_nano_v2:
        return niceNanoV2;
      case Controller.enum.seeed_xiao_ble:
        return xiaoBle;
      case Controller.enum.seeed_xiao_ble_plus:
        return xiaoBlePlus;
      default:
        return { pins: {} }
    }
  });
  const pinDisplayName = (pin: string): string => currentController().pins[pin]?.name || ".";

  const activePinout = createMemo<PinoutSelections>(() => {
    return wizardContext.keyboard.pinouts[currentPart()];
  });

  const inputPins = createMemo<string[]>(() =>
    Object.entries(activePinout())
      .filter(([_pin, info]) => info && info === PinMode.enum.input)
      .map(([pin, _info]) => (pin))
  );

  const outputPins = createMemo<string[]>(() =>
    Object.entries(activePinout())
      .filter(([_pin, info]) => info && info === PinMode.enum.output)
      .map(([pin, _info]) => (pin))
  );

  const [selectedPin, setSelectedPin] = createSignal('');

  if (wizardContext.keyboard.wiring.length !== keys().length) {
    wizardContext.setKeyboard("wiring", keys().map(() => ({ input: null, output: null })));
  }

  {
    // cleanup keys partOf
    // in case user went back and changed split/unibody selection
    const maxPart = wizardContext.keyboard.pinouts.length - 1;
    // set partOf to maxPart for all keys that have partOf out of range
    wizardContext.setKeyboard("layout", (key) => key.partOf > maxPart, "partOf", maxPart);


    // cleanup wiring input/output
    // in case user went back and changed pinout selections
    wizardContext.setKeyboard("wiring", produce((wiring) => {
      wiring.forEach((w, index) => {
        const pinout = wizardContext.keyboard.pinouts[wizardContext.keyboard.layout[index].partOf];
        if (!pinout) {
          // should not happen
          w.input = null;
          w.output = null;
          return;
        }
        if (w.input && pinout[w.input] !== PinMode.enum.input) {
          w.input = null;
        }
        if (w.output && pinout[w.output] !== PinMode.enum.output) {
          w.output = null;
        }
      });
      return wiring;
    }));
  }

  onMount(() => {
    setSelectedPin(inputPins()[0] || "");
  });

  const [duplicatedPinSelection, setDuplicatedPinSelection] = createSignal<number[][]>([]);
  const throttleDuplicateDetect = createScheduled(fn => leadingAndTrailing(throttle, fn, 500));

  createEffect(() => {
    if (!throttleDuplicateDetect()) return;

    const pinsToKey: Record<string, number[]> = {};
    const matrixWiring = wizardContext.keyboard.info.wiring === WiringType.enum.matrix_diode || wizardContext.keyboard.info.wiring === WiringType.enum.matrix_no_diode;

    wizardContext.keyboard.wiring.forEach((w, index) => {
      if (!w.input) return;
      if (matrixWiring && !w.output) return;

      const recordKey = JSON.stringify([wizardContext.keyboard.layout[index].partOf, w.input, w.output]);
      if (!pinsToKey[recordKey]) {
        pinsToKey[recordKey] = [];
      }
      pinsToKey[recordKey].push(index);
    });

    const duplicatePins = Object.values(pinsToKey)
      .filter((keys) => keys.length > 1)
      .map((keys) => keys);

    setDuplicatedPinSelection(duplicatePins);
  });

  return (
    <div class="max-w-5xl mx-auto p-2 mt-2 mb-8">

      <div>
        <div class="text-center text-lg">
          Assign each key with it's associated pin{
            ([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(wizardContext.keyboard.info.wiring) && "s"
          }
        </div>
      </div>

      <div class="flex justify-center m-4">
        <div class="flex flex-row gap-2 w-full sm sm:w-auto mt-2 sm:mt-0">
          <button
            class="btn btn-outline flex-1 sm:w-auto"
            title="Go Back"
            onClick={wizardContext.stepBack}
          >
            <ChevronLeft />
          </button>
          <button
            class="btn btn-primary flex-1 sm:w-auto"
            disabled={
              // disable if not all assigned
              ([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(wizardContext.keyboard.info.wiring)
                ? wizardContext.keyboard.wiring.some(w => !w.input || !w.output)
                : wizardContext.keyboard.wiring.some(w => !w.input)
            }
            onClick={wizardContext.stepNext}
          >
            Next
          </button>
        </div>
      </div>

      <Show when={wizardContext.keyboard.pinouts.length > 1}>
        <div class="max-w-5xl mx-auto p-2">
          <p class="text-center">
            Split keyboard parts are configured separately.
          </p>

          <div class="flex justify-center gap-4 mb-6 max-w-xs mx-auto">
            <button
              class="btn flex-1 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setCurrentPart(0);
                setSelectedPin(inputPins()[0] || "");
              }}
            >
              Left
            </button>
            <button
              class="btn flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => {
                setCurrentPart(1);
                setSelectedPin(inputPins()[0] || "");
              }}
            >
              Right
            </button>
          </div>
        </div>
        <div
          class="text-center top-0 sticky text-lg font-semibold bg-base-100 p-8 rounded z-10"
        >
          <div class="">
            Configuring {
              currentPart() === 0
                ? (<span class="px-2 py-1 rounded bg-amber-600 text-white font-semibold shadow">Left</span>)
                : (<span class="px-2 py-1 rounded bg-teal-600 text-white font-semibold shadow">Right</span>)
            } side
          </div>
        </div>
      </Show>

      <Show when={duplicatedPinSelection().length > 0}>
        <div class="max-w-xl mx-auto p-2 alert alert-warning">
          <div>
            <div class="font-bold text-center">Duplicate pin selections</div>
            <div>
              <For each={duplicatedPinSelection()}>
                {(keys, i) => (
                  <>
                    <span>{i() ? '; key ' : 'Key '}</span>
                    <span class="font-semibold">
                      {keys.join(", ")}
                    </span>
                  </>
                )}
              </For>
              <span> are connected to the same pins, which probably is not what you want.</span>
            </div>
          </div>
        </div>
      </Show>

      {/* Pin selection area */}
      <div class="max-w-2xl mx-auto p-2">

        <Show when={([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(wizardContext.keyboard.info.wiring)}>
          <div class="text-lg text-center font-bold p-1 text-rose-500 border border-rose-500 rounded-lg">
            Output
            <span class="text-sm"> (Driving)</span>
          </div>
          <div class="my-2 flex gap-2 flex-wrap justify-center">
            <For each={outputPins()}>
              {(pin) => (
                <button
                  class="btn btn-soft min-w-15 text-rose-500"
                  classList={{ "btn-active underline border border-rose-500": selectedPin() === pin }}
                  onClick={() => setSelectedPin(pin)}
                >
                  {pinDisplayName(pin)}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="text-lg text-center font-bold p-1 text-lime-500 border border-lime-500 rounded-lg">
          Input
          <span class="text-sm"> (Sensing)</span>
        </div>
        <div class="my-2 flex gap-2 flex-wrap justify-center">
          <For each={inputPins()}>
            {(pin) => (
              <button
                class="btn btn-soft min-w-15 text-lime-500"
                classList={{ "btn-active underline border border-lime-500": selectedPin() === pin }}
                onClick={() => setSelectedPin(pin)}
              >
                {pinDisplayName(pin)}
              </button>
            )}
          </For>
        </div>

      </div>

      <div class="text-center my-4">
        Select a pin, then click/drag on keys to assign it.
      </div>

      <WiringPreview
        keys={keys}
        currentPart={currentPart}
        activePinout={activePinout}
        currentController={currentController}
        selectedPin={selectedPin}
      />

      <div class="divider"></div>

      <WiringPreview
        keys={logicalKeys}
        currentPart={currentPart}
        activePinout={activePinout}
        currentController={currentController}
        selectedPin={selectedPin}
      />
    </div>
  );
}

const WiringPreview: Component<{
  keys: Accessor<Key[]>,
  currentPart: Accessor<number>,
  activePinout: Accessor<PinoutSelections>,
  currentController: Accessor<ControllerInfo>,
  selectedPin: Accessor<string>,
}> = (props) => {
  const wizardContext = useWizardContext();

  const [wiring, setWiring] = createStore(wizardContext.keyboard.wiring);

  const pinDisplayName = (pin: string): string => props.currentController().pins[pin]?.name || ".";

  return (
    <KeyboardLayoutPreview keys={props.keys}>
      {(styles, key, index) => {
        const wiringForThisKey = mergeProps({
          input: null,
          output: null
        }, wiring[index()]);

        return (
          <div class="absolute" style={styles()}>
            <Switch fallback={
              <div class="w-full h-full rounded-sm select-none border-slate-500 border-2 border-dashed">
              </div>
            }>
              <Match when={key.partOf === props.currentPart()}>
                <div
                  class="w-full h-full rounded-sm select-none cursor-pointer p-0.5 text-xl/tight font-extrabold"
                  classList={{
                    "border-2 border-accent bg-slate-400": wiringForThisKey.input === props.selectedPin() || wiringForThisKey.output === props.selectedPin(),
                    "bg-slate-500": !(wiringForThisKey.input === props.selectedPin() || wiringForThisKey.output === props.selectedPin()),
                  }}
                  onMouseEnter={e => {
                    if (e.buttons === 1) {
                      setWiring(index(), props.activePinout()[props.selectedPin()] || 'input', props.selectedPin())
                    }
                  }}
                  onMouseDown={e => {
                    if (e.buttons === 1) {
                      setWiring(index(), props.activePinout()[props.selectedPin()] || 'input', props.selectedPin())
                    }
                  }}
                >
                  <div class="absolute top-0.5 left-0.5">
                    <div class="text-white text-sm/tight justify-self-start">{index()}</div>
                  </div>
                  <div class="w-full h-full flex flex-col items-center justify-center">
                    {
                      wiringForThisKey.input
                        ? <div class="text-lime-500">{pinDisplayName(wiringForThisKey.input!)}</div>
                        : (
                          <div class="text-warning relative">
                            ?
                            <div class="animate-ping absolute top-0 opacity-75">?</div>
                          </div>
                        )
                    }
                    {
                      ([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(wizardContext.keyboard.info.wiring) && (
                        wiringForThisKey.output
                          ? <div class="text-rose-500">{pinDisplayName(wiringForThisKey.output!)}</div>
                          : (
                            <div class="text-warning relative">
                              ?
                              <div class="animate-ping absolute top-0 opacity-75">?</div>
                            </div>
                          )
                      )
                    }
                  </div>
                </div>
              </Match>
            </Switch>
          </div>
        );
      }}
    </KeyboardLayoutPreview>
  );
}
