import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { Tabs } from "@kobalte/core/tabs";
import X from "lucide-solid/icons/x";
import { createSignal, type VoidComponent } from "solid-js";
import { ulid } from "ulidx";
import { useWizardContext } from "./context";
import type { Key } from "../typedef";
import { parseLayoutJson, parsePhysicalLayoutDts } from "./layouthelper";

export const GenerateLayoutDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [gridCols, setGridCols] = createSignal("");
  const [gridRows, setGridRows] = createSignal("");

  return (<Dialog open={context.nav.dialog.generateLayout} onOpenChange={v => context.setNav("dialog", "generateLayout", v)}>
    <Dialog.Portal>
      <Dialog.Overlay class="dialog--overlay" />
      <div class="dialog--positioner">
        <Dialog.Content class="dialog--content max-w-lg">
          <div class="dialog--header">
            <Dialog.Title class="dialog--title">
              Generate Layout
            </Dialog.Title>
            <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
              <X class="w-6 h-6" />
            </Dialog.CloseButton>
          </div>
          <Dialog.Description>
            <Tabs class="w-full">
              <div class="overflow-x-auto mb-2">
                <Tabs.List class="flex relative items-center border-b border-base-300 mb-4">
                  <Tabs.Trigger class="btn btn-ghost" value="grid">Grid</Tabs.Trigger>
                  <button disabled class="btn btn-ghost">TODO</button>
                  <button disabled class="btn btn-ghost">TODO</button>
                  {/* <Tabs.Trigger class="btn btn-ghost" value="todo">todo</Tabs.Trigger> */}
                  <Tabs.Indicator class="absolute transition-all bg-primary h-0.5 -bottom-px" />
                </Tabs.List>
              </div>
              <Tabs.Content value="grid" class="flex flex-col gap-2 items-center">
                <div>
                  Ortholinear grid of 1U keys.
                </div>
                <label class="input">
                  <span class="label font-mono">
                    Columns
                  </span>
                  <input
                    type="number"
                    placeholder="10"
                    onInput={e => setGridCols(e.currentTarget.value)}
                    onChange={e => setGridCols(e.currentTarget.value)}
                  />
                </label>
                <label class="input">
                  <span class="label font-mono">
                    Rows&nbsp;&nbsp;&nbsp;
                  </span>
                  <input
                    type="number"
                    placeholder="4"

                    onInput={e => setGridRows(e.currentTarget.value)}
                    onChange={e => setGridRows(e.currentTarget.value)}
                  />
                </label>
                <Button
                  class="btn btn-primary"
                  disabled={!(parseInt(gridCols()) > 0 && parseInt(gridRows()) > 0)}
                  onClick={() => {
                    const cols = parseInt(gridCols()) || 0;
                    const rows = parseInt(gridRows()) || 0;
                    if (cols <= 0 || rows <= 0) return;

                    setGridCols("");
                    setGridRows("");

                    const keyCount = cols * rows;
                    if (keyCount > 200) {
                      // surely that's a mistake
                      // TODO better UI
                      if (!confirm(`You are about to generate ${keyCount} keys. Continue?`)) {
                        return;
                      }
                    }

                    const newKeys: Key[] = Array.from({ length: keyCount }, (_, i) => {
                      const r = Math.floor(i / cols);
                      const c = i % cols;
                      return {
                        id: ulid(),
                        part: 0,
                        row: r,
                        col: c,
                        x: c,
                        y: r,
                        w: 1,
                        h: 1,
                        r: 0,
                        rx: 0,
                        ry: 0,
                      } satisfies Key;
                    });
                    context.setKeyboard("layout", newKeys);
                    context.setNav("dialog", "generateLayout", false);
                  }}
                >
                  Generate
                </Button>
              </Tabs.Content>
              {/* TODO more generators */}
            </Tabs>
          </Dialog.Description>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog>)
}

export const ImportDevicetreeDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [text, setText] = createSignal("");

  return (<Dialog open={context.nav.dialog.importDevicetree} onOpenChange={v => context.setNav("dialog", "importDevicetree", v)}>
    <Dialog.Portal>
      <Dialog.Overlay class="dialog--overlay" />
      <div class="dialog--positioner">
        <Dialog.Content class="dialog--content max-w-lg">
          <div class="dialog--header">
            <Dialog.Title class="dialog--title">
              Import Layout from Devicetree
            </Dialog.Title>
            <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
              <X class="w-6 h-6" />
            </Dialog.CloseButton>
          </div>
          <Dialog.Description>
            <div class="flex flex-col gap-2">
              <textarea
                class="textarea w-full font-mono text-xs h-48"
                placeholder={`your_layout: your_layout {
  compatible = "zmk,physical-layout";
  keys
  = <&key_physical_attrs 100 100    0    0    0   0   0>
  , <&key_physical_attrs 100 100  100    0    0   0   0>
  , <&key_physical_attrs 100 100    0  100    0   0   0>
  , <&key_physical_attrs 100 100  100  100    0   0   0>
  ;
};
`}
                value={text()}
                onInput={e => setText(e.currentTarget.value)}
                onChange={e => setText(e.currentTarget.value)}
              />
              <Button
                class="btn btn-primary self-end"
                disabled={text().trim().length === 0}
                onClick={() => {
                  const parsed = parsePhysicalLayoutDts(text());
                  setText("");
                  if (!parsed) {
                    // TODO better UI
                    alert("Unable to parse devicetree layout.");
                    return;
                  }
                  context.setKeyboard("layout", parsed);
                  context.setNav("dialog", "importDevicetree", false);
                }}
              >
                Import
              </Button>
            </div>
          </Dialog.Description>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog>)
}

export const ImportLayoutJsonDialog: VoidComponent = () => {
  const context = useWizardContext();
  const [text, setText] = createSignal("");

  return (<Dialog open={context.nav.dialog.importLayoutJson} onOpenChange={v => context.setNav("dialog", "importLayoutJson", v)}>
    <Dialog.Portal>
      <Dialog.Overlay class="dialog--overlay" />
      <div class="dialog--positioner">
        <Dialog.Content class="dialog--content max-w-lg">
          <div class="dialog--header">
            <Dialog.Title class="dialog--title">
              Import Layout from JSON
            </Dialog.Title>
            <Dialog.CloseButton class="btn btn-sm btn-circle btn-ghost cursor-pointer">
              <X class="w-6 h-6" />
            </Dialog.CloseButton>
          </div>
          <Dialog.Description>
            <div class="flex flex-col gap-2">
              <textarea
                class="textarea w-full font-mono text-xs h-48"
                placeholder={`{ "layouts": { "any name": {"layout": [...] } } }`}
                value={text()}
                onInput={e => setText(e.currentTarget.value)}
                onChange={e => setText(e.currentTarget.value)}
              />
              <Button
                class="btn btn-primary self-end"
                disabled={text().trim().length === 0}
                onClick={() => {
                  const parsed = parseLayoutJson(text());
                  setText("");
                  if (!parsed) {
                    // TODO better UI
                    alert("Unable to parse layout JSON.");
                    return;
                  }
                  context.setKeyboard("layout", parsed);
                  context.setNav("dialog", "importLayoutJson", false);
                }}
              >
                Import
              </Button>
            </div>
          </Dialog.Description>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog>)
}
