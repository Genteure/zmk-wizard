import { createEffect, createMemo, createSignal, For, Show, type Accessor, type Component, type VoidComponent } from "solid-js";
import { produce, unwrap } from "solid-js/store";

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Menubar } from "@kobalte/core/menubar";
import { Popover } from "@kobalte/core/popover";
import { ulid } from "ulidx";

import ArrowRight from "lucide-solid/icons/arrow-right";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import LucideKeyboard from "lucide-solid/icons/keyboard";
import Pencil from "lucide-solid/icons/pencil";
import SquarePen from "lucide-solid/icons/square-pen";
import TriangleAlert from "lucide-solid/icons/triangle-alert";

import { Link } from "@kobalte/core/link";
import { Tabs } from "@kobalte/core/tabs";
import { bboxCenter, getKeysBoundingBox, keyCenter } from "~/lib/geometry";
import { swpBgClass } from "~/lib/swpColors";
import { copyWiringBetweenParts, type WiringTransform } from "~/lib/wiringMapping";
import type { Controller, Key, WiringType } from "../typedef";
import { normalizeKeys, useWizardContext } from "./context";
import { BusDevicesConfigurator, ControllerPinConfigurator, ShiftRegisterPinConfigurator } from "./controller";
import { controllerInfos, loadBusesForController } from "./controllerInfo";
import { DataTable } from "./datatable";
import { ExportTextboxDialog, GenerateLayoutDialog, ImportDevicetreeDialog, ImportKleJsonDialog, ImportLayoutJsonDialog } from "./dialogs";
import { KeyboardPreview, type GraphicsKey } from "./graphics";
import { physicalToLogical, toKLE } from "./layouthelper";
import { BuildButton, HelpButton, InfoEditButton } from "./navbar";

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
        <div
          class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded border-fuchsia-500 border flex justify-center items-center select-none"
        >
          icon?
        </div>

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
            <Tabs.Trigger class="btn btn-ghost" value="layout">
              <LucideKeyboard class="inline-block w-6 h-6 mr-1" />
              Layout
            </Tabs.Trigger>

            <div class="p-1 border-b-3 border-transparent select-none">
              Parts:
            </div>

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

// Lazy-load presets to keep main bundle small
const [presets, setPresets] = createSignal<typeof import("~/lib/physicalLayouts").layouts>();
async function loadPresets() {
  if (presets()) return;
  const mod = await import("~/lib/physicalLayouts");
  setPresets(mod.layouts);
}
loadPresets();

const ConfigLayout: Component = () => {
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
                ><button>Import KLE JSON</button></Menubar.Item>
                <Menubar.Separator class="my-1" />
                <Menubar.Item
                  as="li"
                  onSelect={async () => {
                    const { physicalLayoutKeyboard } = await import("~/lib/templating");
                    const dts = physicalLayoutKeyboard(unwrap(context.keyboard));
                    // dialog will open if content is set and close on null
                    context.setNav("dialog", "exportTextboxContent", dts);
                  }}
                ><button>Export ZMK Physical Layout DTS</button></Menubar.Item>
                <Menubar.Item
                  as="li"
                  onSelect={async () => {
                    const { config__json } = await import("~/lib/templating");
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

const controllerLabel = (id: Controller) => controllerInfos[id].name;
const wiringLabelMap = {
  "matrix_diode": "Matrix with Diodes",
  "matrix_no_diode": "Matrix without Diodes",
  "direct_gnd": "Direct to GND",
  "direct_vcc": "Direct to VCC",
};
const wiringLabel = (id: WiringType) => wiringLabelMap[id] ?? id;

const ConfigPart: Component<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);

  // -- Part Name Editing -- //

  const [nameDraft, setNameDraft] = createSignal(part().name ?? "");
  const [namePopoverOpen, setNamePopoverOpen] = createSignal(false);

  createEffect(() => setNameDraft(part().name ?? ""));

  const saveName = () => {
    const trimmed = nameDraft().trim();
    if (!/^[a-z]+$/.test(trimmed)) {
      return;
    }

    context.setKeyboard("parts", props.partIndex(), "name", trimmed);
    setNamePopoverOpen(false);
  };

  // -- Board and Wiring Editing -- //

  const [controllerDraft, setControllerDraft] = createSignal(part().controller);
  const [wiringDraft, setWiringDraft] = createSignal(part().wiring);
  const [boardDialogOpen, setBoardDialogOpen] = createSignal(false);

  createEffect(() => {
    setControllerDraft(part().controller);
    setWiringDraft(part().wiring);
  });

  const controllerInfoDraft = createMemo(() => controllerInfos[controllerDraft()] ?? null);
  const isRp2040Draft = createMemo(() => controllerInfoDraft()?.soc === "rp2040");

  const saveBoardAndWiring = () => {
    const controllerChanged = part().controller !== controllerDraft();
    const wiringChanged = part().wiring !== wiringDraft();

    context.setKeyboard("parts", props.partIndex(), produce((p) => {
      p.controller = controllerDraft();
      p.wiring = wiringDraft();
      if (controllerChanged) {
        p.buses = loadBusesForController(p.controller);
      }

      if (controllerChanged || wiringChanged) {
        p.pins = {};
        p.keys = {};
      }
    }));

    setBoardDialogOpen(false);
  };

  //  --  -- //

  const showRP2040Error = createMemo(() => {
    if (!isRp2040Draft()) return false;
    if (context.keyboard.parts.length > 1) return true;
    if (context.keyboard.dongle) return true;
    return false;
  });

  const copyFromPart = (sourceIndex: number, transform: WiringTransform) => {
    const source = context.keyboard.parts[sourceIndex];
    const targetIndex = props.partIndex();
    const target = context.keyboard.parts[targetIndex];

    if (!source || !target) {
      alert("Invalid source or target part.");
      return;
    }

    const result = copyWiringBetweenParts({
      layout: context.keyboard.layout,
      sourcePartIndex: sourceIndex,
      targetPartIndex: targetIndex,
      sourcePart: source,
      targetPart: target,
      transform,
    });

    context.setKeyboard("parts", targetIndex, produce((p) => {
      p.controller = result.controller;
      p.wiring = result.wiring;
      p.pins = result.pins;
      p.buses = result.buses;
      p.keys = result.keys;
    }));
  };

  return (
    <div class="flex flex-col items-center gap-2 py-2 mb-8">

      <div class="w-full max-w-xs border-b border-base-300 p-2 bg-base-200/60 rounded-xl flex items-center gap-2">
        <div class="flex-1 flex items-center justify-center text-lg">
          <span class="truncate">{part().name}</span>
        </div>
        <Popover open={namePopoverOpen()} onOpenChange={(v) => {
          if (v) {
            setNameDraft(part().name ?? "");
          }
          setNamePopoverOpen(v);
        }}>
          <Popover.Trigger class="btn btn-sm btn-soft btn-circle" title="Edit part name">
            <Pencil class="w-5 h-5" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="popover--content w-64 p-3 flex flex-col gap-2">
              <div class="text-sm font-semibold">Edit part name</div>
              <input
                class="input input-bordered w-full"
                value={nameDraft()}
                onInput={e => setNameDraft(e.currentTarget.value)}
              />
              <div class="text-xs text-base-content/70">Part names must be lowercase letters (a-z) only, no spaces or special characters.</div>
              <div class="flex justify-end gap-2">
                <Popover.CloseButton class="btn btn-ghost btn-sm">Cancel</Popover.CloseButton>
                <Button class="btn btn-primary btn-sm" disabled={!/^[a-z]+$/.test(nameDraft().trim())} onClick={saveName}>Save</Button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      </div>

      <div class="flex items-center gap-2">

        <Dialog open={boardDialogOpen()} onOpenChange={(v) => {
          if (v) {
            setControllerDraft(part().controller);
            setWiringDraft(part().wiring);
          }
          setBoardDialogOpen(v);
        }}>
          <Dialog.Trigger class="btn flex justify-between items-center rounded-xl p-4 text-left h-auto gap-2">
            <div class="flex flex-col items-start gap-1">
              <span class="text-base font-semibold">{controllerLabel(part().controller)}</span>
              <span class="text-xs text-base-content/70">{wiringLabel(part().wiring)}</span>
            </div>
            <SquarePen class="w-5 h-5" aria-hidden />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay class="dialog--overlay" />
            <div class="dialog--positioner">
              <Dialog.Content class="dialog--content w-full max-w-sm p-4 rounded-2xl border border-base-300 bg-base-100 shadow-xl">
                <Dialog.Title class="text-lg font-bold mb-2">Choose board and wiring type</Dialog.Title>
                <div class="flex flex-col items-center">
                  <label class="select">
                    <span class="label">Board&nbsp;</span>
                    <select
                      class="select select-bordered w-full"
                      value={controllerDraft()}
                      onChange={e => setControllerDraft(e.currentTarget.value as Controller)}
                    >
                      <option value="nice_nano_v2">nice!nano v2 (and clones)</option>
                      <option disabled>├  Supermini NRF52840</option>
                      <option disabled>├  PROMICRO NRF52840</option>
                      <option disabled>├  52840nano</option>
                      <option disabled>└  ... and others</option>
                      <option value="xiao_ble">Seeed XIAO nRF52840</option>
                      <option value="xiao_ble_plus">Seeed XIAO nRF52840 Plus</option>
                      <option value="rpi_pico">Raspberry Pi Pico (RP2040)</option>
                      <option value="xiao_rp2040">Seeed XIAO RP2040</option>
                      <option value="qt_py_rp2040">Adafruit QT Py RP2040</option>
                      <option value="kb2040">Adafruit KB2040 (RP2040)</option>
                      <option value="sparkfun_pro_micro_rp2040">SparkFun Pro Micro RP2040</option>
                    </select>
                  </label>
                  <label class="select mt-4">
                    <span class="label">Wiring</span>
                    <select
                      class="select select-bordered w-full"
                      value={wiringDraft()}
                      onChange={e => setWiringDraft(e.currentTarget.value as WiringType)}
                    >
                      <option value="matrix_diode">Matrix with Diodes</option>
                      <option value="direct_gnd">Direct to GND</option>
                      <option disabled>──────────</option>
                      <option disabled>Uncommon Wiring Types</option>
                      <option value="matrix_no_diode">Matrix without Diodes</option>
                      <option value="direct_vcc">Direct to VCC</option>
                    </select>
                  </label>
                </div>

                <Show when={isRp2040Draft()}>
                  <div class="alert alert-soft mt-3 text-xs">
                    <div>
                      <div>
                        Support for RP2040-based boards in Shield Wizard is experimental.
                      </div>
                      <div class="mt-2">
                        Please report any issues with generated configurations to @genteure in&nbsp;
                        <Link
                          class="link"
                          href="https://zmk.dev/community/discord/invite"
                          target="_blank"
                          rel="noopener"
                        >
                          ZMK Community Discord
                        </Link> or on&nbsp;
                        <Link
                          class="link"
                          href="https://github.com/genteure/zmk-wizard/issues"
                          target="_blank"
                          rel="noopener"
                        >
                          GitHub Issues
                        </Link>.
                      </div>
                    </div>
                  </div>
                </Show>
                <Show when={showRP2040Error()}>
                  <div role="alert" class="alert alert-soft alert-warning mt-3">
                    <TriangleAlert class="w-5 h-5" />
                    <div class="text-xs">
                      <div>
                        Shield Wizard only supports RP2040-based controllers in unibody non-dongle keyboards.
                      </div>
                      <div class="my-1">Please set parts to 1 and uncheck "add dongle".</div>
                      <Button
                        class="btn btn-warning btn-outline btn-sm"
                        onClick={() => {
                          setBoardDialogOpen(false);
                          context.setNav("dialog", "info", true);
                        }}
                      >
                        Edit Keyboard Info
                      </Button>
                    </div>
                  </div>
                </Show>
                <div class="text-sm text-base-content/70 mt-3">
                  Changing the board or wiring type will reset all pin assignments and key wiring for this part.
                </div>
                <div class="mt-4 flex justify-end gap-2">
                  <Dialog.CloseButton class="btn btn-ghost btn-sm">Cancel</Dialog.CloseButton>
                  <Button
                    class="btn btn-primary btn-sm"
                    disabled={showRP2040Error()}
                    onClick={saveBoardAndWiring}
                  >
                    Save
                  </Button>
                </div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        </Dialog>

        <DropdownMenu>
          <DropdownMenu.Trigger class="btn btn-circle" title="Copy pin configuration from another part">
            <Copy class="w-5 h-5" aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="p-2 bg-base-200 rounded shadow-lg border menu min-w-[16rem]">
              <For
                each={context.keyboard.parts
                  .map((p, idx) => ({ p, idx }))
                  .filter(entry => entry.idx !== props.partIndex())}
                fallback={<div class="text-base-content/65 px-2 py-1">No other parts</div>}
              >
                {(entry, i) => (
                  <DropdownMenu.Sub overlap>
                    <DropdownMenu.SubTrigger as="li" class="">
                      <button>
                        <span>

                          <span class="mr-1">Copy wiring from</span>
                          <span
                            class="inline-block rounded-full w-2 h-2 mx-1"
                            classList={{ [swpBgClass(i())]: true }}
                          />
                          <span>{entry.p.name || `Part ${entry.idx + 1}`}</span>
                        </span>
                        <div class="ml-auto pl-6">
                          <ChevronRight class="w-5 h-5" aria-hidden />
                        </div>
                      </button>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent class="p-2 bg-base-200 rounded shadow-lg border menu">
                        <DropdownMenu.Item as="li" onSelect={() => copyFromPart(entry.idx, "flip-horiz")}>
                          <button class="w-full text-left">Mirrored Horizontally</button>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item as="li" onSelect={() => copyFromPart(entry.idx, "flip-vert")}>
                          <button class="w-full text-left">Mirrored Vertically</button>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item as="li" onSelect={() => copyFromPart(entry.idx, "none")}>
                          <button class="w-full text-left">Direct Copy</button>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item as="li" onSelect={() => copyFromPart(entry.idx, "flip-both")}>
                          <button class="w-full text-left">Mirrored Both</button>
                        </DropdownMenu.Item>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                )}
              </For>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>

      <div class="w-full max-w-5xl">
        <ControllerPinConfigurator
          partIndex={props.partIndex}
          controllerId={part().controller}
        />
      </div>

      <div class="w-full p-2">
        <ShiftRegisterPinConfigurator partIndex={props.partIndex} />
      </div>

      <div class="w-full p-2">
        <BusDevicesConfigurator partIndex={props.partIndex} />
      </div>

    </div>
  );
};
