import { Button } from "@kobalte/core/button";
import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import CircleX from "lucide-solid/icons/circle-x";
import ExternalLink from "lucide-solid/icons/external-link";
import Info from "lucide-solid/icons/info";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, type Accessor, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import type { AnyBus, AnyBusDevice, BusDeviceTypeName, BusName, I2cBus, PinMode, PinSelection, ShiftRegisterDevice, SpiBus, WiringType } from "~/typedef";
import { AnyBusDeviceSchema } from "~/typedef";
import { addDeviceToBus, isI2cBus, isSpiBus } from "~/typehelper";
import { useWizardContext } from "./context";
import { busDeviceMetadata, busDeviceTypes, controllerInfos, deviceClassRules, getBusDeviceMetadata, pinPropKeysForDevice, requiredBusPinsForDevice, socBusData, type AllDeviceDataTypes, type AllWidgetTypes, type BusDeviceClass, type ControllerInfo, type DevicePropDefinition, type PinctrlI2cPinChoices, type PinctrlSpiPinChoices, type VisualPin } from "./controllerInfo";

const ControllerPin: VoidComponent<{
  pin: VisualPin,
  controllerInfo: ControllerInfo,
  left: boolean,
  usage?: PinMode,
  current?: boolean,
  setPinUsage?: (usage: 'input' | 'output' | 'none') => void,
  activateCurrentPin?: () => void,
  wiringType?: WiringType,
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [releaseOpen, setReleaseOpen] = createSignal(false);

  const pinLabel = createMemo(() => {
    if (props.pin.type !== 'gpio') return props.pin.text || '';
    return props.controllerInfo.pins[props.pin.id]?.displayName ?? props.pin.id;
  });

  const pinAka = createMemo(() => {
    if (props.pin.type !== 'gpio') return [];
    return props.controllerInfo.pins[props.pin.id]?.aka || [];
  });

  return (
    <div
      class="flex items-center gap-2"
      classList={{
        "flex-row-reverse": props.left,
      }}>

      <Popover open={open()} onOpenChange={setOpen} placement={props.left ? "left" : "right"} gutter={8}>
        <Popover.Anchor class="flex justify-center items-center">
          <Button disabled={props.pin.type !== 'gpio'} as={props.pin.type === 'gpio' ? undefined : "div"}
            class="w-14 font-bold rounded border select-none shrink-0 flex justify-center items-center"
            title={(() => {
              switch (props.usage) {
                case 'bus': return `${pinLabel()} is used for bus communication`;
                case 'encoder': return `${pinLabel()} is used by an encoder`;
                default: return undefined;
              }
            })()}
            classList={{
              "cursor-pointer text-base-content/50 border-dashed": props.pin.type === "gpio" && !props.usage, // usage is none
              "border-dotted cursor-not-allowed bg-blue-500/10 text-blue-600 border-blue-500": props.usage === "bus",
              "border-dotted cursor-not-allowed bg-cyan-500/10 text-cyan-600 border-cyan-500": props.usage === "encoder",
              "border-transparent": props.pin.type === "ui",
              "text-pink-500/80": props.pin.type === "ui" && props.pin.ui === "power",
              "text-slate-500/80": props.pin.type === "ui" && props.pin.ui === "gnd",
              "text-cyan-500/80": props.pin.type === "ui" && props.pin.ui === "rst",
              "cursor-pointer bg-red-500/10 text-red-500 border-red-500": props.usage === "output",
              "cursor-pointer bg-emerald-500/10 text-emerald-500 border-emerald-500": props.usage === "input",
              "underline": props.current,
              "outline-2 outline-solid dark:outline-emerald-700 outline-emerald-300 drop-shadow-sm dark:drop-shadow-neutral-500": props.current && props.usage === "input",
              "outline-2 outline-solid dark:outline-red-700 outline-red-300 drop-shadow-sm dark:drop-shadow-neutral-500": props.current && props.usage === "output",
            }}

            onClick={() => {
              if (props.pin.type !== 'gpio') return;
              if (!props.usage) {
                // currently not used, open popover to select usage
                setOpen(true)
              } else if (props.usage === 'input' || props.usage === 'output') {
                props.activateCurrentPin?.();
              }
            }}
          >
            {pinLabel() || <>&nbsp;</>}
          </Button>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            class="popover--content w-40 p-2 flex flex-col gap-1 text-center"
          >
            <div>Use pin <span class="font-bold">{pinLabel()}</span> as</div>

            {/* input */}
            <Button
              // TODO fix button colors
              class="btn btn-md text-emerald-500 bg-emerald-500/10 border-emerald-500"
              onClick={() => {
                if (props.pin.type === 'gpio') {
                  props.setPinUsage?.('input');
                }
                setOpen(false);
              }}
            >
              Input
            </Button>
            {/* output */}
            <Show when={props.wiringType === 'matrix_diode' || props.wiringType === 'matrix_no_diode'}>
              <Button
                // TODO fix button colors
                class="btn btn-md text-red-500 bg-red-500/10 border-red-500"
                onClick={() => {
                  if (props.pin.type === 'gpio') {
                    props.setPinUsage?.('output');
                  }
                  setOpen(false);
                }}
              >
                Output
              </Button>
            </Show>
            <Show when={pinAka().length}>
              <div class="text-xs">
                <span class="font-bold">{pinLabel()}</span> is also known as <span class="font-bold">{pinAka().join(", ")}</span> on this board.
              </div>
            </Show>

            <Show when={props.wiringType === 'matrix_diode'}>
              <div class="flex items-center justify-center text-xs gap-1">
                <div class="flex flex-col items-center">
                  <span>Output</span>
                  <span class="text-base-content/75">anode</span>
                </div>

                <svg class="diode-svg inline-block w-8" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"
                  stroke="currentColor" fill="currentColor" stroke-width="2">
                  <line x1="0" y1="10" x2="10" y2="10"></line>
                  <line x1="30" y1="10" x2="40" y2="10"></line>
                  <polygon points="10,0 10,20 30,10" stroke-width=".1"></polygon>
                  <line x1="30" y1="0" x2="30" y2="20"></line>
                </svg>

                <div class="flex flex-col items-center">
                  <span>Input</span>
                  <span class="text-base-content/75">cathode</span>
                </div>
              </div>
            </Show>
            {/* <Show when={props.wiringType === 'matrix_diode' || props.wiringType === 'matrix_no_diode'}>
              <div class="text-xs/snug text-base-content/75">
                Controller will toggle output pins and read signals from input pins.
              </div>
            </Show> */}
          </Popover.Content>
        </Popover.Portal>
      </Popover>

      <Show when={props.pin.type === 'gpio'}>
        <Popover open={releaseOpen()} onOpenChange={setReleaseOpen} placement={props.left ? "right" : "left"} gutter={8}>
          <Popover.Anchor class="flex justify-center items-center">
            <Button
              class="text-red-500/50 hover:text-red-500 hover:bg-red-500/20 cursor-pointer rounded-full p-1 transition-colors ui-disabled:bg-transparent ui-disabled:text-transparent ui-disabled:pointer-events-none"
              disabled={props.usage !== 'input' && props.usage !== 'output'}
              onClick={e => {
                // Release pin button clicked
                // Release a pin from keyboard keys (input/output)
                if (props.pin.type === 'gpio') {
                  if (e.shiftKey) {
                    props.setPinUsage?.('none');
                  } else {
                    setReleaseOpen(true);
                  }
                }
              }}
              title={`Release ${pinLabel()}`}
            >
              <CircleX class="w-4 h-4" />
            </Button>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content class="popover--content w-64 p-3 flex flex-col gap-2 text-center" aria-label="Confirm release">
              <div class="flex items-center justify-center gap-2 text-red-600">
                <TriangleAlert class="w-5 h-5" />
                <span class="font-semibold">Release {pinLabel()} ?</span>
              </div>
              <div class="text-xs text-base-content/70">
                This will clear the current role for this pin. Click outside to cancel.
              </div>
              <Button
                class="btn btn-sm bg-red-500/10 text-red-600 border-red-500 hover:bg-red-500/20"
                onClick={() => {
                  if (props.pin.type === 'gpio') {
                    props.setPinUsage?.('none');
                    setReleaseOpen(false);
                  }
                }}
              >
                Release {pinLabel()}
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      </Show>
    </div>
  );
};

export const ControllerPinConfigurator: VoidComponent<{
  partIndex: Accessor<number>,
  controllerId: keyof typeof controllerInfos,
}> = (props) => {
  const context = useWizardContext();
  const info = createMemo(() => controllerInfos[props.controllerId] || null);
  const keyboardPins = createMemo(() => context.keyboard.parts[props.partIndex()].pins || {});

  const clearPinUsage = (pinId: string) => {
    const partIdx = props.partIndex();
    context.setKeyboard("parts", partIdx, produce((part) => {
      Object.entries(part.keys || {}).forEach(([keyId, wiring]) => {
        if (!wiring) return;
        if (wiring.input === pinId) wiring.input = undefined;
        if (wiring.output === pinId) wiring.output = undefined;
        if (!wiring.input && !wiring.output) delete part.keys[keyId];
      });

      if (part.pins && pinId in part.pins) {
        delete part.pins[pinId];
      }
    }));

    context.setKeyboard("parts", partIdx, "pins", pinId, undefined);

    if (context.nav.activeWiringPin === pinId) {
      context.setNav("activeWiringPin", null);
    }
  };

  const setPinUsage = (pinId: string, usage: 'input' | 'output' | 'none') => {
    if (usage === 'none') {
      clearPinUsage(pinId);
      return;
    }

    context.setKeyboard("parts", props.partIndex(), "pins", pinId, usage);
    context.setNav("activeWiringPin", pinId);
  };

  if (!info()) {
    return <div class="p-2 italic text-center text-sm text-base-content/50">
      No controller selected.
    </div>;
  }

  // Clear active pin on unmount
  onCleanup(() => {
    context.setNav("activeWiringPin", null);
  });
  return <div class="p-2 w-full">
    <div class="max-w-4xl mx-auto">
      <div class="flex justify-center">
        <div class="border rounded-xl gap-4 flex flex-row flex-nowrap p-4">
          <div class="flex flex-nowrap flex-col gap-1">
            <For each={info().visual.left}>
              {(pin) => {
                const usage = (() => pin.type === 'gpio'
                  ? (keyboardPins()[pin.id])
                  : undefined);

                return <ControllerPin
                  pin={pin}
                  controllerInfo={info()}
                  left={true}
                  usage={usage()}
                  current={pin.type === 'gpio' ? context.nav.activeWiringPin === pin.id : false}
                  setPinUsage={(nextUsage) => {
                    if (pin.type === 'gpio') setPinUsage(pin.id, nextUsage);
                  }}
                  activateCurrentPin={() => {
                    if (pin.type === 'gpio') context.setNav("activeWiringPin", pin.id);
                  }}
                  wiringType={context.keyboard.parts[props.partIndex()].wiring}
                />;
              }}
            </For>
          </div>
          <div class="flex flex-nowrap flex-col gap-1">
            <For each={info().visual.right}>
              {(pin) => {
                const usage = (() => pin.type === 'gpio'
                  ? (keyboardPins()[pin.id])
                  : undefined);

                return <ControllerPin
                  pin={pin}
                  controllerInfo={info()}
                  left={false}
                  usage={usage()}
                  current={pin.type === 'gpio' ? context.nav.activeWiringPin === pin.id : false}
                  setPinUsage={(nextUsage) => {
                    if (pin.type === 'gpio') setPinUsage(pin.id, nextUsage);
                  }}
                  activateCurrentPin={() => {
                    if (pin.type === 'gpio') context.setNav("activeWiringPin", pin.id);
                  }}
                  wiringType={context.keyboard.parts[props.partIndex()].wiring}
                />;
              }}
            </For>
          </div>
        </div>
      </div>
      <div class="m-2 flex justify-center">
        <Link
          href={info().docLink}
          target="_blank"
          rel="noopener noreferrer"
          class="link flex flex-col items-center"
        >
          <span>
            Pinout Reference
            <ExternalLink class="w-5 h-5 ml-1 inline-block" />
          </span>
          <span class="text-xs text-base-content/60">
            {info().docLink}
          </span>
        </Link>
      </div>
      <Switch>
        <Match when={props.controllerId === "xiao_ble_plus"}>
          <div class="mx-auto max-w-md mt-4 p-2 text-sm text-center text-base-content/75">
            <TriangleAlert class="w-6 h-6 inline-block mr-1 text-warning" />
            Pin <span class="font-bold">D16</span> / <span class="font-bold">P0.31</span> is connected
            to <span class="font-bold">BAT+</span> via 1MΩ resistor as part of the battery voltage divider.
            Do not connect <span class="font-bold">D16</span>! It can not be used for anything else!
          </div>
        </Match>
        <Match when={props.controllerId === "kb2040"}>
          <div class="mx-auto max-w-md mt-4 p-2 text-sm text-center text-base-content/75">
            <TriangleAlert class="w-6 h-6 inline-block mr-1 text-warning" />
            Adafruit labels top left pins
            as <span class="font-bold">D0</span> (for <span class="underline">GPIO0</span>), <span class="font-bold">D1</span> (for <span class="underline">GPIO1</span>).
            In ZMK, for consistency with other "pro micro" shaped boards, we refer to them
            as <span class="font-bold">D1</span> (for <span class="underline">GPIO0</span>) and <span class="font-bold">D0</span> (for <span class="underline">GPIO1</span>).
          </div>
        </Match>
      </Switch>
    </div>
  </div>;
}

function defaultDevice(type: BusDeviceTypeName): AnyBusDevice {
  const defaults = busDeviceMetadata[type]?.defaults ?? {};
  return AnyBusDeviceSchema.parse({ type, ...defaults });
}

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
      p.encoders.push({ pinA: undefined, pinB: undefined, pinS: undefined });
    }));
  };

  const setEncoderPin = (encoderIndex: number, key: "pinA" | "pinB" | "pinS", value?: string) => {
    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      p.encoders = p.encoders || [];
      const enc = p.encoders[encoderIndex];
      if (!enc) return;

      const prev = enc[key];
      if (prev && prev !== value && p.pins?.[prev] === "encoder") {
        const stillUsed = p.encoders.some((other, idx) => idx !== encoderIndex && (other.pinA === prev || other.pinB === prev || other.pinS === prev));
        if (!stillUsed) {
          delete p.pins[prev];
        }
      }

      enc[key] = value || undefined;

      if (value) {
        p.pins = p.pins || {};
        p.pins[value] = "encoder";
      }
    }));
  };

  const removeEncoder = (encoderIndex: number) => {
    const pinsRemoved: string[] = [];
    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      if (!p.encoders) return;
      const removed = p.encoders.splice(encoderIndex, 1)?.[0];
      if (!removed) return;

      const pinsToClear = [removed.pinA, removed.pinB, removed.pinS].filter(Boolean) as string[];
      pinsToClear.forEach((pinId) => {
        const stillUsed = p.encoders.some((enc) => enc.pinA === pinId || enc.pinB === pinId || enc.pinS === pinId);
        if (!stillUsed && p.pins?.[pinId] === "encoder") {
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
                        This in current state will not work since even we do custom composite kscan
                        for encoder push pins, the key will not be in the key layout thus missing in
                        matrix transform and physical layout. We need to actually support composite
                        kscan from the start to do custom encoder push buttons here.
                        TODO Add cmposite kscan support
                        value={encoder.pinS || ""}
                        onChange={(e) => setEncoderPin(idx(), "pinS", e.currentTarget.value || undefined)}
                      */}
                      <option value="">Part of matrix</option>
                      {/* <For each={availablePins()}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, encoder.pinS)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, encoder.pinS) ? " (in use)" : "")}
                        </option>
                      )}</For> */}
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">Pin S2</span>
                    <select class="select select-bordered select-sm w-full" value="" disabled>
                      <option value="">{encoder.pinS ? "GND" : "Part of matrix"}</option>
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

type DevicePropFieldProps = {
  label: string;
  required: boolean;
  desc?: string | undefined;
  value: AllDeviceDataTypes;
  propKey: string;
  propDef: DevicePropDefinition<AllDeviceDataTypes | undefined>;
  onChange: (value: AllDeviceDataTypes | undefined) => void;
  pins?: readonly string[] | undefined;
  isPinBusy?: (pin: string, current?: string) => boolean;
  pinLabelForPinId: (pinId: string) => string;
};

const devicePropWidgetRenderers: Record<AllWidgetTypes, VoidComponent<DevicePropFieldProps>> = {
  pin: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">
        {props.label}{props.required ? <span class="text-red-500 ml-1" title="Required">*</span> : null}
      </span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as string) || ""}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">{props.required ? "Select pin" : "None"}</option>
        <For each={props.pins}>{(pin) => (
          <option value={pin} disabled={props.isPinBusy?.(pin, props.value as string | undefined)}>
            {props.pinLabelForPinId(pin) + (props.isPinBusy?.(pin, props.value as string | undefined) ? " (in use)" : "")}
          </option>
        )}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  checkbox: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={Boolean(props.value)}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
      </div>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  numberOptions: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as number | undefined) ?? ""}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      >
        <For each={(props.propDef.options as number[] | undefined)}>{(opt) => <option value={opt}>{opt}</option>}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  stringOptions: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as string | undefined) ?? ""}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={(props.propDef.options as string[] | undefined)}>{(opt) => <option value={opt}>{opt}</option>}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  dec: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <input
        class="input input-bordered input-sm"
        type="number"
        min={props.propDef.min}
        max={props.propDef.max}
        value={(props.value as number | undefined) ?? ""}
        onInput={(e) => {
          const raw = e.currentTarget.value;
          const parsed = raw === "" ? NaN : Number(raw);
          props.onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  hex: (props) => {
    const formatHex = (value: number | undefined) => value === undefined ? "" : value.toString(16);

    const [inputValue, setInputValue] = createSignal(formatHex(props.value as number | undefined));
    const [lastValid, setLastValid] = createSignal(formatHex(props.value as number | undefined));

    createEffect(() => {
      const formatted = formatHex(props.value as number | undefined);
      setLastValid(formatted);
      setInputValue(formatted);
    });

    const parseHex = (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "") return { kind: "empty" } as const;
      const normalized = trimmed.toLowerCase().startsWith("0x") ? trimmed.slice(2) : trimmed;
      if (normalized === "") return { kind: "empty" } as const;
      if (!/^[0-9a-fA-F]+$/.test(normalized)) return { kind: "invalid" } as const;
      const parsed = parseInt(normalized, 16);
      if (Number.isNaN(parsed)) return { kind: "invalid" } as const;
      if (typeof props.propDef.min === "number" && parsed < props.propDef.min) return { kind: "invalid" } as const;
      if (typeof props.propDef.max === "number" && parsed > props.propDef.max) return { kind: "invalid" } as const;
      return { kind: "value", value: parsed } as const;
    };

    return (
      <label class="flex flex-col gap-1">
        <span class="text-sm uppercase text-base-content/75">{props.label}</span>
        <div
          class="input input-bordered input-sm font-mono"
        >
          <span>0x</span>
          <input
            type="text"
            inputmode="text"
            pattern="^(0x)?[0-9a-fA-F]*$"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            value={inputValue()}
            onInput={(e) => {
              const raw = e.currentTarget.value;
              setInputValue(raw);
              const result = parseHex(raw);
              if (result.kind === "value") {
                const formatted = formatHex(result.value);
                setLastValid(formatted);
                props.onChange(result.value);
              } else if (result.kind === "empty") {
                setLastValid("");
                props.onChange(undefined);
              }
            }}
            onBlur={() => {
              const result = parseHex(inputValue());
              if (result.kind === "invalid") {
                setInputValue(lastValid());
                return;
              }
              if (result.kind === "value") {
                const formatted = formatHex(result.value);
                setLastValid(formatted);
                setInputValue(formatted);
                return;
              }
              setInputValue("");
            }}
          />
        </div>
        <Show when={props.desc}>
          <span class="text-xs/tight text-base-content/60">{props.desc}</span>
        </Show>
      </label>
    );
  },
};

const AddDevicePanel: VoidComponent<{
  buses: Accessor<AnyBus[]>;
  controllerInfo: Accessor<ControllerInfo | null>;
  disabledByConflictBuses: Accessor<Set<BusName>>;
  conflictingActiveFor: (busName: BusName) => BusName[];
  busHasExclusive: (bus: AnyBus) => boolean;
  hasDeviceType: (type: BusDeviceTypeName) => boolean;
  addDevice: (busIdx: number, type: BusDeviceTypeName) => void;
}> = (panelProps) => {
  const [busPickerType, setBusPickerType] = createSignal<BusDeviceTypeName | null>(null);

  const deviceOptionsForController = createMemo(() => {
    return busDeviceTypes.filter((type: BusDeviceTypeName) => {
      const meta = getBusDeviceMetadata(type);
      return panelProps.buses().some((bus) => bus.type === meta.bus);
    });
  });

  const busesForType = (type: BusDeviceTypeName) => {
    const meta = getBusDeviceMetadata(type);
    return panelProps.buses().filter((bus) => bus.type === meta.bus);
  };

  const busEligible = (type: BusDeviceTypeName, bus: AnyBus) => {
    const meta = getBusDeviceMetadata(type);
    if (meta.bus !== bus.type) return false;
    if (panelProps.disabledByConflictBuses().has(bus.name)) return false;
    if (panelProps.busHasExclusive(bus)) return false;
    if ((bus.devices || []).length > 0 && meta.exclusive) return false;
    return true;
  };

  // const busDisabledReason = (type: BusDeviceTypeName, bus: AnyBus) => {
  //   const blockers = panelProps.conflictingActiveFor(bus.name);
  //   if (panelProps.disabledByConflictBuses().has(bus.name)) {
  //     return `Conflicts with active bus${blockers.length > 1 ? "es" : ""} ${blockers.join(", ")}`;
  //   }
  //   if (panelProps.busHasExclusive(bus)) return "Bus has an exclusive device";
  //   const meta = getBusDeviceMetadata(type);
  //   if (meta.exclusive && (bus.devices || []).length > 0) return "Exclusive device cannot share bus";
  //   return "";
  // };

  const classLimitReachedForType = (type: BusDeviceTypeName) => {
    const countDevicesOfClassInPart = (deviceClass: BusDeviceClass) => {
      let count = 0;
      for (const bus of panelProps.buses()) {
        for (const d of bus.devices || []) {
          const m = getBusDeviceMetadata(d.type);
          if (m?.class === deviceClass) count++;
        }
      }
      return count;
    };

    const meta = getBusDeviceMetadata(type);
    const rule = meta ? deviceClassRules[meta.class as keyof typeof deviceClassRules] : undefined;
    if (!rule || typeof rule.maxPerPart !== "number") return false;
    return countDevicesOfClassInPart(meta.class) >= rule.maxPerPart;
  };

  const deviceDisabledReason = (type: BusDeviceTypeName): string => {
    const meta = getBusDeviceMetadata(type);
    if (classLimitReachedForType(type)) {
      switch (meta.class) {
        case "display": return "Only one display per part";
        case "led_strip": return "Only one LED device per part";
        case "shift_register": return "Only one shift register per part";
        default: return "Class limit reached";
      }
    }
    const buses = busesForType(type);
    if (buses.length === 0) return "No compatible buses on this controller";
    if (buses.every((bus) => !busEligible(type, bus))) return "No available buses";
    return "";
  };

  const deviceButtonDisabled = (type: BusDeviceTypeName) => {
    // Special case: nice!view needs BLE which is not available on rp2040
    // If we ever needs a second check here, move to data driven approach
    // Do not add more hardcoded exceptions here!
    if (type === 'niceview' && panelProps.controllerInfo()?.soc === 'rp2040') return true;

    if (classLimitReachedForType(type)) return true;
    const buses = busesForType(type);
    if (buses.length === 0) return true;
    return buses.every((bus) => !busEligible(type, bus));
  };

  return (
    <div class="border border-base-300 rounded-xl bg-base-200/50 p-3">
      <div class="font-semibold text-sm">Add device</div>
      {/* <div class="text-xs text-base-content/75">Choose a device, then select a bus.</div> */}
      <div class="mt-2 flex flex-wrap gap-2">
        <For each={deviceOptionsForController()}>{(type) => {
          const disabled = createMemo(() => deviceButtonDisabled(type));
          const setOpen = (next: boolean) => setBusPickerType(next ? type : null);

          return (
            <Popover open={busPickerType() === type} onOpenChange={(next) => !disabled() && setOpen(next)} placement="bottom-start" gutter={6}>
              <Popover.Anchor>
                <Button
                  class="btn btn-sm btn-soft"
                  disabled={disabled()}
                  title={disabled() ? deviceDisabledReason(type) : undefined}
                  onClick={() => {
                    if (disabled()) return;
                    setOpen(!(busPickerType() === type));
                  }}
                >
                  {(getBusDeviceMetadata(type))?.shortName || type}
                </Button>
              </Popover.Anchor>
              <Popover.Portal>
                <Popover.Content class="popover--content w-64 max-w-sm p-3 flex flex-col gap-2" aria-label={`Add ${(getBusDeviceMetadata(type))?.fullName || type}`}>
                  <div class="text-sm text-center font-semibold">Add {(getBusDeviceMetadata(type))?.fullName || type}</div>
                  <div class="flex flex-wrap gap-2">
                    <For each={busesForType(type)}>{(bus) => {
                      const enabled = () => busEligible(type, bus);
                      return (
                        <Button
                          class="btn btn-soft w-full"
                          disabled={!enabled()}
                          // title={enabled() ? undefined : busDisabledReason(type, bus)}
                          onClick={() => {
                            if (!enabled()) return;
                            panelProps.addDevice(panelProps.buses().findIndex((b) => b.name === bus.name), type);
                            setOpen(false);
                          }}
                        >
                          {bus.name}
                        </Button>
                      );
                    }}</For>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          );
        }}</For>
      </div>

      <div class="text-xs text-base-content/75 mt-2">
        Configuring SPI/I2C devices was not tested thoroughly with all possible configurations and may produce broken builds.
        Please join the <Link class="link" href="https://zmk.dev/community/discord/invite" target="_blank" rel="noopener noreferrer">ZMK Community Discord</Link> for help
        and send feedback to @genteure.
      </div>
    </div>
  );
};

export const BusDevicesConfigurator: VoidComponent<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);
  const buses = (() => part().buses);

  const controllerInfo = createMemo(() => controllerInfos[part().controller]);
  const socBusMetadata = createMemo(() => socBusData[controllerInfo().soc]);
  const busTooltip = () => socBusMetadata().tooltip;

  const pinLabelForPinId = (pinId: string): string => controllerInfo().pins[pinId]?.displayName || pinId;

  const hasDeviceType = (type: BusDeviceTypeName) => {
    return buses().some((bus) => (bus.devices || []).some((d) => d.type === type));
  };

  const activeBuses = createMemo(() => buses().filter((bus) => (bus.devices || []).length > 0));

  /// Calculate disabled buses due to conflicts with already selected buses
  const disabledByConflictBuses = createMemo(() => {
    const conflicts: Set<BusName> = new Set();
    for (const bus of activeBuses()) {
      const conflictList = socBusMetadata().conflicts[bus.name] || [];
      for (const conflictBusName of conflictList) conflicts.add(conflictBusName);
    }
    return conflicts;
  });

  const conflictingActiveFor = (busName: BusName) => activeBuses()
    .filter((bus) => (socBusMetadata().conflicts[bus.name] || []).includes(busName))
    .map((bus) => bus.name);

  const busHasExclusive = (b: AnyBus) => (b.devices || []).some((d) => getBusDeviceMetadata(d.type).exclusive);

  type BusPinKey = "sda" | "scl" | "mosi" | "miso" | "sck";
  type SkipUsage = { busIndex: number; key: BusPinKey };

  const isPinUsedInPart = (partState: { buses?: AnyBus[]; pins?: PinSelection }, pinId: string, skip: SkipUsage[] = []) => {
    // pin used for non-bus purpose on this part
    const usage = partState.pins?.[pinId];
    if (usage && usage !== "bus") return true;

    const shouldSkip = (idx: number, key: BusPinKey) => skip.some((s) => s.busIndex === idx && s.key === key);

    for (const [idx, bus] of (partState.buses || []).entries()) {
      if (isI2cBus(bus)) {
        if (!shouldSkip(idx, "sda") && bus.sda === pinId) return true;
        if (!shouldSkip(idx, "scl") && bus.scl === pinId) return true;
      } else if (isSpiBus(bus)) {
        if (!shouldSkip(idx, "mosi") && bus.mosi === pinId) return true;
        if (!shouldSkip(idx, "miso") && bus.miso === pinId) return true;
        if (!shouldSkip(idx, "sck") && bus.sck === pinId) return true;
      }

      for (const device of bus.devices || []) {
        for (const propKey of pinPropKeysForDevice(device.type)) {
          const propPin = (device as Record<string, string | undefined>)[propKey];
          if (propPin === pinId) return true;
        }
      }
    }

    return false;
  };

  // TODO validate what is this doing
  const clearBusPins = (bus: AnyBus, partPins?: PinSelection) => {
    const unset = (pinId?: string) => {
      if (!pinId) return;
      if (partPins && partPins[pinId] === "bus") {
        delete partPins[pinId];
      }
    };

    if (isI2cBus(bus)) {
      unset(bus.sda); bus.sda = undefined;
      unset(bus.scl); bus.scl = undefined;
    } else if (isSpiBus(bus)) {
      unset(bus.mosi); bus.mosi = undefined;
      unset(bus.miso); bus.miso = undefined;
      unset(bus.sck); bus.sck = undefined;
    }
  };

  const setBusPin = (busIndex: number, key: "sda" | "scl" | "mosi" | "miso" | "sck", value?: string) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;

      if (isI2cBus(bus) && (key === "sda" || key === "scl")) {
        // const prev = key === "sda" ? bus.sda : bus.scl;
        const prev = bus[key];
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          const stillUsed = isPinUsedInPart(part, prev, [{ busIndex, key }]);
          if (!stillUsed) {
            delete part.pins[prev];
          }
        }
        bus[key] = value;
      } else if (isSpiBus(bus) && (key === "mosi" || key === "miso" || key === "sck")) {
        // const prev = key === "mosi" ? bus.mosi : key === "miso" ? bus.miso : bus.sck;
        const prev = bus[key];
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          const stillUsed = isPinUsedInPart(part, prev, [{ busIndex, key }]);
          if (!stillUsed) {
            delete part.pins[prev];
          }
        }
        bus[key] = value;
      } else {
        // invalid key for bus type
        return;
      }

      if (value) {
        part.pins = part.pins || {};
        part.pins[value] = "bus";
      }

      if (!bus.devices || bus.devices.length === 0) {
        // TOOO validate what this call is doing
        clearBusPins(bus, part.pins);
      }
    }));
  };

  const setDeviceField = (busIndex: number, deviceIndex: number, key: string, value: unknown) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;
      const device = bus.devices?.[deviceIndex];
      if (!device) return;
      const meta = getBusDeviceMetadata(device.type);
      if (!meta) return;
      const prop = meta.props[key as keyof typeof meta.props] as DevicePropDefinition<unknown> | undefined;
      if (!prop) return;
      const deviceRecord = device as Record<string, unknown>;

      if (prop.widget === "pin") {
        const prev = deviceRecord[key] as string | undefined;
        const next = typeof value === "string" && value.length > 0 ? value : undefined;
        if (prev && prev !== next && part.pins?.[prev] === "bus") {
          delete part.pins[prev];
        }
        deviceRecord[key] = next;
        if (next) {
          part.pins = part.pins || {};
          part.pins[next] = "bus";
        }
        return;
      }

      if (prop.widget === "checkbox") {
        deviceRecord[key] = Boolean(value);
        return;
      }

      if (typeof value === "number" && !Number.isNaN(value)) {
        deviceRecord[key] = value;
      }
    }));
  };

  const removeDevice = (busIndex: number, deviceIndex: number) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;
      const removed = bus.devices?.splice(deviceIndex, 1)?.[0];
      if (removed) {
        const pinProps = pinPropKeysForDevice(removed.type);
        pinProps.forEach((propKey) => {
          const pinId = (removed as Record<string, string | undefined>)[propKey];
          if (pinId && part.pins?.[pinId] === "bus") {
            delete part.pins[pinId];
          }
        });
      }
      if (!bus.devices || bus.devices.length === 0) {
        clearBusPins(bus, part.pins);
      }
    }));
  };

  const addDevice = (busIndex: number, type: BusDeviceTypeName) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const targetBus = part.buses?.[busIndex];
      if (!targetBus) return;

      const meta = getBusDeviceMetadata(type);
      if (meta.bus !== targetBus.type) return;

      // Enforce per-part class limits (e.g., only one display/LED/shift register)
      const rule = deviceClassRules[meta.class];
      if (typeof rule.maxPerPart === "number") {
        let count = 0;
        for (const b of part.buses) {
          for (const d of b.devices) {
            const m = getBusDeviceMetadata(d.type);
            if (m?.class === meta.class) count++;
          }
        }
        if (count >= rule.maxPerPart) return;
      }

      if (busHasExclusive(targetBus)) return;

      if (targetBus.devices.length > 0 && meta.exclusive) return;

      const device = defaultDevice(type);
      addDeviceToBus(targetBus, structuredClone(device));
    }));
  };

  const BusCard: VoidComponent<{ bus: AnyBus; index: number }> = (cardProps) => {
    const busForPinAccess = createMemo(() => cardProps.bus as Partial<I2cBus> & Partial<SpiBus>);

    const pinChoices = createMemo(() => controllerInfo()?.pinctrlChoices(cardProps.bus.name) ?? null);
    const pinChoicesForPinAccess = () => pinChoices() as (Partial<PinctrlI2cPinChoices> & Partial<PinctrlSpiPinChoices>) | null;

    const pinChoicesHas = (type: 'i2c' | 'spi', signal: keyof PinctrlI2cPinChoices | keyof PinctrlSpiPinChoices) => {
      const choices = pinChoices();
      if (type === 'i2c') {
        if (choices?.type !== 'i2c') return false;
        return !!((choices as PinctrlI2cPinChoices)[signal as keyof PinctrlI2cPinChoices]);
      } else {
        if (choices?.type !== 'spi') return false;
        return !!((choices as PinctrlSpiPinChoices)[signal as keyof PinctrlSpiPinChoices]);
      }
    };

    const requiredBySoc = createMemo(() => socBusMetadata().pinRequirements[cardProps.bus.name] || []);
    const requiredPins = createMemo(() => {
      const set = new Set<string>();
      // Device level requirements
      for (const d of cardProps.bus.devices || []) {
        requiredBusPinsForDevice(d.type).forEach((pin) => set.add(pin));
      }
      // SoC-level hardware requirements
      for (const k of requiredBySoc()) set.add(k);
      return set;
    });

    const isActive = createMemo(() => (cardProps.bus.devices.length || 0) > 0);
    const isConflicted = createMemo(() => disabledByConflictBuses().has(cardProps.bus.name));
    const conflictedWith = createMemo(() => conflictingActiveFor(cardProps.bus.name));

    const isPinBusy = (pinId: string, current?: string) => {
      if (!pinId) return false;
      if (current && pinId === current) return false;
      return isPinUsedInPart(part(), pinId);
    };

    const isBusPinBusy = (pinId: string, signal: BusPinKey) => {
      if (!pinId) return false;

      const skip: SkipUsage[] = [{ busIndex: cardProps.index, key: signal }];
      if (isSpiBus(cardProps.bus) && (signal === "mosi" || signal === "miso")) {
        const counterpart = signal === "mosi" ? "miso" : "mosi";
        if (cardProps.bus[counterpart] === pinId) {
          skip.push({ busIndex: cardProps.index, key: counterpart });
        }
      }

      const current = busForPinAccess()[signal];
      if (current && pinId === current) return false;

      return isPinUsedInPart(part(), pinId, skip);
    };

    return (
      <div
        class="border border-base-300 rounded-xl bg-base-200/50 p-3 flex flex-col gap-3 transition-opacity select-none"
        classList={{
          "border-dashed border-2": isConflicted() && !isActive(),
        }}
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span
              class="badge badge-outline font-bold"
              classList={{
                "badge-dash opacity-50": !isActive() || (isConflicted() && !isActive()),
                "badge-success": isActive() && !isConflicted(),
                "badge-warning": isConflicted(),
              }}
            >
              {cardProps.bus.type.toUpperCase()}
            </span>
            <span class="font-semibold text-lg">{cardProps.bus.name}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-base-content/60">
            <Show when={!isConflicted()} fallback={
              <span class="badge badge-warning badge-sm" title={`Conflicts with ${conflictedWith().join(", ")}`}>
                Unavailable
              </span>
            }>
              <Show when={isActive()} fallback={<span class="badge badge-ghost badge-sm">Inactive</span>}>
                <span class="badge badge-success badge-sm">Active</span>
              </Show>
            </Show>
          </div>
        </div>

        <Show when={isConflicted()}>
          <div class="text-xs font-semibold">
            Unavailable due to conflicts with {conflictedWith().join(", ")}.
          </div>
        </Show>

        <Show when={isActive()}>
          {/* Show hardware-required signals (SoC-level) when present */}
          <Show when={requiredBySoc().length > 0}>
            <div class="text-xs text-base-content/70">
              This bus requires
              <span class="ml-2">
                {requiredBySoc().map((need) => (
                  <span class="badge badge-ghost badge-sm mr-1">{need.toUpperCase()}</span>
                ))}
              </span>
            </div>
          </Show>

          <Show when={pinChoices()} fallback={<div class="text-xs text-base-content/60">Pin selections unavailable for this controller.</div>}>
            <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <For each={[
                ['i2c', 'sda'],
                ['i2c', 'scl'],
                ['spi', 'mosi'],
                ['spi', 'miso'],
                ['spi', 'sck'],
              ] as const}>
                {([type, signal]) => (
                  <Show when={pinChoicesHas(type, signal)}>
                    <label class="flex flex-col gap-1">
                      <span class="text-sm uppercase text-base-content/75">{signal}{
                        requiredPins().has(signal)
                        && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>
                      }</span>
                      <select
                        class="select select-bordered select-sm"
                        value={busForPinAccess()[signal] || ""}
                        onChange={(e) => setBusPin(cardProps.index, signal, e.currentTarget.value)}
                      >
                        <option value="">None</option>
                        <For each={pinChoicesForPinAccess()?.[signal]}>{(pin) => (
                          <option value={pin} disabled={isBusPinBusy(pin, signal as BusPinKey)}>
                            {pinLabelForPinId(pin) + (isBusPinBusy(pin, signal as BusPinKey) ? " (in use)" : "")}
                          </option>
                        )}</For>
                      </select>
                    </label>
                  </Show>
                )}
              </For>
            </div>
          </Show>

          <div class="space-y-2">
            <For each={cardProps.bus.devices}>
              {(device, devIdx) => {
                const deviceData = createMemo(() => {
                  const meta = getBusDeviceMetadata(device.type);
                  const requires = [
                    ...requiredBusPinsForDevice(device.type),
                    ...Object.entries(meta.props)
                      .filter(([, prop]) => prop.widget === "pin" && !prop.optional)
                      .map(([key, prop]) => prop.name || key),
                  ];

                  return {
                    meta,
                    requires,
                    propEntries: Object.entries(meta.props),
                  };
                });

                return (
                  <div class="border border-base-300 rounded-lg bg-base-100 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-semibold">
                        {deviceData().meta.fullName}
                        <Show when={deviceData().meta.exclusive}>
                          <span
                            class="ml-2 badge badge-xs badge-ghost"
                            title="Exclusive device: cannot share bus with other devices">
                            Exclusive
                          </span>
                        </Show>
                      </div>
                      <Button
                        class="btn btn-ghost btn-xs text-red-500"
                        onClick={() => removeDevice(cardProps.index, devIdx())}
                        title="Remove device"
                      >
                        Remove
                      </Button>
                    </div>
                    <Show when={deviceData().requires.length}>
                      <div class="text-xs text-base-content/70">
                        Device requires
                        <span class="ml-2">
                          <For each={deviceData().requires}>{(need) => (
                            <span class="badge badge-ghost badge-sm mr-1 uppercase">{need}</span>
                          )}</For>
                        </span>
                      </div>
                    </Show>
                    <Show when={deviceData().meta.module}>
                      <div class="text-xs text-base-content/70 mt-1">
                        External device driver from <Link class="link" target="_blank" rel="noopener" href={`https://github.com/${deviceData().meta.module?.remote}/${deviceData().meta.module?.repo}/tree/${deviceData().meta.module?.rev}`}>{`https://github.com/${deviceData().meta.module?.remote}/${deviceData().meta.module?.repo}`}</Link>
                      </div>
                    </Show>

                    <div class="divider my-1"></div>
                    <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3 mt-2 text-sm">
                      <For each={deviceData().propEntries}>
                        {([propKey, propDef]) => (
                          <Dynamic
                            component={devicePropWidgetRenderers[propDef.widget]}
                            label={propDef.name || propKey}
                            required={!propDef.optional}
                            desc={propDef.desc}
                            value={(device as Record<string, AllDeviceDataTypes>)[propKey]}
                            propKey={propKey}
                            propDef={propDef}
                            // TODO figure out this pins situation
                            pins={(propDef.widget === "pin"
                              ? Object.keys(controllerInfo().pins)
                              : undefined)}
                            isPinBusy={isPinBusy}
                            pinLabelForPinId={pinLabelForPinId}
                            onChange={(val) => setDeviceField(cardProps.index, devIdx(), propKey, val)}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

        </Show>
      </div>
    );
  };

  return <div class="flex flex-col gap-3">
    <Show when={controllerInfo()} fallback={<div class="text-center text-sm text-base-content/60">Select a controller to configure buses.</div>}>
      <Show when={buses().length > 0} fallback={<div class="text-center text-sm text-base-content/60">No buses available for this controller.</div>}>
        <AddDevicePanel
          buses={buses}
          controllerInfo={controllerInfo}
          disabledByConflictBuses={disabledByConflictBuses}
          conflictingActiveFor={conflictingActiveFor}
          busHasExclusive={busHasExclusive}
          hasDeviceType={hasDeviceType}
          addDevice={addDevice}
        />

        <Show when={busTooltip()}>
          <div class="border border-base-300 rounded-xl bg-base-200/50 p-3 flex items-center justify-between gap-3">
            <Info class="w-8 h-8 text-info" />
            <div class="text-sm text-base-content/70">
              {busTooltip()}
            </div>
          </div>
        </Show>

        <For each={buses()}>{(bus, idx) => <BusCard bus={bus} index={idx()} />}</For>
      </Show>
    </Show>
  </div>;
};
