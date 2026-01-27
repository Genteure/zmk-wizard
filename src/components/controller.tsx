import { Button } from "@kobalte/core/button";
import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import CircleX from "lucide-solid/icons/circle-x";
import ExternalLink from "lucide-solid/icons/external-link";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, type Accessor, type Component } from "solid-js";
import { produce } from "solid-js/store";
import type { AnyBus, AnyBusDevice, BusDeviceTypeName, BusName, PinMode, PinSelection, ShiftRegisterDevice, WiringType } from "~/typedef";
import { addDeviceToBus, isI2cBus, isShiftRegisterDevice, isSpiBus, isSpiDevice, isSSD1306, isWS2812 } from "~/typehelper";
import { useWizardContext } from "./context";
import { busDeviceInfos, busPinRequirements, controllerInfos, type ControllerInfo, type PinctrlI2cPinChoices, type PinctrlSpiPinChoices, type VisualPin } from "./controllerInfo";

const ControllerPin: Component<{
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

export const ControllerPinConfigurator: Component<{
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

const spiDeviceTypes: BusDeviceTypeName[] = ["niceview", "ws2812", "74hc595"];
const i2cDeviceTypes: BusDeviceTypeName[] = ["ssd1306"];

function defaultDevice(type: BusDeviceTypeName): AnyBusDevice {
  switch (type) {
    case "ssd1306":
      return { type, add: 0x3c, width: 128, height: 64 };
    case "niceview":
      return { type, cs: "" };
    case "ws2812":
      return { type, cs: "", length: 3 };
    case "74hc595":
      return { type, cs: "", ngpios: 8 };
  }
}

export const ShiftRegisterPinConfigurator: Component<{ partIndex: Accessor<number> }> = (props) => {
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

export const EncoderConfigurator: Component<{ partIndex: Accessor<number> }> = (props) => {
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
                  <div class="font-semibold text-sm">Encoder {idx()}</div>
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

export const BusDevicesConfigurator: Component<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);
  const buses = (() => part().buses);

  const controllerInfo = createMemo(() => controllerInfos[part().controller] || null);
  const pinLabelForPinId = (pinId: string): string => controllerInfo()?.pins?.[pinId]?.displayName || pinId;

  const hasDeviceType = (type: BusDeviceTypeName) => {
    return buses().some((bus) => (bus.devices || []).some((d) => d.type === type));
  };

  const activeBuses = createMemo(() => buses().filter((bus) => (bus.devices || []).length > 0));

  /// Calculate disabled buses due to conflicts with already selected buses
  const disabledByConflictBuses = createMemo(() => {
    const conflicts: Set<BusName> = new Set();
    for (const bus of activeBuses()) {
      const conflictList = controllerInfo()?.busConflicts[bus.name] || [];
      for (const conflictBusName of conflictList) conflicts.add(conflictBusName);
    }
    return conflicts;
  });

  const conflictingActiveFor = (busName: BusName) => activeBuses()
    .filter((bus) => (controllerInfo()?.busConflicts[bus.name] || []).includes(busName))
    .map((bus) => bus.name);

  const [selectedBusIndex, setSelectedBusIndex] = createSignal<number>(0);
  const selectedBus = createMemo(() => buses()[selectedBusIndex()] || null);
  createEffect(() => {
    const list = buses();
    if (list.length === 0) {
      setSelectedBusIndex(-1);
      return;
    }

    const disabled = disabledByConflictBuses();
    const firstAvailable = list.findIndex((bus) => !disabled.has(bus.name));
    if (firstAvailable === -1) {
      setSelectedBusIndex(-1);
      return;
    }

    const idx = selectedBusIndex();
    const current = list[idx];
    if (idx < 0 || idx >= list.length || (current && disabled.has(current.name))) {
      setSelectedBusIndex(firstAvailable);
    }
  });

  const deviceOptionsForBus = (bus: AnyBus | null) => {
    if (!bus) return [] as BusDeviceTypeName[];
    return bus.type === "i2c" ? i2cDeviceTypes : spiDeviceTypes;
  };

  const availableDeviceOptions = createMemo(() => {
    const bus = selectedBus();
    const options = deviceOptionsForBus(bus);
    if (!bus) return [] as BusDeviceTypeName[];

    const busHasExclusive = (b: AnyBus) => (b.devices || []).some((d) => busDeviceInfos[d.type as BusDeviceTypeName]?.exclusive);

    // If the bus already contains an exclusive device, no other devices may be added
    if (busHasExclusive(bus)) return [] as BusDeviceTypeName[];

    return options.filter((opt) => {
      if (hasDeviceType(opt)) return false;
      // If the option itself is exclusive and bus already has devices, don't allow adding it
      if ((bus.devices || []).length > 0 && busDeviceInfos[opt]?.exclusive) return false;
      return true;
    });
  });

  const [newDeviceType, setNewDeviceType] = createSignal<BusDeviceTypeName | null>(null);
  createEffect(() => {
    const available = availableDeviceOptions();
    if (available.length === 0) {
      setNewDeviceType(null);
      return;
    }
    if (!newDeviceType() || !available.includes(newDeviceType() as BusDeviceTypeName)) {
      setNewDeviceType(available[0]);
    }
  });

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
        const prev = key === "sda" ? bus.sda : bus.scl;
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          delete part.pins[prev];
        }
        if (key === "sda") bus.sda = value || undefined;
        if (key === "scl") bus.scl = value || undefined;
      } else if (isSpiBus(bus) && (key === "mosi" || key === "miso" || key === "sck")) {
        const prev = key === "mosi" ? bus.mosi : key === "miso" ? bus.miso : bus.sck;
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          delete part.pins[prev];
        }
        if (key === "mosi") bus.mosi = value || undefined;
        if (key === "miso") bus.miso = value || undefined;
        if (key === "sck") bus.sck = value || undefined;
      }

      if (value) {
        part.pins = part.pins || {};
        part.pins[value] = "bus";
      }

      if (!bus.devices || bus.devices.length === 0) {
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

      if (key === "cs" && isSpiDevice(device)) {
        const prev = device.cs;
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          delete part.pins[prev];
        }
        if (typeof value === "string" && value.length > 0) {
          part.pins = part.pins || {};
          part.pins[value] = "bus";
        }
        device.cs = typeof value === "string" ? value : device.cs;
        return;
      }

      if (isSSD1306(device)) {
        if (key === "add" && typeof value === "number") device.add = value;
        if (key === "width" && typeof value === "number") device.width = value;
        if (key === "height" && typeof value === "number") device.height = value;
      } else if (isWS2812(device)) {
        if (key === "length" && typeof value === "number") device.length = value;
      } else if (isShiftRegisterDevice(device)) {
        if (key === "ngpios" && typeof value === "number") device.ngpios = value as ShiftRegisterDevice["ngpios"];
      }
    }));
  };

  const removeDevice = (busIndex: number, deviceIndex: number) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;
      const removed = bus.devices?.splice(deviceIndex, 1)?.[0];

      if (removed && isSpiDevice(removed) && removed.cs && part.pins?.[removed.cs] === "bus") {
        delete part.pins[removed.cs];
      }
      if (!bus.devices || bus.devices.length === 0) {
        clearBusPins(bus, part.pins);
      }
    }));
  };

  const addDevice = (busIndex: number, type: BusDeviceTypeName) => {
    const bus = buses()[busIndex];
    if (!bus) return;
    if (hasDeviceType(type)) return;
    const device = defaultDevice(type);
    // Prevent exclusivity conflicts
    const busHasExclusive = (b: AnyBus) => (b.devices || []).some((d) => busDeviceInfos[d.type as BusDeviceTypeName]?.exclusive);
    if (busHasExclusive(bus)) return;
    if ((bus.devices || []).length > 0 && busDeviceInfos[type]?.exclusive) return;
    if (isI2cBus(bus) && device.type !== "ssd1306") return;
    if (isSpiBus(bus) && device.type === "ssd1306") return;
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const target = part.buses?.[busIndex];
      if (!target) return;
      if (isI2cBus(target) && device.type === "ssd1306") {
        addDeviceToBus(target, structuredClone(device));
      } else if (isSpiBus(target) && device.type !== "ssd1306") {
        addDeviceToBus(target, structuredClone(device));
      }
    }));
  };

  const BusCard: Component<{ bus: AnyBus; index: number }> = (cardProps) => {
    const pinChoices = createMemo(() => {
      const info = controllerInfo();
      if (!info) return undefined;
      if (isI2cBus(cardProps.bus)) {
        return info.pinctrlChoices({ type: "i2c", name: cardProps.bus.name });
      }
      return info.pinctrlChoices({ type: "spi", name: cardProps.bus.name });
    });
    const i2cPinChoices = createMemo<PinctrlI2cPinChoices | null>(() => {
      const choices = pinChoices();
      return isI2cBus(cardProps.bus) && choices && "sda" in choices ? choices : null;
    });
    const spiPinChoices = createMemo<PinctrlSpiPinChoices | null>(() => {
      const choices = pinChoices();
      return isSpiBus(cardProps.bus) && choices && "mosi" in choices ? choices : null;
    });
    const requiredPins = createMemo(() => {
      const set = new Set<string>();
      // Device level requirements
      for (const d of cardProps.bus.devices || []) {
        const info = busDeviceInfos[d.type as BusDeviceTypeName];
        if (!info?.needs) continue;
        for (const k of Object.keys(info.needs)) set.add(k);
      }
      // SoC-level hardware requirements
      const req = busPinRequirements(part().controller, cardProps.bus.name);
      for (const k of req) set.add(k);
      return set;
    });
    const i2cBus = createMemo(() => isI2cBus(cardProps.bus) ? cardProps.bus : null);
    const spiBus = createMemo(() => isSpiBus(cardProps.bus) ? cardProps.bus : null);
    const isActive = createMemo(() => (cardProps.bus.devices.length || 0) > 0);
    const isConflicted = createMemo(() => disabledByConflictBuses().has(cardProps.bus.name));
    const conflictedWith = createMemo(() => conflictingActiveFor(cardProps.bus.name));

    const pinsUsage = (() => part().pins);

    const isPinBusy = (pinId: string, current?: string) => {
      if (!pinId) return false;
      if (current && pinId === current) return false;
      return Boolean(pinsUsage()[pinId]);
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
            <span class="font-semibold">{cardProps.bus.name}</span>
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
          <Show when={busPinRequirements(part().controller, cardProps.bus.name).length > 0}>
            <div class="text-xs text-base-content/70">
              This bus requires
              <span class="ml-2">
                {busPinRequirements(part().controller, cardProps.bus.name).map((need) => (
                  <span class="badge badge-ghost badge-sm mr-1">{need.toUpperCase()}</span>
                ))}
              </span>
            </div>
          </Show>
          <Show when={(cardProps.bus.devices || []).some((d) => busDeviceInfos[d.type as BusDeviceTypeName]?.exclusive) && (cardProps.bus.devices || []).length > 1}>
            <div class="text-xs text-red-600 font-semibold">This bus contains an exclusive device and cannot share with other devices.</div>
          </Show>
          <Show when={pinChoices()} fallback={<div class="text-xs text-base-content/60">Pin selections unavailable for this controller.</div>}>
            <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <Show when={Boolean(i2cBus() && i2cPinChoices())}>
                <>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">SDA{requiredPins().has('sda') && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>}</span>
                    <select
                      class="select select-bordered select-sm"
                      value={i2cBus()?.sda || ""}
                      onChange={(e) => setBusPin(cardProps.index, "sda", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={i2cPinChoices()!.sda}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, i2cBus()!.sda)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, i2cBus()!.sda) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">SCL{requiredPins().has('scl') && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>}</span>
                    <select
                      class="select select-bordered select-sm"
                      value={i2cBus()?.scl || ""}
                      onChange={(e) => setBusPin(cardProps.index, "scl", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={i2cPinChoices()!.scl}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, i2cBus()!.scl)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, i2cBus()!.scl) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                </>
              </Show>

              <Show when={Boolean(spiBus() && spiPinChoices())}>
                <>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">MOSI{requiredPins().has('mosi') && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>}</span>
                    <select
                      class="select select-bordered select-sm"
                      value={spiBus()?.mosi || ""}
                      onChange={(e) => setBusPin(cardProps.index, "mosi", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={spiPinChoices()!.mosi}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, spiBus()!.mosi)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, spiBus()!.mosi) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">MISO{requiredPins().has('miso') && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>}</span>
                    <select
                      class="select select-bordered select-sm"
                      value={spiBus()?.miso || ""}
                      onChange={(e) => setBusPin(cardProps.index, "miso", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={spiPinChoices()!.miso}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, spiBus()!.miso)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, spiBus()!.miso) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="text-xs uppercase text-base-content/70">SCK{requiredPins().has('sck') && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>}</span>
                    <select
                      class="select select-bordered select-sm"
                      value={spiBus()?.sck || ""}
                      onChange={(e) => setBusPin(cardProps.index, "sck", e.currentTarget.value || undefined)}
                    >
                      <option value="">None</option>
                      <For each={spiPinChoices()!.sck}>{(pin) => (
                        <option value={pin} disabled={isPinBusy(pin, spiBus()!.sck)}>
                          {pinLabelForPinId(pin) + (isPinBusy(pin, spiBus()!.sck) ? " (in use)" : "")}
                        </option>
                      )}</For>
                    </select>
                  </label>
                </>
              </Show>
            </div>
          </Show>

          <div class="space-y-2">
            <For each={cardProps.bus.devices}>
              {(device, devIdx) => (
                <div class="border border-base-300 rounded-lg bg-base-100 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <div class="font-semibold text-sm">
                      {busDeviceInfos[device.type as BusDeviceTypeName]?.name || device.type}
                      <Show when={busDeviceInfos[device.type as BusDeviceTypeName]?.exclusive}>
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
                  <Show when={Object.keys(busDeviceInfos[device.type as BusDeviceTypeName]?.needs || {}).length > 0}>
                    <div class="text-xs text-base-content/70">
                      Device requires
                      <span class="ml-2">
                        {Object.keys(busDeviceInfos[device.type as BusDeviceTypeName]?.needs || {}).map((need) => (
                          <span class="badge badge-ghost badge-sm mr-1">{need.toUpperCase()}</span>
                        ))}
                      </span>
                    </div>
                  </Show>
                  <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3 mt-2 text-sm">
                    {(() => {
                      const ssdDevice = isSSD1306(device) ? device : null;
                      if (!ssdDevice) return null;
                      return (
                        <>
                          <label class="flex flex-col gap-1">
                            <span class="text-xs uppercase text-base-content/70">Address</span>
                            <input
                              class="input input-bordered input-sm"
                              type="number"
                              min={0}
                              max={0x7f}
                              value={ssdDevice.add}
                              onInput={(e) => setDeviceField(cardProps.index, devIdx(), "add", Number(e.currentTarget.value))} />
                          </label>
                          <label class="flex flex-col gap-1">
                            <span class="text-xs uppercase text-base-content/70">Width</span>
                            <input
                              class="input input-bordered input-sm"
                              type="number"
                              min={1}
                              value={ssdDevice.width}
                              onInput={(e) => setDeviceField(cardProps.index, devIdx(), "width", Number(e.currentTarget.value))} />
                          </label>
                          <label class="flex flex-col gap-1">
                            <span class="text-xs uppercase text-base-content/70">Height</span>
                            <input
                              class="input input-bordered input-sm"
                              type="number"
                              min={1}
                              value={ssdDevice.height}
                              onInput={(e) => setDeviceField(cardProps.index, devIdx(), "height", Number(e.currentTarget.value))} />
                          </label>
                        </>
                      );
                    })()}

                    {(() => {
                      const spiChoices = spiPinChoices();
                      const spiDevice = isSpiDevice(device) && device.type !== "ws2812" ? device : null;
                      if (!spiDevice || !spiChoices) return null;
                      const needsCs = (busDeviceInfos[spiDevice.type as BusDeviceTypeName]?.needs || {}).cs;
                      return (
                        <label class="flex flex-col gap-1">
                          <span class="text-xs uppercase text-base-content/70">CS{needsCs ? <span class="text-red-500 ml-1" title="Required">*</span> : null}</span>
                          <select
                            class="select select-bordered select-sm"
                            disabled={!isActive()}
                            value={spiDevice.cs || ""}
                            onChange={(e) => setDeviceField(cardProps.index, devIdx(), "cs", e.currentTarget.value)}
                          >
                            <option value="">None</option>
                            <For each={spiChoices.cs}>{(pin) => (
                              <option value={pin} disabled={isPinBusy(pin, spiDevice.cs)}>
                                {pinLabelForPinId(pin) + (isPinBusy(pin, spiDevice.cs) ? " (in use)" : "")}
                              </option>
                            )}</For>
                          </select>
                        </label>
                      );
                    })()}

                    {(() => {
                      const wsDevice = isWS2812(device) ? device : null;
                      if (!wsDevice) return null;
                      return (
                        <label class="flex flex-col gap-1">
                          <span class="text-xs uppercase text-base-content/70">LED Count</span>
                          <input
                            class="input input-bordered input-sm"
                            type="number"
                            min={1}
                            max={256}
                            value={wsDevice.length}
                            onInput={(e) => setDeviceField(cardProps.index, devIdx(), "length", Number(e.currentTarget.value))} />
                        </label>
                      );
                    })()}

                    {(() => {
                      const shifter = isShiftRegisterDevice(device) ? device : null;
                      if (!shifter) return null;
                      return (
                        <label class="flex flex-col gap-1">
                          <span class="text-xs uppercase text-base-content/70">Outputs</span>
                          <select
                            class="select select-bordered select-sm"
                            value={shifter.ngpios}
                            onChange={(e) => setDeviceField(cardProps.index, devIdx(), "ngpios", Number(e.currentTarget.value))}
                          >
                            <For each={[8, 16, 24, 32] as const}>{(n) => <option value={n}>{n}</option>}</For>
                          </select>
                        </label>
                      );
                    })()}
                  </div>
                </div>
              )}
            </For>
          </div>

        </Show>
      </div>
    );
  };

  return <div class="flex flex-col gap-3">
    <Show when={controllerInfo()} fallback={<div class="text-center text-sm text-base-content/60">Select a controller to configure buses.</div>}>
      <Show when={buses().length > 0} fallback={<div class="text-center text-sm text-base-content/60">No buses available for this controller.</div>}>
        <div class="border border-base-300 rounded-xl bg-base-200/50 p-3">
          <div class="font-semibold text-sm">Add device</div>
          <div class="text-xs text-base-content/75">Choose target bus and device type.</div>
          <div class="mt-2 flex items-center gap-2">
            <select
              class="select select-sm select-bordered"
              disabled={selectedBusIndex() === -1}
              value={selectedBusIndex()}
              onChange={(e) => setSelectedBusIndex(Number(e.currentTarget.value))}
            >
              <For each={buses()}>{(bus, idx) => {
                const disabled = () => disabledByConflictBuses().has(bus.name);
                const reason = () => {
                  const blockers = conflictingActiveFor(bus.name);
                  return disabled()
                    ? `Conflicts with active bus${blockers.length > 1 ? "es" : ""} ${blockers.join(", ")}`
                    : "";
                };
                return (
                  <option
                    value={idx()}
                    disabled={disabled()}
                    title={reason() || undefined}
                    class={disabled() ? "opacity-50" : undefined}
                  >
                    {bus.name} ({bus.type.toUpperCase()}){disabled() ? " (conflicts)" : ""}
                  </option>
                );
              }}
              </For>
            </select>
            <select
              class="select select-sm select-bordered"
              disabled={!selectedBus() || availableDeviceOptions().length === 0}
              value={newDeviceType() || ""}
              onChange={(e) => setNewDeviceType(e.currentTarget.value as BusDeviceTypeName)}
            >
              <option value="" disabled>Select device</option>
              <For each={availableDeviceOptions()}>{(opt) => (
                <option value={opt}>{busDeviceInfos[opt]?.name || opt}</option>
              )}</For>
            </select>
            <Button
              class="btn btn-sm btn-soft"
              disabled={!selectedBus() || !newDeviceType() || availableDeviceOptions().length === 0}
              onClick={() => {
                const busIdx = selectedBusIndex();
                const type = newDeviceType();
                if (busIdx < 0 || type === null) return;
                addDevice(busIdx, type);
              }}
            >
              Add
            </Button>
          </div>
          <div class="text-xs text-base-content/75 mt-2">
            Configuring SPI/I2C devices was not tested thoroughly with all possible configurations and may produce broken builds.
            Please join the <Link class="link" href="https://zmk.dev/community/discord/invite" target="_blank" rel="noopener noreferrer">ZMK Community Discord</Link> for help
            and send feedback to @genteure.
          </div>
        </div>
        <For each={buses()}>{(bus, idx) => <BusCard bus={bus} index={idx()} />}</For>
      </Show>
    </Show>
  </div>;
};
