import ChevronLeft from "lucide-solid/icons/chevron-left";
import { createMemo, createSignal, Match, Show, Switch, type Component } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import { WiringType } from "~/lib/types";
import { useWizardContext } from "../context";
import { KeyboardLayoutPreview } from "../layout/preview";
import { BoardPinModeSelectors } from "../pinout/selectors";

export const StepPinout: Component = function () {
  const wizardContext = useWizardContext();

  const [currentPart, setCurrentPart] = createSignal(0);
  const currentPinStore = createMemo(() => createStore(wizardContext.keyboard.pinouts[currentPart()]));

  return (
    <div class="max-w-5xl mx-auto p-2 mt-2">
      <div class="text-center text-lg">
        Select the pins used on the controller
      </div>
      <Show when={wizardContext.keyboard.info.wiring === WiringType.enum.matrix_diode}>
        <div class="text-center text-sm text-gray-500">
          Diode direction will be calculated automatically
        </div>
      </Show>

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
              wizardContext.keyboard.pinouts.some(pinout => Object.keys(pinout).length === 0)
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
              onClick={() => setCurrentPart(0)}
            >
              Left
            </button>
            <button
              class="btn flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => setCurrentPart(1)}
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

        <KeyboardLayoutPreview heightClass="max-h-40" keys={() => wizardContext.keyboard.layout}>
          {(styles, key, index) => (
            <div class="absolute" style={styles()}>
              <Switch fallback={
                <div class="w-full h-full rounded-sm select-none border-slate-500 border-2 border-dashed">
                </div>
              }>
                <Match when={key.partOf === currentPart()}>
                  <div
                    class="w-full h-full rounded-sm select-none bg-slate-500 flex items-center justify-center"
                  >
                    <span class="text-white font-extrabold text-3xl">{index()}</span>
                  </div>
                </Match>
              </Switch>
            </div>
          )}
        </KeyboardLayoutPreview>

      </Show>

      <div class="m-4">
        <Dynamic
          component={BoardPinModeSelectors[wizardContext.keyboard.info.controller]}
          pins={() => currentPinStore()[0]} setPins={() => currentPinStore()[1]}
        />
      </div>
    </div>
  );
}
