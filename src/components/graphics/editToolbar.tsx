/**
 * Layout editing toolbar component.
 * 
 * Displays tools and actions for layout editing:
 * - Mode toggle (Move/Rotate)
 * - Mode-specific options (rotation sub-mode, snap settings)
 * - Actions (Copy, Paste, Mirror)
 */

import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { ToggleGroup } from "@kobalte/core/toggle-group";
import { Tooltip } from "@kobalte/core/tooltip";
import Anchor from "lucide-solid/icons/anchor";
import Circle from "lucide-solid/icons/circle";
import Clipboard from "lucide-solid/icons/clipboard";
import Copy from "lucide-solid/icons/copy";
import Crosshair from "lucide-solid/icons/crosshair";
import FlipHorizontal2 from "lucide-solid/icons/flip-horizontal-2";
import FlipVertical2 from "lucide-solid/icons/flip-vertical-2";
import Hash from "lucide-solid/icons/hash";
import Move from "lucide-solid/icons/move";
import Pencil from "lucide-solid/icons/pencil";
import PencilOff from "lucide-solid/icons/pencil-off";
import Pin from "lucide-solid/icons/pin";
import RotateCw from "lucide-solid/icons/rotate-cw";
import Settings from "lucide-solid/icons/settings";
import X from "lucide-solid/icons/x";
import {
  createMemo,
  createSignal,
  For,
  Show,
  type Accessor,
  type ParentComponent,
  type VoidComponent,
} from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { ulid } from "ulidx";
import { getKeysBoundingBox } from "~/lib/geometry";
import type { Key } from "../../typedef";
import { normalizeKeys, useWizardContext } from "../context";
import type { GraphicsKey } from "./index";
import {
  type LayoutEditMode,
  type LayoutEditState,
  type RotateSubMode,
  type CenterAnchorMoveMode,
  MOVE_SNAP_OPTIONS,
  ROTATE_SNAP_OPTIONS,
} from "./editState";

/**
 * Tooltip wrapper for toolbar buttons
 */
const ToolbarTooltip: ParentComponent<{
  content: string;
  shortcut?: string;
}> = (props) => (
  <Tooltip openDelay={300} closeDelay={0}>
    <Tooltip.Trigger as="span" class="inline-flex">
      {props.children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content class="tooltip-content bg-base-300 px-2 py-1 rounded shadow-lg text-xs z-50">
        <div>{props.content}</div>
        <Show when={props.shortcut}>
          <div class="text-base-content/60 font-mono">{props.shortcut}</div>
        </Show>
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip>
);

interface LayoutEditToolbarProps {
  editState: LayoutEditState;
  keys: Accessor<GraphicsKey[]>;
  isPhysicalLayout?: boolean;
}

/**
 * Layout editing toolbar component
 */
export const LayoutEditToolbar: VoidComponent<LayoutEditToolbarProps> = (props) => {
  const context = useWizardContext();
  const editState = () => props.editState;

  const hasSelection = createMemo(() => context.nav.selectedKeys.length > 0);

  const selectedKeysData = createMemo(() => {
    const selectedIds = context.nav.selectedKeys;
    return context.keyboard.layout.filter(k => selectedIds.includes(k.id));
  });

  // Copy selected keys
  const copyKeys = () => {
    const keys = selectedKeysData();
    if (keys.length === 0) return;
    const unwrappedKeys = keys.map(k => ({ ...unwrap(k) }));
    editState().setClipboard(structuredClone(unwrappedKeys));
  };

  // Paste keys from clipboard
  const pasteKeys = () => {
    const clipboardKeys = editState().clipboard();
    if (!clipboardKeys || clipboardKeys.length === 0) return;

    const pasteOffset = 0.5;
    const newKeys: Key[] = clipboardKeys.map(k => ({
      ...k,
      id: ulid(),
      x: k.x + pasteOffset,
      y: k.y + pasteOffset,
      rx: k.rx !== 0 ? k.rx + pasteOffset : 0,
      ry: k.ry !== 0 ? k.ry + pasteOffset : 0,
    }));

    context.setKeyboard("layout", produce(layout => {
      layout.push(...newKeys);
    }));
    context.setNav("selectedKeys", newKeys.map(k => k.id));
    normalizeKeys(context);
  };

  // Mirror selected keys horizontally
  const mirrorHorizontal = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    context.setKeyboard("layout", produce(layout => {
      const selectedKeys = layout.filter(k => selectedIds.includes(k.id));
      if (selectedKeys.length === 0) return;

      const bbox = getKeysBoundingBox(selectedKeys);
      const centerX = (bbox.min.x + bbox.max.x) / 2 / 70;

      selectedKeys.forEach(k => {
        const distFromCenter = k.x + k.w / 2 - centerX;
        k.x = centerX - distFromCenter - k.w / 2;
        k.r = -k.r;
        if (k.rx !== 0) {
          const rxDistFromCenter = k.rx - centerX;
          k.rx = centerX - rxDistFromCenter;
        }
      });
    }));
    normalizeKeys(context);
  };

  // Mirror selected keys vertically
  const mirrorVertical = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    context.setKeyboard("layout", produce(layout => {
      const selectedKeys = layout.filter(k => selectedIds.includes(k.id));
      if (selectedKeys.length === 0) return;

      const bbox = getKeysBoundingBox(selectedKeys);
      const centerY = (bbox.min.y + bbox.max.y) / 2 / 70;

      selectedKeys.forEach(k => {
        const distFromCenter = k.y + k.h / 2 - centerY;
        k.y = centerY - distFromCenter - k.h / 2;
        k.r = -k.r;
        if (k.ry !== 0) {
          const ryDistFromCenter = k.ry - centerY;
          k.ry = centerY - ryDistFromCenter;
        }
      });
    }));
    normalizeKeys(context);
  };

  // Skip rendering if not in layout tab
  if (context.nav.selectedTab !== "layout") {
    return null;
  }

  const isEditingEnabled = editState().isEditingEnabled;
  const currentMode = editState().mode;

  return (
    <div class="absolute top-2 right-2 flex items-start gap-1 z-20" data-controls>
      {/* Edit mode toggle (only for physical layout) */}
      <Show when={props.isPhysicalLayout}>
        <div class="flex items-center gap-0.5 bg-base-200/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md">
          <ToolbarTooltip content={isEditingEnabled() ? "Disable editing (E)" : "Enable editing (E)"}>
            <Button
              class="btn btn-xs btn-square"
              classList={{
                "btn-primary": isEditingEnabled(),
                "btn-ghost": !isEditingEnabled(),
              }}
              onClick={() => editState().setIsEditingEnabled(!isEditingEnabled())}
            >
              {isEditingEnabled() ? <Pencil class="w-3.5 h-3.5" /> : <PencilOff class="w-3.5 h-3.5" />}
            </Button>
          </ToolbarTooltip>
        </div>
      </Show>

      {/* Mode selection and options (only when editing is enabled) */}
      <Show when={props.isPhysicalLayout && isEditingEnabled()}>
        <div class="flex items-center gap-0.5 bg-base-200/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md">
          {/* Snap settings */}
          <SnapSettingsPopover editState={editState()} />

          <div class="border-l border-base-300 h-4 mx-0.5" />

          {/* Mode toggle */}
          <ToggleGroup
            value={currentMode()}
            onChange={(v) => v && editState().setMode(v as LayoutEditMode)}
            class="flex gap-0.5"
          >
            <ToolbarTooltip content="Move mode (M)">
              <ToggleGroup.Item
                value="move"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentMode() === "move" }}
              >
                <Move class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>

            <ToolbarTooltip content="Rotate mode (R)">
              <ToggleGroup.Item
                value="rotate"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentMode() === "rotate" }}
              >
                <RotateCw class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>
          </ToggleGroup>

          {/* Rotation sub-mode options (only in rotate mode) */}
          <Show when={currentMode() === "rotate"}>
            <div class="border-l border-base-300 h-4 mx-0.5" />
            <ToggleGroup
              value={editState().rotateSubMode()}
              onChange={(v) => v && editState().setRotateSubMode(v as RotateSubMode)}
              class="flex gap-0.5"
            >
              <ToolbarTooltip content="Center rotation">
                <ToggleGroup.Item
                  value="center"
                  class="btn btn-xs btn-square btn-ghost"
                  classList={{ "btn-active bg-amber-500/20": editState().rotateSubMode() === "center" }}
                >
                  <Circle class="w-3.5 h-3.5" />
                </ToggleGroup.Item>
              </ToolbarTooltip>

              <ToolbarTooltip content="Anchor rotation">
                <ToggleGroup.Item
                  value="anchor"
                  class="btn btn-xs btn-square btn-ghost"
                  classList={{ "btn-active bg-amber-500/20": editState().rotateSubMode() === "anchor" }}
                >
                  <Anchor class="w-3.5 h-3.5" />
                </ToggleGroup.Item>
              </ToolbarTooltip>
            </ToggleGroup>

            {/* Center anchor move mode */}
            <Show when={editState().rotateSubMode() === "center"}>
              <div class="border-l border-base-300 h-4 mx-0.5" />
              <ToggleGroup
                value={editState().centerAnchorMoveMode()}
                onChange={(v) => v && editState().setCenterAnchorMoveMode(v as CenterAnchorMoveMode)}
                class="flex gap-0.5"
              >
                <ToolbarTooltip content="Keep final position fixed when moving anchor">
                  <ToggleGroup.Item
                    value="final"
                    class="btn btn-xs btn-square btn-ghost"
                    classList={{ "btn-active bg-green-500/20": editState().centerAnchorMoveMode() === "final" }}
                  >
                    <Crosshair class="w-3.5 h-3.5" />
                  </ToggleGroup.Item>
                </ToolbarTooltip>

                <ToolbarTooltip content="Keep original x,y fixed when moving anchor">
                  <ToggleGroup.Item
                    value="original"
                    class="btn btn-xs btn-square btn-ghost"
                    classList={{ "btn-active bg-green-500/20": editState().centerAnchorMoveMode() === "original" }}
                  >
                    <Pin class="w-3.5 h-3.5" />
                  </ToggleGroup.Item>
                </ToolbarTooltip>
              </ToggleGroup>
            </Show>
          </Show>

          {/* Exact values dialog */}
          <Show when={hasSelection()}>
            <div class="border-l border-base-300 h-4 mx-0.5" />
            <ExactValuesDialog mode={currentMode} rotateSubMode={editState().rotateSubMode} />
          </Show>
        </div>
      </Show>

      {/* Actions (always shown when there's a selection or clipboard) */}
      <Show when={hasSelection() || editState().clipboard()}>
        <div class="flex items-center gap-0.5 bg-base-200/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md">
          <ToolbarTooltip content="Copy (Ctrl+C)">
            <Button
              class="btn btn-xs btn-square btn-ghost"
              disabled={!hasSelection()}
              onClick={copyKeys}
            >
              <Copy class="w-3.5 h-3.5" />
            </Button>
          </ToolbarTooltip>

          <ToolbarTooltip content="Paste (Ctrl+V)">
            <Button
              class="btn btn-xs btn-square btn-ghost"
              disabled={!editState().clipboard()}
              onClick={pasteKeys}
            >
              <Clipboard class="w-3.5 h-3.5" />
            </Button>
          </ToolbarTooltip>

          <div class="border-l border-base-300 h-4 mx-0.5" />

          <ToolbarTooltip content="Mirror Horizontal">
            <Button
              class="btn btn-xs btn-square btn-ghost"
              disabled={!hasSelection()}
              onClick={mirrorHorizontal}
            >
              <FlipHorizontal2 class="w-3.5 h-3.5" />
            </Button>
          </ToolbarTooltip>

          <ToolbarTooltip content="Mirror Vertical">
            <Button
              class="btn btn-xs btn-square btn-ghost"
              disabled={!hasSelection()}
              onClick={mirrorVertical}
            >
              <FlipVertical2 class="w-3.5 h-3.5" />
            </Button>
          </ToolbarTooltip>
        </div>
      </Show>
    </div>
  );
};

/**
 * Snapping settings popover
 */
const SnapSettingsPopover: VoidComponent<{
  editState: LayoutEditState;
}> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const snapSettings = () => props.editState.snapSettings();

  const updateMoveSnap = (value: number) => {
    props.editState.setSnapSettings(s => ({ ...s, moveSnap: value }));
  };

  const updateRotateSnap = (value: number) => {
    props.editState.setSnapSettings(s => ({ ...s, rotateSnap: value }));
  };

  return (
    <Dialog open={isOpen()} onOpenChange={setIsOpen}>
      <ToolbarTooltip content="Snap settings">
        <Dialog.Trigger class="btn btn-xs btn-square btn-ghost">
          <Settings class="w-3.5 h-3.5" />
        </Dialog.Trigger>
      </ToolbarTooltip>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-black/30 z-40" />
        <Dialog.Content
          class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 p-3 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          onPointerDown={(e: PointerEvent) => e.stopPropagation()}
          onMouseDown={(e: MouseEvent) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between mb-3">
            <Dialog.Title class="font-semibold text-sm">Snap Settings</Dialog.Title>
            <Dialog.CloseButton class="btn btn-xs btn-circle btn-ghost">
              <X class="w-4 h-4" />
            </Dialog.CloseButton>
          </div>

          <div class="space-y-3">
            <div>
              <label class="text-xs font-medium text-base-content/70 mb-1 block">Movement Snap</label>
              <div class="flex gap-1">
                <For each={MOVE_SNAP_OPTIONS}>
                  {(option) => (
                    <Button
                      class="btn btn-xs flex-1"
                      classList={{
                        "btn-primary": snapSettings().moveSnap === option.value,
                        "btn-ghost": snapSettings().moveSnap !== option.value,
                      }}
                      onClick={() => updateMoveSnap(option.value)}
                    >
                      {option.label}
                    </Button>
                  )}
                </For>
              </div>
            </div>

            <div>
              <label class="text-xs font-medium text-base-content/70 mb-1 block">Rotation Snap</label>
              <div class="flex gap-1">
                <For each={ROTATE_SNAP_OPTIONS}>
                  {(option) => (
                    <Button
                      class="btn btn-xs flex-1"
                      classList={{
                        "btn-primary": snapSettings().rotateSnap === option.value,
                        "btn-ghost": snapSettings().rotateSnap !== option.value,
                      }}
                      onClick={() => updateRotateSnap(option.value)}
                    >
                      {option.label}
                    </Button>
                  )}
                </For>
              </div>
            </div>

            <p class="text-xs text-base-content/60">
              Hold Shift to temporarily disable snapping
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};

/**
 * Exact values dialog for precise input
 */
const ExactValuesDialog: VoidComponent<{
  mode: Accessor<LayoutEditMode>;
  rotateSubMode: Accessor<RotateSubMode>;
}> = (props) => {
  const context = useWizardContext();
  const [isOpen, setIsOpen] = createSignal(false);

  const [xValue, setXValue] = createSignal("");
  const [yValue, setYValue] = createSignal("");
  const [wValue, setWValue] = createSignal("");
  const [hValue, setHValue] = createSignal("");
  const [rValue, setRValue] = createSignal("");
  const [rxValue, setRxValue] = createSignal("");
  const [ryValue, setRyValue] = createSignal("");

  const loadValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    const selectedKeys = context.keyboard.layout.filter(k => selectedIds.includes(k.id));
    if (selectedKeys.length === 0) return;

    const mode = props.mode();

    if (mode === "move") {
      setXValue("0");
      setYValue("0");
      
      if (selectedKeys.length === 1) {
        const k = selectedKeys[0];
        setWValue(k.w.toString());
        setHValue(k.h.toString());
      } else {
        const sameW = selectedKeys.every(k => k.w === selectedKeys[0].w);
        const sameH = selectedKeys.every(k => k.h === selectedKeys[0].h);
        setWValue(sameW ? selectedKeys[0].w.toString() : "");
        setHValue(sameH ? selectedKeys[0].h.toString() : "");
      }
    } else {
      if (selectedKeys.length === 1) {
        const k = selectedKeys[0];
        setRValue(k.r.toString());
        setRxValue(k.rx.toString());
        setRyValue(k.ry.toString());
      } else {
        const sameR = selectedKeys.every(k => k.r === selectedKeys[0].r);
        const sameRx = selectedKeys.every(k => k.rx === selectedKeys[0].rx);
        const sameRy = selectedKeys.every(k => k.ry === selectedKeys[0].ry);
        setRValue(sameR ? selectedKeys[0].r.toString() : "");
        setRxValue(sameRx ? selectedKeys[0].rx.toString() : "");
        setRyValue(sameRy ? selectedKeys[0].ry.toString() : "");
      }
    }
  };

  const roundTo = (value: number, decimals: number = 2): number => {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  };

  const applyValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    context.setKeyboard("layout", produce(layout => {
      selectedIds.forEach(id => {
        const k = layout.find(key => key.id === id);
        if (!k) return;

        const mode = props.mode();

        if (mode === "move") {
          const dx = parseFloat(xValue());
          const dy = parseFloat(yValue());
          const w = parseFloat(wValue());
          const h = parseFloat(hValue());

          if (!isNaN(dx)) k.x = roundTo(k.x + dx);
          if (!isNaN(dy)) k.y = roundTo(k.y + dy);
          if (k.rx !== 0 && !isNaN(dx)) k.rx = roundTo(k.rx + dx);
          if (k.ry !== 0 && !isNaN(dy)) k.ry = roundTo(k.ry + dy);
          if (!isNaN(w) && w > 0) k.w = w;
          if (!isNaN(h) && h > 0) k.h = h;
        } else {
          const r = parseFloat(rValue());
          const rx = parseFloat(rxValue());
          const ry = parseFloat(ryValue());

          if (!isNaN(r)) k.r = r;
          if (!isNaN(rx)) k.rx = rx;
          if (!isNaN(ry)) k.ry = ry;
        }
      });
    }));
    normalizeKeys(context);
    setIsOpen(false);
  };

  const dialogTitle = createMemo(() => {
    return props.mode() === "move" ? "Move & Resize" : "Set Rotation";
  });

  return (
    <Dialog open={isOpen()} onOpenChange={(open) => {
      setIsOpen(open);
      if (open) loadValues();
    }}>
      <ToolbarTooltip content="Exact values">
        <Dialog.Trigger class="btn btn-xs btn-square btn-ghost">
          <Hash class="w-3.5 h-3.5" />
        </Dialog.Trigger>
      </ToolbarTooltip>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-black/30 z-40" />
        <Dialog.Content
          class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 p-3 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          onPointerDown={(e: PointerEvent) => e.stopPropagation()}
          onMouseDown={(e: MouseEvent) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between mb-3">
            <Dialog.Title class="font-semibold text-sm">{dialogTitle()}</Dialog.Title>
            <Dialog.CloseButton class="btn btn-xs btn-circle btn-ghost">
              <X class="w-4 h-4" />
            </Dialog.CloseButton>
          </div>

          {/* Move mode fields */}
          <Show when={props.mode() === "move"}>
            <div class="space-y-2 mb-3">
              <div class="grid grid-cols-2 gap-2">
                <label class="input input-sm input-bordered flex items-center gap-1">
                  <span class="text-xs font-mono text-base-content/70 w-6" aria-label="X offset">ΔX</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    class="w-full bg-transparent"
                    value={xValue()}
                    onInput={(e) => setXValue(e.currentTarget.value)}
                  />
                </label>
                <label class="input input-sm input-bordered flex items-center gap-1">
                  <span class="text-xs font-mono text-base-content/70 w-6" aria-label="Y offset">ΔY</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    class="w-full bg-transparent"
                    value={yValue()}
                    onInput={(e) => setYValue(e.currentTarget.value)}
                  />
                </label>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <label class="input input-sm input-bordered flex items-center gap-1">
                  <span class="text-xs font-mono text-base-content/70 w-4">W</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Width"
                    class="w-full bg-transparent"
                    value={wValue()}
                    onInput={(e) => setWValue(e.currentTarget.value)}
                  />
                </label>
                <label class="input input-sm input-bordered flex items-center gap-1">
                  <span class="text-xs font-mono text-base-content/70 w-4">H</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Height"
                    class="w-full bg-transparent"
                    value={hValue()}
                    onInput={(e) => setHValue(e.currentTarget.value)}
                  />
                </label>
              </div>
              <p class="text-xs text-base-content/60">
                Offset in units (negative = left/up)
              </p>
            </div>
          </Show>

          {/* Rotate mode fields */}
          <Show when={props.mode() === "rotate"}>
            <div class="space-y-2 mb-3">
              <label class="input input-sm input-bordered flex items-center gap-1">
                <span class="text-xs font-mono text-base-content/70 w-8">R°</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Rotation angle"
                  class="w-full bg-transparent"
                  value={rValue()}
                  onInput={(e) => setRValue(e.currentTarget.value)}
                />
              </label>
              <Show when={props.rotateSubMode() === "anchor"}>
                <div class="grid grid-cols-2 gap-2">
                  <label class="input input-sm input-bordered flex items-center gap-1">
                    <span class="text-xs font-mono text-base-content/70 w-6">RX</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Anchor X"
                      class="w-full bg-transparent"
                      value={rxValue()}
                      onInput={(e) => setRxValue(e.currentTarget.value)}
                    />
                  </label>
                  <label class="input input-sm input-bordered flex items-center gap-1">
                    <span class="text-xs font-mono text-base-content/70 w-6">RY</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Anchor Y"
                      class="w-full bg-transparent"
                      value={ryValue()}
                      onInput={(e) => setRyValue(e.currentTarget.value)}
                    />
                  </label>
                </div>
                <p class="text-xs text-base-content/60">
                  Anchor point (0 = key center)
                </p>
              </Show>
            </div>
          </Show>

          <div class="flex justify-end gap-2">
            <Dialog.CloseButton class="btn btn-sm btn-ghost">
              Cancel
            </Dialog.CloseButton>
            <Button class="btn btn-sm btn-primary" onClick={applyValues}>
              Apply
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};
