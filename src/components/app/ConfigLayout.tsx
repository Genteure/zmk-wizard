import { createSignal, For, Show, type Component } from "solid-js";
import { produce, unwrap } from "solid-js/store";

import { Button } from "@kobalte/core/button";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Menubar } from "@kobalte/core/menubar";
import { ulid } from "ulidx";

import ArrowRight from "lucide-solid/icons/arrow-right";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ExternalLink from "lucide-solid/icons/external-link";

import { bboxCenter, getKeysBoundingBox, keyCenter } from "~/lib/geometry";
import { swpBgClass } from "~/lib/swpColors";
import { normalizeKeys, useWizardContext } from "../context";
import { DataTable } from "../datatable";
import { ExportTextboxDialog, GenerateLayoutDialog, ImportDevicetreeDialog, ImportKleJsonDialog, ImportLayoutJsonDialog } from "../dialogs";
import { physicalToLogical, toKLE } from "../layouthelper";
import { config__json, physicalLayoutKeyboard } from "~/lib/templating";
import { ensureKeyIds } from "./App";

// Lazy-load presets to keep main bundle smaller
const [presets, setPresets] = createSignal<typeof import("~/lib/physicalLayouts").layouts>();
async function loadPresets() {
  if (presets()) return;
  const mod = await import("~/lib/physicalLayouts");
  setPresets(mod.layouts);
}
loadPresets();

export const ConfigLayout: Component = () => {
  const context = useWizardContext();

  return (
    <>
      <GenerateLayoutDialog />
      <ImportDevicetreeDialog />
      <ImportLayoutJsonDialog />
      <ImportKleJsonDialog />
      <ExportTextboxDialog />

      <div class="flex flex-row gap-2 items-center flex-wrap justify-center">

        <Menubar class="join">
          <Menubar.Menu>
            <Menubar.Trigger class="join-item btn btn-sm btn-soft">Layout Tools</Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
                <Menubar.Item
                  as="li"
                  onSelect={() => context.setNav("dialog", "generateLayout", true)}
                ><button>Bootstrap</button></Menubar.Item>
                <Menubar.Sub overlap>
                  <Menubar.SubTrigger as="li"><button>
                    Presets
                    <div class="ml-auto pl-6">
                      <ChevronRight class="w-5 h-5" />
                    </div>
                  </button></Menubar.SubTrigger>
                  <Menubar.Portal>
                    <Menubar.Content class="p-2 bg-base-200 rounded shadow-lg border menu max-h-96 overflow-x-auto flex-nowrap">
                      <Show when={presets()} fallback={<div class="px-2 py-1 text-base-content/65">Loading presets…</div>}>
                        <For each={Object.entries(presets()!)}>
                          {([category, layouts]) => (
                            <Menubar.Group>
                              <Menubar.GroupLabel>{category}</Menubar.GroupLabel>
                              <For each={layouts}>
                                {(layout) => (
                                  <Menubar.Item as="li">
                                    <button
                                      onClick={() => {
                                        context.setNav("selectedKeys", []);
                                        const newKeys = ensureKeyIds(structuredClone(layout.keys));
                                        context.setKeyboard("layout", newKeys);
                                        normalizeKeys(context);

                                        if (context.keyboard.parts.length > 1) {
                                          const centerX = bboxCenter(getKeysBoundingBox(context.keyboard.layout)).x;
                                          context.setKeyboard("layout", produce(keys => {
                                            keys.forEach(k => {
                                              const kc = keyCenter(k);
                                              k.part = (kc.x < centerX) ? 0 : 1;
                                            })
                                          }));
                                        }
                                      }}
                                    >
                                      {layout.name}
                                    </button>
                                  </Menubar.Item>
                                )}
                              </For>
                            </Menubar.Group>
                          )}
                        </For>
                      </Show>
                    </Menubar.Content>
                  </Menubar.Portal>
                </Menubar.Sub>

                <Menubar.Sub overlap>
                  <Menubar.SubTrigger as="li"><button>
                    Generate
                    <div class="ml-auto pl-6">
                      <ChevronRight class="w-5 h-5" />
                    </div>
                  </button></Menubar.SubTrigger>
                  <Menubar.Portal>
                    <Menubar.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
                      <Menubar.Item
                        as="li"
                        onSelect={() => {
                          context.setKeyboard("layout", produce(keys => {
                            keys.forEach(k => {
                              k.x = k.col;
                              k.y = k.row;
                              k.w = 1;
                              k.h = 1;
                              k.rx = 0;
                              k.ry = 0;
                              k.r = 0;
                            })
                          }))
                          normalizeKeys(context);
                        }}
                      ><button>Generate Physical Layout from Logical</button></Menubar.Item>
                      <Menubar.Item
                        as="li"
                        onSelect={() => context.setKeyboard("layout", produce(keys => physicalToLogical(keys, false)))}
                      ><button>Generate Logical Layout from Physical</button></Menubar.Item>
                      <Menubar.Item
                        as="li"
                        onSelect={() => context.setKeyboard("layout", produce(keys => physicalToLogical(keys, true)))}
                      ><button>Generate Logical Layout from Physical (allow reordering)</button></Menubar.Item>
                    </Menubar.Content>
                  </Menubar.Portal>
                </Menubar.Sub>

                <Menubar.Separator class="my-1" />
                <Menubar.Item
                  as="li"
                  onSelect={() => context.setNav("dialog", "importDevicetree", true)}
                ><button>Import ZMK Physical Layout DTS</button></Menubar.Item>
                <Menubar.Item
                  as="li"
                  onSelect={() => context.setNav("dialog", "importLayoutJson", true)}
                ><button>Import QMK-like Layout JSON</button></Menubar.Item>
                <Menubar.Item
                  as="li"
                  onSelect={() => context.setNav("dialog", "importKleJson", true)}
                ><button>Import KLE/VIA/VIAL JSON</button></Menubar.Item>
                <Menubar.Separator class="my-1" />
                <Menubar.Item
                  as="li"
                  onSelect={() => {
                    const dts = physicalLayoutKeyboard(unwrap(context.keyboard));
                    // dialog will open if content is set and close on null
                    context.setNav("dialog", "exportTextboxContent", dts);
                  }}
                ><button>Export ZMK Physical Layout DTS</button></Menubar.Item>
                <Menubar.Item
                  as="li"
                  onSelect={() => {
                    const json = config__json(unwrap(context.keyboard));
                    // dialog will open if content is set and close on null
                    context.setNav("dialog", "exportTextboxContent", json);
                  }}
                ><button>Export Layout JSON</button></Menubar.Item>
                <Menubar.Item
                  as="li"
                  onSelect={() => {
                    const kle = toKLE(unwrap(context.keyboard.layout));
                    // dialog will open if content is set and close on null
                    context.setNav("dialog", "exportTextboxContent", kle);
                  }}
                ><button>Export KLE JSON</button></Menubar.Item>
                <Menubar.Separator class="my-1" />
                <Menubar.Item as="li"
                // onSelect={() => window.open('https://nickcoutsos.github.io/keymap-layout-tools/', '_blank', 'noopener')}
                ><a target="_blank" rel="noopener" href="https://nickcoutsos.github.io/keymap-layout-tools/"><span>KiCAD PCB<ArrowRight class="w-4 h-4 inline-block mx-1" />Layout JSON</span><div class="ml-auto pl-6"><ExternalLink class="w-5 h-5" /></div></a></Menubar.Item>
                <Menubar.Item as="li"
                // onSelect={() => window.open('https://editor.keyboard-tools.xyz/', '_blank', 'noopener')}
                ><a target="_blank" rel="noopener" href="https://editor.keyboard-tools.xyz/"><span>Keyboard Layout Editor NG</span><div class="ml-auto pl-6"><ExternalLink class="w-5 h-5" /></div></a></Menubar.Item>
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        </Menubar>

        <Button
          class="btn btn-sm btn-soft"
          onClick={() => {
            const newId = ulid();
            context.setKeyboard("layout",
              produce(draft => {
                const row = Math.ceil(Math.max(0, ...context.keyboard.layout.map(k => k.row)));
                const col = Math.ceil(Math.max(0, ...context.keyboard.layout.filter(k => k.row === row).map(k => k.col)) + 1);
                const x = Math.ceil(Math.max(0, ...context.keyboard.layout.map(k => k.x)) + 1);
                const y = Math.ceil(Math.max(0, ...context.keyboard.layout.map(k => k.y)));

                draft.push({
                  id: newId,
                  part: 0, // default to part 0
                  row,
                  col,
                  w: 1,
                  h: 1,
                  x,
                  y,
                  r: 0,
                  rx: 0,
                  ry: 0,
                });
              })
            );
            context.setNav("selectedKeys", [newId]);
          }}
        >
          Add Key
        </Button>

        <div class="join">
          <DropdownMenu>
            <DropdownMenu.Trigger class="btn btn-sm btn-soft join-item" disabled={context.nav.selectedKeys.length === 0}>
              Assign Key to Side
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
                <For each={context.keyboard.parts}>
                  {(part, i) => (
                    <DropdownMenu.Item as="li" onSelect={() => {
                      context.setKeyboard("layout", produce((layout) => {
                        context.nav.selectedKeys.forEach(id => {
                          const k = layout.find(kk => kk.id === id);
                          if (k) k.part = i();
                        });
                      }));
                    }}>
                      <button>
                        <span
                          class="inline-block rounded-full w-3 h-3 mr-1"
                          classList={{ [swpBgClass(i())]: true }}
                        />
                        <span>
                          {part.name}
                        </span>
                      </button>
                    </DropdownMenu.Item>
                  )}
                </For>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
          <Button
            class="btn btn-sm btn-soft join-item btn-error"
            disabled={context.nav.selectedKeys.length === 0}
            onClick={() => {
              context.setKeyboard("layout", produce((layout) => {
                context.nav.selectedKeys.forEach(id => {
                  const idx = layout.findIndex(k => k.id === id);
                  if (idx !== -1) layout.splice(idx, 1);
                });
              }));
              context.setNav("selectedKeys", []);
            }}
          >
            Delete Selected
          </Button>
        </div>
      </div>
      <div class="min-h-64 rounded border border-base-300">
        <DataTable />
      </div>
    </>
  )
}
