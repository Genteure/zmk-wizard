import { createMemo, For, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";

import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import { Tabs } from "@kobalte/core/tabs";
import { ulid } from "ulidx";

import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import LucideKeyboard from "lucide-solid/icons/keyboard";

import { swpBgClass } from "~/lib/swpColors";
import type { Key } from "../../typedef";
import { useWizardContext } from "../context";
import { KeyboardPreview, type GraphicsKey } from "../graphics";
import { BuildButton, HelpButton, InfoEditButton } from "../navbar";
import { ConfigKeyboard } from "./ConfigKeyboard";
import { ConfigLayout } from "./ConfigLayout";
import { ConfigPart } from "./ConfigPart";

export function ensureKeyIds(keys: Key[]) {
  return keys.map(k => ({ ...k, id: k.id ?? ulid() }));
}

export const App: VoidComponent = () => {
  const context = useWizardContext();

  const physicalLayoutKeys = createMemo(() => context.keyboard.layout.map((k, i) => ({
    x: k.x,
    y: k.y,
    r: k.r,
    rx: k.rx,
    ry: k.ry,
    w: k.w,
    h: k.h,

    index: i,
    part: k.part,

    key: k,
  } satisfies GraphicsKey)));

  const logicalLayoutKeys = createMemo(() => context.keyboard.layout.map((k, i) => ({
    x: k.col,
    y: k.row,
    r: 0,
    rx: 0,
    ry: 0,
    w: 1,
    h: 1,

    index: i,
    part: k.part,

    key: k,
  } satisfies GraphicsKey)));

  const keyWiringSetter = (gkey: GraphicsKey) => {
    const key = gkey.key;
    const partIdx = context.nav.activeEditPart;
    if (partIdx === null) return;
    if (key.part !== partIdx) return;

    const pinId = context.nav.activeWiringPin;
    if (!pinId) return;

    const isShifterPin = pinId.startsWith("shifter");
    const mode = isShifterPin ? "output" : context.keyboard.parts[partIdx].pins[pinId];
    if (!mode) return;

    const wiringType = context.keyboard.parts[partIdx].wiring;
    const isMatrix = wiringType === "matrix_diode" || wiringType === "matrix_no_diode";
    if (isShifterPin && !isMatrix) return;

    const keyId = key.id;
    context.setKeyboard("parts", partIdx, "keys", produce((keys) => {
      const current = keys[keyId] || {};
      if (mode === "input") current.input = pinId;
      else if (mode === "output") current.output = pinId;
      keys[keyId] = current;
    }));
  };

  return (<div id="app" class="flex flex-col h-screen isolate">
    <div
      // class="p-2 bg-base-200 flex flex-col gap-2 md:flex-row items-center justify-between"
      class="p-2 bg-base-200 flex gap-2 items-center justify-between"
    >
      <div class="flex items-center gap-1 md:gap-2">
        <Popover>
          <Popover.Trigger>
            <div
              class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded border-fuchsia-500 border flex justify-center items-center select-none cursor-pointer"
            >
              icon?
            </div>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="popover--content w-60 p-3 flex flex-col gap-2">
              <div class="text-sm/relaxed">
                Send your ideas and feedback to <Link
                  href="https://github.com/Genteure/zmk-wizard"
                  class="link"
                  target="_blank"
                  rel="noopener noreferrer"
                >https://github.com/Genteure/zmk-wizard</Link> or @genteure in <Link
                  href="https://zmk.dev/community/discord/invite"
                  class="link"
                  target="_blank"
                  rel="noopener noreferrer"
                >ZMK Community Discord</Link>.
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover>

        <InfoEditButton />
        <BuildButton />
      </div>

      <HelpButton />
    </div>
    {/* <!-- /Header --> */}
    {/* <!-- Content --> */}
    <div class="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* <!-- Config --> */}
      <Tabs
        class="flex-2 min-w-0 min-h-0 border-b lg:border-b-0 lg:border-r border-base-300 p-1 flex flex-col"
        value={context.nav.selectedTab}
        onChange={v => {
          context.setNav("selectedTab", v);
          context.setNav("selectedKeys", []);
          if (v.startsWith("part-")) {
            const index = parseInt(v.substring(5));
            if (!isNaN(index) && index >= 0 && index < context.keyboard.parts.length) {
              context.setNav("activeEditPart", index);
              return;
            }
          }
          context.setNav("activeEditPart", null);
        }}
      >
        <div
          class="overflow-x-auto mb-2"
          onWheel={e => {
            if (e.deltaY === 0 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).scrollLeft += e.deltaY / 3;
          }}
        >
          <Tabs.List class="flex relative items-center border-b border-base-300 mb-4">
            <Tabs.Trigger class="btn btn-ghost px-2" value="layout">
              <LayoutDashboard class="inline-block w-6 h-6 mr-1" />
              Layout
            </Tabs.Trigger>

            <Tabs.Trigger class="btn btn-ghost px-2" value="keyboard">
              <LucideKeyboard class="inline-block w-6 h-6 mr-1" />
              Keyboard
            </Tabs.Trigger>

            {/* <div class="p-1 border-b-3 border-transparent select-none">
              Parts:
            </div> */}

            <For
              each={context.keyboard.parts}
              fallback={<div class="text-base-content/65 select-none">No parts</div>}
            >
              {(part, i) => (<Tabs.Trigger
                class="btn btn-ghost"
                value={`part-${i()}`}
              >
                <span
                  class="inline-block rounded-full w-3 h-3 mr-1"
                  classList={{ [swpBgClass(i())]: true }}
                />
                <span>
                  {part.name}
                </span>
              </Tabs.Trigger>)}
            </For>
            <Tabs.Indicator class="absolute transition-all bg-primary h-0.5 -bottom-px" />
          </Tabs.List>
        </div>

        <Tabs.Content value="layout" class="flex flex-col gap-2 overflow-y-auto flex-1">
          <ConfigLayout />
        </Tabs.Content>

        <Tabs.Content value="keyboard" class="flex flex-col gap-2 overflow-y-auto flex-1">
          <ConfigKeyboard />
        </Tabs.Content>

        <For each={context.keyboard.parts}>
          {(_part, i) => (
            <Tabs.Content value={`part-${i()}`} class="flex flex-col gap-2 overflow-y-auto flex-1">
              <ConfigPart partIndex={() => i()} />
            </Tabs.Content>
          )}
        </For>
      </Tabs>
      {/* <!-- /Config, Preview --> */}
      <div class="flex-3 flex flex-col">
        <div class="flex-1 border-b border-base-300">
          <KeyboardPreview title="Physical Layout"
            keys={physicalLayoutKeys}
            editMode={() => (context.nav.selectedTab.startsWith("part-")) ? "wiring" : "select"}
            onKeySetWiring={keyWiringSetter}
            moveSelectedKey="physical"
          />
        </div>
        <div class="flex-1">
          <KeyboardPreview title="Logical Layout"
            keys={logicalLayoutKeys}
            editMode={() => (context.nav.selectedTab.startsWith("part-")) ? "wiring" : "select"}
            onKeySetWiring={keyWiringSetter}
            moveSelectedKey="logical"
          />
        </div>
      </div>
      {/* <!-- /Preview --> */}
    </div>
  </div>);
};
