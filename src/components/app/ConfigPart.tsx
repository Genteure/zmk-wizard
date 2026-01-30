import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import Pencil from "lucide-solid/icons/pencil";
import SquarePen from "lucide-solid/icons/square-pen";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import Undo2 from "lucide-solid/icons/undo-2";
import { createEffect, createMemo, createSignal, For, Show, type Accessor, type Component } from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { swpBgClass } from "~/lib/swpColors";
import { copyWiringBetweenParts, type WiringTransform } from "~/lib/wiringMapping";
import type { Controller, WiringType } from "../../typedef";
import { useWizardContext } from "../context";
import { BusDevicesConfigurator, ControllerPinConfigurator, EncoderConfigurator, ShiftRegisterPinConfigurator } from "../controller";
import { controllerInfos, loadBusesForController, socCapabilities } from "../controllerInfo";

const controllerLabel = (id: Controller) => controllerInfos[id].name;
const wiringLabelMap = {
  "matrix_diode": "Matrix with diodes",
  "matrix_no_diode": "Matrix without diodes",
  "direct_gnd": "Direct to GND",
  "direct_vcc": "Direct to VCC",
};
const wiringLabel = (id: WiringType) => wiringLabelMap[id] ?? id;

export const ConfigPart: Component<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);

  // -- Part Name Editing -- //

  const [nameDraft, setNameDraft] = createSignal(part().name ?? "");
  const [isEditingName, setIsEditingName] = createSignal(false);

  createEffect(() => setNameDraft(part().name ?? ""));

  const isNameValid = () => /^[a-z]+$/.test(nameDraft().trim());

  const saveName = () => {
    const trimmed = nameDraft().trim();
    if (!isNameValid()) {
      return;
    }
    context.setKeyboard("parts", props.partIndex(), "name", trimmed);
    setIsEditingName(false);
  };

  const cancelNameEdit = () => {
    setNameDraft(part().name ?? "");
    setIsEditingName(false);
  };

  // -- Part Role -- //
  // Part roles determine how each part communicates in the keyboard system.
  // Part 0 is the primary part that coordinates communication.
  // - Without dongle: Part 0 is Central (connects to host via USB/BLE).
  // - With dongle: Part 0 is shown as both Central (primary keyboard part) and Peripheral
  //   (because it sends data to the dongle which becomes the actual BLE Central).
  // All other parts are always Peripheral (they send data to part 0 or dongle).

  const partRole = createMemo(() => {
    const idx = props.partIndex();
    // Part 0 is shown as Central (primary keyboard part)
    const isCentral = idx === 0;
    // Part is Peripheral if it's not part 0, or if part 0 with dongle mode
    const isPeripheral = idx !== 0 || context.keyboard.dongle;
    return { isCentral, isPeripheral };
  });

  // -- Controller Capabilities -- //

  const controllerInfo = createMemo(() => controllerInfos[part().controller] ?? null);
  const capabilities = createMemo(() => {
    const info = controllerInfo();
    if (!info) return { usb: false, ble: false };
    return socCapabilities[info.soc];
  });

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
        p.encoders = [];
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
      layout: unwrap(context.keyboard.layout),
      sourcePartIndex: sourceIndex,
      targetPartIndex: targetIndex,
      sourcePart: unwrap(source),
      targetPart: unwrap(target),
      transform,
    });

    context.setKeyboard("parts", targetIndex, produce((p) => {
      p.controller = result.controller;
      p.wiring = result.wiring;
      p.pins = result.pins;
      p.buses = result.buses;
      p.keys = result.keys;

      const encoders = structuredClone(unwrap(source.encoders) || []);
      p.encoders = encoders;

      for (const enc of encoders) {
        p.pins = p.pins || {};
        if (enc.pinA) p.pins[enc.pinA] = "encoder";
        if (enc.pinB) p.pins[enc.pinB] = "encoder";
        if (enc.pinS) p.pins[enc.pinS] = "encoder";
      }
    }));
  };

  return (
    <div class="flex flex-col items-center gap-2 py-2 mb-8">
      {/* Part Header Section - Compact Layout */}
      <div class="w-full max-w-md p-3 bg-base-200/60 rounded-xl border border-base-300">
        {/* Row 1: Part Name and Role */}
        <div class="flex items-center gap-2 mb-2 ml-3">
          {/* Part Name with Inline Edit */}
          <Show
            when={!isEditingName()}
            fallback={
              <div class="flex items-center gap-1.5 flex-1">
                <input
                  class="input input-sm input-bordered flex-1 font-semibold"
                  classList={{ "input-error": !isNameValid() }}
                  value={nameDraft()}
                  onInput={e => setNameDraft(e.currentTarget.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && isNameValid()) saveName();
                    if (e.key === "Escape") cancelNameEdit();
                  }}
                  aria-label="Part name"
                  autofocus
                />
                <Button
                  class="btn btn-xs btn-circle btn-success"
                  title="Save name"
                  aria-label="Save name"
                  disabled={!isNameValid()}
                  onClick={saveName}
                >
                  <Check class="w-4 h-4" aria-hidden />
                </Button>
                <Button
                  class="btn btn-xs btn-circle btn-ghost"
                  title="Cancel"
                  aria-label="Cancel editing"
                  onClick={cancelNameEdit}
                >
                  <Undo2 class="w-4 h-4" aria-hidden />
                </Button>
              </div>
            }
          >
            <span class="text-lg font-semibold truncate">{part().name}</span>
            <Button
              class="btn btn-xs btn-ghost btn-circle"
              title="Edit part name"
              aria-label="Edit part name"
              onClick={() => {
                setNameDraft(part().name ?? "");
                setIsEditingName(true);
              }}
            >
              <Pencil class="w-3.5 h-3.5" aria-hidden />
            </Button>
          </Show>

          {/* Spacer */}
          <div class="flex-1" />

          {/* Part Role Badges */}
          <div class="flex items-center gap-1">
            <Show when={partRole().isCentral}>
              <Popover>
                <Popover.Trigger class="badge badge-primary badge-sm cursor-help">
                  Central
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content class="popover--content w-64 p-3">
                    <div class="text-sm">
                      <strong>Central</strong> part is the primary keyboard part that processes keymap, communicates
                      with host devices, and for split keyboards receives data from peripheral part(s).
                      <Show when={context.keyboard.dongle}>
                        {" "}With dongle mode, this part is converted to a Peripheral part that only sends data to the dongle.
                      </Show>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover>
            </Show>
            <Show when={partRole().isPeripheral}>
              <Popover>
                <Popover.Trigger class="badge badge-secondary badge-sm cursor-help">
                  Peripheral
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content class="popover--content w-64 p-3">
                    <div class="text-sm">
                      <strong>Peripheral</strong> part(s) sends key/input events to the keyboard central
                      via an internal BLE connection. It does not work as a standalone keyboard.
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover>
            </Show>
          </div>
        </div>

        {/* Row 2: Controller/Wiring and Capabilities */}
        <div class="flex items-center gap-2">
          {/* Controller/Wiring Mode Button */}
          <Dialog open={boardDialogOpen()} onOpenChange={(v) => {
            if (v) {
              setControllerDraft(part().controller);
              setWiringDraft(part().wiring);
            }
            setBoardDialogOpen(v);
          }}>
            <Dialog.Trigger class="btn btn-sm btn-ghost flex-1 justify-start text-left gap-2 h-auto py-1.5">
              <div class="flex flex-col items-start min-w-0">
                <span class="text-sm font-medium truncate">{controllerLabel(part().controller)}</span>
                <span class="text-xs text-base-content/60 truncate">{wiringLabel(part().wiring)}</span>
              </div>
              <SquarePen class="w-4 h-4 shrink-0 ml-auto" aria-hidden />
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
                        <option value="matrix_diode">Matrix with diodes</option>
                        <option value="direct_gnd">Direct to GND</option>
                        <option disabled>──────────</option>
                        <option disabled>Uncommon Wiring Types</option>
                        <option value="matrix_no_diode">Matrix without diodes</option>
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

          {/* Controller Capabilities Badges */}
          <div class="flex items-center gap-1">
            <Popover>
              <Popover.Trigger
                class="badge badge-sm cursor-help"
                classList={{
                  "badge-success": capabilities().usb,
                  "badge-outline opacity-50": !capabilities().usb,
                }}
              >
                USB
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="popover--content w-56 p-3">
                  <div class="text-sm">
                    <Show
                      when={capabilities().usb}
                      fallback={<>This controller does not support USB.</>}
                    >
                      This controller has USB capabilities.
                      <Show when={partRole().isPeripheral}>
                        <br />
                        Note peripheral parts do not work as standalone USB keyboards.
                      </Show>
                    </Show>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
            <Popover>
              <Popover.Trigger
                class="badge badge-sm cursor-help"
                classList={{
                  "badge-info": capabilities().ble,
                  "badge-outline opacity-50": !capabilities().ble,
                }}
              >
                BLE
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="popover--content w-56 p-3">
                  <div class="text-sm">
                    <Show
                      when={capabilities().ble}
                      fallback={<>This controller does not support BLE.</>}
                    >
                      This controller has BLE capabilities.
                      <Show when={partRole().isPeripheral}>
                        <br />
                        Note peripheral parts only communicate to the central part via an internal BLE connection.
                      </Show>
                    </Show>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          </div>
        </div>

        {/* Row 3: Actions (Copy Wiring, future features) */}
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-base-300/50">
          {/* Copy Wiring Menu */}
          <DropdownMenu>
            <DropdownMenu.Trigger class="btn btn-xs btn-ghost gap-1" title="Copy pin configuration from another part" aria-label="Copy pin configuration from another part">
              <Copy class="w-3.5 h-3.5" aria-hidden />
              <span class="text-xs">Copy Wiring</span>
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
                      <DropdownMenu.SubTrigger as="li">
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
          {/* Future actions can be added here */}
        </div>
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
        <EncoderConfigurator partIndex={props.partIndex} />
      </div>

      <div class="w-full p-2">
        <BusDevicesConfigurator partIndex={props.partIndex} />
      </div>

    </div>
  );
};
