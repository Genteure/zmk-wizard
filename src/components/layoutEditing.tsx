import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { ToggleGroup } from "@kobalte/core/toggle-group";
import { Tooltip } from "@kobalte/core/tooltip";
import Anchor from "lucide-solid/icons/anchor";
import Circle from "lucide-solid/icons/circle";
import Clipboard from "lucide-solid/icons/clipboard";
import Copy from "lucide-solid/icons/copy";
import FlipHorizontal2 from "lucide-solid/icons/flip-horizontal-2";
import FlipVertical2 from "lucide-solid/icons/flip-vertical-2";
import Hash from "lucide-solid/icons/hash";
import Move from "lucide-solid/icons/move";
import MousePointer from "lucide-solid/icons/mouse-pointer";
import RectangleHorizontal from "lucide-solid/icons/rectangle-horizontal";
import RotateCw from "lucide-solid/icons/rotate-cw";
import Settings from "lucide-solid/icons/settings";
import X from "lucide-solid/icons/x";
import { createMemo, createSignal, For, Show, type Accessor, type ParentComponent, type Setter, type VoidComponent } from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { ulid } from "ulidx";
import { bboxCenter, getKeysBoundingBox, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import { normalizeKeys, useWizardContext } from "./context";
import type { GraphicsKey } from "./graphics";

/**
 * Layout editing tool modes
 */
export type LayoutEditTool = "select" | "move" | "rotate" | "resize";

/**
 * Rotation modes for the rotate tool
 */
export type RotateMode = "anchor" | "center";

/**
 * Snapping settings for movement and rotation
 */
export interface SnapSettings {
  moveSnap: number;   // Snap to units (0.1, 0.25, 0.5, 1)
  rotateSnap: number; // Snap to degrees (1, 5, 15)
}

/** Available movement snap options */
export const MOVE_SNAP_OPTIONS = [
  { value: 0.1, label: "0.1u" },
  { value: 0.25, label: "0.25u" },
  { value: 0.5, label: "0.5u" },
  { value: 1, label: "1u" },
];

/** Available rotation snap options */
export const ROTATE_SNAP_OPTIONS = [
  { value: 1, label: "1°" },
  { value: 5, label: "5°" },
  { value: 15, label: "15°" },
];

/** Default snap settings */
export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  moveSnap: 0.25,
  rotateSnap: 15,
};

/**
 * Layout editing state that lives at the graphics component level
 */
export interface LayoutEditState {
  tool: Accessor<LayoutEditTool>;
  setTool: Setter<LayoutEditTool>;
  rotateMode: Accessor<RotateMode>;
  setRotateMode: Setter<RotateMode>;
  clipboard: Accessor<Key[] | null>;
  setClipboard: Setter<Key[] | null>;
  snapSettings: Accessor<SnapSettings>;
  setSnapSettings: Setter<SnapSettings>;
}

/**
 * Create layout editing state
 */
export function createLayoutEditState(): LayoutEditState {
  const [tool, setTool] = createSignal<LayoutEditTool>("select");
  const [rotateMode, setRotateMode] = createSignal<RotateMode>("center");
  const [clipboard, setClipboard] = createSignal<Key[] | null>(null);
  const [snapSettings, setSnapSettings] = createSignal<SnapSettings>(DEFAULT_SNAP_SETTINGS);

  return {
    tool,
    setTool,
    rotateMode,
    setRotateMode,
    clipboard,
    setClipboard,
    snapSettings,
    setSnapSettings,
  };
}

/**
 * Props for the layout editing toolbar
 */
interface LayoutEditToolbarProps {
  editState: LayoutEditState;
  keys: Accessor<GraphicsKey[]>;
  /** If true, this is in the physical layout view (enables editing tools) */
  isPhysicalLayout?: boolean;
}

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

/**
 * Layout editing toolbar component
 * Displays at top-right of the keyboard graphics view
 */
export const LayoutEditToolbar: VoidComponent<LayoutEditToolbarProps> = (props) => {
  const context = useWizardContext();
  const editState = () => props.editState;

  const hasSelection = createMemo(() => context.nav.selectedKeys.length > 0);

  // Get selected keys data
  const selectedKeysData = createMemo(() => {
    const selectedIds = context.nav.selectedKeys;
    return context.keyboard.layout.filter(k => selectedIds.includes(k.id));
  });

  // Copy selected keys
  const copyKeys = () => {
    const keys = selectedKeysData();
    if (keys.length === 0) return;
    // Unwrap from Solid store proxy and deep clone the keys
    const unwrappedKeys = keys.map(k => ({ ...unwrap(k) }));
    editState().setClipboard(structuredClone(unwrappedKeys));
  };

  // Paste keys from clipboard
  const pasteKeys = () => {
    const clipboardKeys = editState().clipboard();
    if (!clipboardKeys || clipboardKeys.length === 0) return;

    // Calculate offset for pasting (offset by 0.5U to avoid exact overlap)
    const pasteOffset = 0.5;

    // Create new keys with new IDs and offset positions
    const newKeys: Key[] = clipboardKeys.map(k => ({
      ...k,
      id: ulid(),
      x: k.x + pasteOffset,
      y: k.y + pasteOffset,
      rx: k.rx !== 0 ? k.rx + pasteOffset : 0,
      ry: k.ry !== 0 ? k.ry + pasteOffset : 0,
    }));

    // Add new keys and select them
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

      // Find the center X of selected keys
      const bbox = getKeysBoundingBox(selectedKeys);
      const centerX = (bbox.min.x + bbox.max.x) / 2 / 70; // Convert from pixels to units

      selectedKeys.forEach(k => {
        // Mirror x position around center
        const distFromCenter = k.x + k.w / 2 - centerX;
        k.x = centerX - distFromCenter - k.w / 2;

        // Mirror rotation
        k.r = -k.r;

        // Mirror rotation origin if set
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

      // Find the center Y of selected keys
      const bbox = getKeysBoundingBox(selectedKeys);
      const centerY = (bbox.min.y + bbox.max.y) / 2 / 70; // Convert from pixels to units

      selectedKeys.forEach(k => {
        // Mirror y position around center
        const distFromCenter = k.y + k.h / 2 - centerY;
        k.y = centerY - distFromCenter - k.h / 2;

        // Mirror rotation (flip sign for vertical mirror)
        k.r = -k.r;

        // Mirror rotation origin if set
        if (k.ry !== 0) {
          const ryDistFromCenter = k.ry - centerY;
          k.ry = centerY - ryDistFromCenter;
        }
      });
    }));
    normalizeKeys(context);
  };

  // Skip rendering toolbar if not in layout tab (e.g., when in wiring or other modes)
  if (context.nav.selectedTab !== "layout") {
    return null;
  }

  const currentTool = editState().tool;
  const isEditingTool = () => currentTool() !== "select";

  return (
    <div class="absolute top-2 right-2 flex items-start gap-1 z-20" data-controls>
      {/* Snapping options (leftmost for minimal layout shift) */}
      <Show when={props.isPhysicalLayout}>
        <div class="flex items-center gap-0.5 bg-base-200/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md">
          <SnapSettingsPopover editState={editState()} />
        </div>
      </Show>

      {/* Tool selection (only for physical layout) */}
      <Show when={props.isPhysicalLayout}>
        <div class="flex items-center gap-0.5 bg-base-200/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md">
          <ToggleGroup
            value={currentTool()}
            onChange={(v) => v && editState().setTool(v as LayoutEditTool)}
            class="flex gap-0.5"
          >
            <ToolbarTooltip content="Select (V)">
              <ToggleGroup.Item
                value="select"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentTool() === "select" }}
              >
                <MousePointer class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>

            <ToolbarTooltip content="Move (M)">
              <ToggleGroup.Item
                value="move"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentTool() === "move" }}
              >
                <Move class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>

            <ToolbarTooltip content="Rotate (R)">
              <ToggleGroup.Item
                value="rotate"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentTool() === "rotate" }}
              >
                <RotateCw class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>

            <ToolbarTooltip content="Resize (S)">
              <ToggleGroup.Item
                value="resize"
                class="btn btn-xs btn-square btn-ghost"
                classList={{ "btn-active bg-primary/20": currentTool() === "resize" }}
              >
                <RectangleHorizontal class="w-3.5 h-3.5" />
              </ToggleGroup.Item>
            </ToolbarTooltip>
          </ToggleGroup>

          {/* Rotation mode (only when rotate tool is active) */}
          <Show when={currentTool() === "rotate"}>
            <div class="border-l border-base-300 h-4 mx-0.5" />
            <ToggleGroup
              value={editState().rotateMode()}
              onChange={(v) => v && editState().setRotateMode(v as RotateMode)}
              class="flex gap-0.5"
            >
              <ToolbarTooltip content="Center rotation">
                <ToggleGroup.Item
                  value="center"
                  class="btn btn-xs btn-square btn-ghost"
                  classList={{ "btn-active bg-amber-500/20": editState().rotateMode() === "center" }}
                >
                  <Circle class="w-3.5 h-3.5" />
                </ToggleGroup.Item>
              </ToolbarTooltip>

              <ToolbarTooltip content="Anchor rotation">
                <ToggleGroup.Item
                  value="anchor"
                  class="btn btn-xs btn-square btn-ghost"
                  classList={{ "btn-active bg-amber-500/20": editState().rotateMode() === "anchor" }}
                >
                  <Anchor class="w-3.5 h-3.5" />
                </ToggleGroup.Item>
              </ToolbarTooltip>
            </ToggleGroup>
          </Show>

          {/* Tool-specific exact input button */}
          <Show when={isEditingTool() && hasSelection()}>
            <div class="border-l border-base-300 h-4 mx-0.5" />
            <ToolExactDialog
              tool={currentTool}
              rotateMode={editState().rotateMode}
            />
          </Show>
        </div>
      </Show>

      {/* Actions (show for all tools, both physical and logical layouts) */}
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

          <ToolbarTooltip content="Mirror H">
            <Button
              class="btn btn-xs btn-square btn-ghost"
              disabled={!hasSelection()}
              onClick={mirrorHorizontal}
            >
              <FlipHorizontal2 class="w-3.5 h-3.5" />
            </Button>
          </ToolbarTooltip>

          <ToolbarTooltip content="Mirror V">
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
            {/* Movement snap */}
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

            {/* Rotation snap */}
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
 * Tool-specific dialog for entering exact values
 * Each tool has different fields relevant to that operation
 * Move tool uses offset values (relative), resize and rotate use absolute values
 */
const ToolExactDialog: VoidComponent<{
  tool: Accessor<LayoutEditTool>;
  rotateMode: Accessor<RotateMode>;
}> = (props) => {
  const context = useWizardContext();
  const [isOpen, setIsOpen] = createSignal(false);

  // Local form state
  // For move tool: x,y are offsets (relative)
  // For resize/rotate: values are absolute
  const [xValue, setXValue] = createSignal("");
  const [yValue, setYValue] = createSignal("");
  const [wValue, setWValue] = createSignal("");
  const [hValue, setHValue] = createSignal("");
  const [rValue, setRValue] = createSignal("");
  const [rxValue, setRxValue] = createSignal("");
  const [ryValue, setRyValue] = createSignal("");

  // Load values when dialog opens
  const loadValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    const selectedKeys = context.keyboard.layout.filter(k => selectedIds.includes(k.id));
    if (selectedKeys.length === 0) return;

    const tool = props.tool();

    if (tool === "move") {
      // For move tool, always start with 0 offset
      setXValue("0");
      setYValue("0");
    } else if (selectedKeys.length === 1) {
      const k = selectedKeys[0];
      setWValue(k.w.toString());
      setHValue(k.h.toString());
      setRValue(k.r.toString());
      setRxValue(k.rx.toString());
      setRyValue(k.ry.toString());
    } else {
      // For multiple selection, show common values or empty
      const sameW = selectedKeys.every(k => k.w === selectedKeys[0].w);
      const sameH = selectedKeys.every(k => k.h === selectedKeys[0].h);
      const sameR = selectedKeys.every(k => k.r === selectedKeys[0].r);
      const sameRx = selectedKeys.every(k => k.rx === selectedKeys[0].rx);
      const sameRy = selectedKeys.every(k => k.ry === selectedKeys[0].ry);

      setWValue(sameW ? selectedKeys[0].w.toString() : "");
      setHValue(sameH ? selectedKeys[0].h.toString() : "");
      setRValue(sameR ? selectedKeys[0].r.toString() : "");
      setRxValue(sameRx ? selectedKeys[0].rx.toString() : "");
      setRyValue(sameRy ? selectedKeys[0].ry.toString() : "");
    }
  };

  // Apply values
  const applyValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    context.setKeyboard("layout", produce(layout => {
      selectedIds.forEach(id => {
        const k = layout.find(key => key.id === id);
        if (!k) return;

        const tool = props.tool();

        if (tool === "move") {
          // Move tool uses offset (relative) values
          const dx = parseFloat(xValue());
          const dy = parseFloat(yValue());
          if (!isNaN(dx)) k.x = roundTo(k.x + dx);
          if (!isNaN(dy)) k.y = roundTo(k.y + dy);
          // Also move rotation anchor if it's set
          if (k.rx !== 0 && !isNaN(dx)) k.rx = roundTo(k.rx + dx);
          if (k.ry !== 0 && !isNaN(dy)) k.ry = roundTo(k.ry + dy);
        } else if (tool === "resize") {
          const w = parseFloat(wValue());
          const h = parseFloat(hValue());
          if (!isNaN(w) && w > 0) k.w = w;
          if (!isNaN(h) && h > 0) k.h = h;
        } else if (tool === "rotate") {
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
    switch (props.tool()) {
      case "move": return "Move by Offset";
      case "resize": return "Set Size";
      case "rotate": return "Set Rotation";
      default: return "Set Values";
    }
  });

  return (
    <Dialog open={isOpen()} onOpenChange={(open) => {
      setIsOpen(open);
      if (open) loadValues();
    }}>
      <ToolbarTooltip content="Exact values">
        <Dialog.Trigger
          class="btn btn-xs btn-square btn-ghost"
        >
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

          {/* Move tool fields - offset values */}
          <Show when={props.tool() === "move"}>
            <div class="grid grid-cols-2 gap-2 mb-2">
              <label class="input input-sm input-bordered flex items-center gap-1">
                <span class="text-xs font-mono text-base-content/70 w-6" aria-label="X offset">ΔX</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  class="w-full bg-transparent"
                  value={xValue()}
                  onInput={(e) => setXValue(e.currentTarget.value)}
                  aria-label="X offset value"
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
                  aria-label="Y offset value"
                />
              </label>
            </div>
            <p class="text-xs text-base-content/60 mb-3">
              Offset in units (negative = left/up)
            </p>
          </Show>

          {/* Resize tool fields */}
          <Show when={props.tool() === "resize"}>
            <div class="grid grid-cols-2 gap-2 mb-3">
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
          </Show>

          {/* Rotate tool fields */}
          <Show when={props.tool() === "rotate"}>
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
              <Show when={props.rotateMode() === "anchor"}>
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

/**
 * Helper: Calculate rotation angle from a point to target point
 */
export function angleFromPoints(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Helper: Round to specified decimal places
 */
export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Helper: Snap value to grid (default 0.25U)
 */
export function snapToGrid(value: number, gridSize: number = 0.25): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Calculate the common anchor point for multiple keys (for anchor rotation mode)
 */
export function getCommonAnchor(keys: Key[]): Point {
  if (keys.length === 0) return { x: 0, y: 0 };
  if (keys.length === 1) {
    const k = keys[0];
    return { x: k.rx || k.x + k.w / 2, y: k.ry || k.y + k.h / 2 };
  }
  // For multiple keys, use the center of bounding box
  const bbox = getKeysBoundingBox(keys);
  return bboxCenter(bbox);
}
