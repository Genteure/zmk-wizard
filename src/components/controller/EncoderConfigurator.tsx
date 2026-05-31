import { Button } from "@kobalte/core/button";
import { createMemo, For, Show, type Accessor, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { encoderPinUsage, getPinMode } from "~/typedef";
import { useWizardContext } from "../context";
import { controllerInfos } from "../controllerInfo";

export const EncoderConfigurator: VoidComponent<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);

  const controllerInfo = createMemo(() => controllerInfos[part().controller] || null);
  const availablePins = createMemo(() => Object.keys(controllerInfo()?.pins || {}));
  const pinLabelForPinId = (pinId: string): string => controllerInfo()?.pins?.[pinId]?.displayName || pinId;

  const isPinBusy = (pinId: string, current?: string) => {
    if (!pinId) return false;
    if (current && pinId === current) return false;
    return Boolean(part().pins?.[pinId]);
  };

  const addEncoder = () => {
    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      p.encoders = p.encoders || [];
      p.encoders.push({ pinA: undefined, pinB: undefined });
    }));
  };

  const setEncoderPin = (encoderIndex: number, key: "pinA" | "pinB", value?: string) => {
    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      p.encoders = p.encoders || [];
      const enc = p.encoders[encoderIndex];
      if (!enc) return;

      const prev = enc[key];
      if (prev && prev !== value) {
        // Check if the previous pin is still used by another encoder
        const stillUsed = p.encoders.some((other, idx) => idx !== encoderIndex && (other.pinA === prev || other.pinB === prev));
        if (!stillUsed && p.pins?.[prev] && getPinMode(p.pins[prev]) === "encoder") {
          delete p.pins[prev];
        }
      }

      enc[key] = value || undefined;

      if (value) {
        p.pins = p.pins || {};
        const encoderId = `encoder_${encoderIndex}`;
        const role = key as "pinA" | "pinB";
        p.pins[value] = encoderPinUsage(encoderId, role);
      }
    }));
  };

  const removeEncoder = (encoderIndex: number) => {
    const pinsRemoved: string[] = [];
    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      if (!p.encoders) return;
      const removed = p.encoders.splice(encoderIndex, 1)?.[0];
      if (!removed) return;

      const pinsToClear = [removed.pinA, removed.pinB].filter(Boolean) as string[];
      pinsToClear.forEach((pinId) => {
        const stillUsed = p.encoders.some((enc) => enc.pinA === pinId || enc.pinB === pinId);
        if (!stillUsed && p.pins?.[pinId] && getPinMode(p.pins[pinId]) === "encoder") {
          delete p.pins[pinId];
        }
      });

      pinsRemoved.push(...pinsToClear);
    }));

    if (pinsRemoved.some((pin) => context.nav.activeWiringPin === pin)) {
      context.setNav("activeWiringPin", null);
    }
  };

  return (
    <div class="border border-base-300 rounded-xl bg-base-200/60 p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="font-semibold">Encoders (EC11)</div>
          <div class="text-xs text-base-content/70">
            Shield Wizard only supports configuring rotation pins here,
            push button must be wired into the key matrix.
            Shield Wizard does not support configuring ZMK composite kscan.
          </div>
        </div>
        <Button class="btn btn-sm btn-soft" onClick={addEncoder}>Add encoder</Button>
      </div>

      <Show when={part().encoders.length} fallback={<div class="mt-2 text-sm text-base-content/60">No encoders.</div>}>
        <div class="mt-3 flex flex-col gap-2">
          <For each={part().encoders}>{(encoder, idx) => (
            <div class="border border-base-300 rounded-lg bg-base-100 p-3 flex flex-col gap-3">
              <div class="flex items-center justify-between cursor-default">
                <div>
                  <div class="font-semibold">Encoder {idx()}</div>
                  <div class="text-xs mt-px font-mono text-base-content/70">{(context.keyboard.parts.length > 1 ? "encoder_" + part().name : "encoder") + idx()}</div>
                </div>
                <Button class="btn btn-ghost btn-xs text-red-500" onClick={() => removeEncoder(idx())}>Remove</Button>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div class="flex flex-col gap-2 sm:flex-1">
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin A<span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span></span>
                    <select
                      class="select select-bordered select-sm w-full"
                      value={encoder.pinA || ""}
                      onChange={(e) => setEncoderPin(idx(), "pinA", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={availablePins()}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, encoder.pinA)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, encoder.pinA) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin C</span>
                    <select class="select select-bordered select-sm w-full" value="" disabled>
                      <option value="">GND</option>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin B<span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span></span>
                    <select
                      class="select select-bordered select-sm w-full"
                      value={encoder.pinB || ""}
                      onChange={(e) => setEncoderPin(idx(), "pinB", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={availablePins()}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, encoder.pinB)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, encoder.pinB) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                </div>
                <div class="flex flex-col gap-2 sm:flex-1">
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin S1</span>
                    <select
                      class="select select-bordered select-sm w-full"
                      value=""
                      disabled
                    >
                      {/*
                        TODO: Add composite kscan support.
                        Encoder push pins must be wired into the key matrix for now.
                      */}
                      <option value="">Part of matrix</option>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin S2</span>
                    <select class="select select-bordered select-sm w-full" value="" disabled>
                      <option value="">Part of matrix</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  );
};
