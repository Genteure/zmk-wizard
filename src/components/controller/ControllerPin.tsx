import { Button } from "@kobalte/core/button";
import { Popover } from "@kobalte/core/popover";
import CircleX from "lucide-solid/icons/circle-x";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createMemo, createSignal, Show, type VoidComponent } from "solid-js";
import type { PinMode, WiringType } from "~/typedef";
import type { ControllerInfo, VisualPin } from "../controllerInfo";

export const ControllerPin: VoidComponent<{
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
