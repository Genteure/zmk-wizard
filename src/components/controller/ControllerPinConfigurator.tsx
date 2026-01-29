import { Link } from "@kobalte/core/link";
import ExternalLink from "lucide-solid/icons/external-link";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createMemo, For, Match, onCleanup, Switch, type Accessor, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { useWizardContext } from "../context";
import { controllerInfos } from "../controllerInfo";
import { ControllerPin } from "./ControllerPin";

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
