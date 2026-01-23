import { Button } from "@kobalte/core/button";
import { createEffect, createMemo, For, Show, type Accessor, type VoidComponent } from "solid-js";
import type { ShiftRegisterDevice } from "~/typedef";
import { useWizardContext } from "../context";

export const ShiftRegisterPinConfigurator: VoidComponent<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);

  /**
   * We can only ever have one shift register device, so no need to handle multiples.
   * We want to show pins just like ControllerPinConfigurator, user can select pins and assign them to keys as outputs.
   * Shift register pins can only be outputs, so we always set them as such, there's no state toggle (input/output/none).
   * Display shift register pins as SR0, SR1, ... SRn based on number of outputs (ngpios) configured on the device.
   * Use `shifter0`, `shifter1`, ... `shifterN` as pin IDs internally. Treat them specially as virtual pins. They don't need to be in the controller pin list.
   * Display a title showing these pins belong to the shift register on bus X (example: 74HC595 on spi1).
   */

  // TODO clear active pin if shift register is removed
  // TODO clear shift register pins from keys if shift register is removed
  // TODO clear shift register pins from keys when pin count is reduced

  // Shift register outputs are virtual pins (`shifter0…n`) that act as matrix outputs only.
  const shiftRegister = createMemo(() => {
    for (const bus of part().buses || []) {
      for (const device of bus.devices || []) {
        if (device.type === "74hc595") {
          return { bus, device: device as ShiftRegisterDevice } as const;
        }
      }
    }
    return null;
  });

  createEffect(() => {
    if (!context.nav.activeWiringPin?.startsWith("shifter")) return;
    if (!shiftRegister()) {
      context.setNav("activeWiringPin", null);
    }
  });

  return <div>
    <Show when={shiftRegister()}>
      {(entry) => {
        const shifterRows = createMemo(() => {
          const ngpios = entry()?.device?.ngpios ?? 8;
          const cols = 4;
          const rows = Math.max(1, Math.floor(ngpios / cols));
          return Array.from({ length: rows }, (_, r) => {
            const start = r * cols;
            return Array.from({ length: cols }, (_, c) => {
              const idx = start + c;
              return { id: `shifter${idx}`, label: `SR${idx}` };
            });
          });
        });

        return (
          <div class="border border-base-300 rounded-xl bg-base-200/60 p-4 select-none">
            <div class="font-semibold text-center">
              74HC595 on
              <span class="ml-1 badge badge-outline">{entry().bus.name}</span>
            </div>
            <div class="my-1 text-sm text-base-content/70 text-center">
              Shift register pins can only be used as matrix outputs.
            </div>
            <div class="flex flex-wrap gap-2 justify-center mt-4">
              <For each={shifterRows()}>{(row) => (
                <div class="flex gap-2">
                  <For each={row}>{(pin) => (
                    <Button
                      class="w-16 justify-center font-semibold rounded border cursor-pointer bg-red-500/10 text-red-600 border-red-500"
                      classList={{
                        "outline-2 outline-solid dark:outline-red-700 outline-red-300 drop-shadow-sm dark:drop-shadow-neutral-500 underline": context.nav.activeWiringPin === pin.id,
                      }}
                      onClick={() => context.setNav("activeWiringPin", pin.id)}
                    >
                      {pin.label}
                    </Button>
                  )}</For>
                </div>
              )}</For>
            </div>
          </div>
        );
      }}
    </Show>
  </div>;
};
