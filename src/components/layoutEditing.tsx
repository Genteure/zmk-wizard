import { Button } from "@kobalte/core/button";
import { Popover } from "@kobalte/core/popover";
import { ToggleGroup } from "@kobalte/core/toggle-group";
import { Tooltip } from "@kobalte/core/tooltip";
import Anchor from "lucide-solid/icons/anchor";
import Circle from "lucide-solid/icons/circle";
import Clipboard from "lucide-solid/icons/clipboard";
import Copy from "lucide-solid/icons/copy";
import FlipHorizontal2 from "lucide-solid/icons/flip-horizontal-2";
import FlipVertical2 from "lucide-solid/icons/flip-vertical-2";
import Move from "lucide-solid/icons/move";
import MousePointer from "lucide-solid/icons/mouse-pointer";
import RectangleHorizontal from "lucide-solid/icons/rectangle-horizontal";
import RotateCw from "lucide-solid/icons/rotate-cw";
import Target from "lucide-solid/icons/target";
import X from "lucide-solid/icons/x";
import { createMemo, createSignal, For, Show, type Accessor, type ParentComponent, type Setter, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
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
 * Layout editing state that lives at the graphics component level
 */
export interface LayoutEditState {
  tool: Accessor<LayoutEditTool>;
  setTool: Setter<LayoutEditTool>;
  rotateMode: Accessor<RotateMode>;
  setRotateMode: Setter<RotateMode>;
  clipboard: Accessor<Key[] | null>;
  setClipboard: Setter<Key[] | null>;
}

/**
 * Create layout editing state
 */
export function createLayoutEditState(): LayoutEditState {
  const [tool, setTool] = createSignal<LayoutEditTool>("select");
  const [rotateMode, setRotateMode] = createSignal<RotateMode>("center");
  const [clipboard, setClipboard] = createSignal<Key[] | null>(null);

  return {
    tool,
    setTool,
    rotateMode,
    setRotateMode,
    clipboard,
    setClipboard,
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
    // Deep clone the keys
    editState().setClipboard(structuredClone(keys));
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

  // Skip rendering toolbar if not in physical layout or not in layout tab
  if (!props.isPhysicalLayout || context.nav.selectedTab !== "layout") {
    return null;
  }

  return (
    <div class="absolute top-2 right-2 flex flex-col gap-1 z-20" data-controls>
      {/* Tool selection */}
      <div class="flex flex-wrap gap-1 bg-base-200/80 backdrop-blur-sm rounded-lg p-1 shadow-md">
        <ToggleGroup
          value={editState().tool()}
          onChange={(v) => v && editState().setTool(v as LayoutEditTool)}
          class="flex gap-0.5"
        >
          <ToolbarTooltip content="Select" shortcut="V">
            <ToggleGroup.Item
              value="select"
              class="btn btn-sm btn-square btn-ghost"
              classList={{ "btn-active": editState().tool() === "select" }}
            >
              <MousePointer class="w-4 h-4" />
            </ToggleGroup.Item>
          </ToolbarTooltip>

          <ToolbarTooltip content="Move" shortcut="M">
            <ToggleGroup.Item
              value="move"
              class="btn btn-sm btn-square btn-ghost"
              classList={{ "btn-active": editState().tool() === "move" }}
            >
              <Move class="w-4 h-4" />
            </ToggleGroup.Item>
          </ToolbarTooltip>

          <ToolbarTooltip content="Rotate" shortcut="R">
            <ToggleGroup.Item
              value="rotate"
              class="btn btn-sm btn-square btn-ghost"
              classList={{ "btn-active": editState().tool() === "rotate" }}
            >
              <RotateCw class="w-4 h-4" />
            </ToggleGroup.Item>
          </ToolbarTooltip>

          <ToolbarTooltip content="Resize" shortcut="S">
            <ToggleGroup.Item
              value="resize"
              class="btn btn-sm btn-square btn-ghost"
              classList={{ "btn-active": editState().tool() === "resize" }}
            >
              <RectangleHorizontal class="w-4 h-4" />
            </ToggleGroup.Item>
          </ToolbarTooltip>
        </ToggleGroup>

        {/* Rotation mode toggle (only shown when rotate tool is active) */}
        <Show when={editState().tool() === "rotate"}>
          <div class="border-l border-base-300 mx-1" />
          <ToggleGroup
            value={editState().rotateMode()}
            onChange={(v) => v && editState().setRotateMode(v as RotateMode)}
            class="flex gap-0.5"
          >
            <ToolbarTooltip content="Rotate around key center">
              <ToggleGroup.Item
                value="center"
                class="btn btn-sm btn-square btn-ghost"
                classList={{ "btn-active": editState().rotateMode() === "center" }}
              >
                <Circle class="w-4 h-4" />
              </ToggleGroup.Item>
            </ToolbarTooltip>

            <ToolbarTooltip content="Rotate around anchor point">
              <ToggleGroup.Item
                value="anchor"
                class="btn btn-sm btn-square btn-ghost"
                classList={{ "btn-active": editState().rotateMode() === "anchor" }}
              >
                <Anchor class="w-4 h-4" />
              </ToggleGroup.Item>
            </ToolbarTooltip>
          </ToggleGroup>
        </Show>
      </div>

      {/* Actions toolbar */}
      <div class="flex flex-wrap gap-1 bg-base-200/80 backdrop-blur-sm rounded-lg p-1 shadow-md">
        <ToolbarTooltip content="Copy" shortcut="Ctrl+C">
          <Button
            class="btn btn-sm btn-square btn-ghost"
            disabled={!hasSelection()}
            onClick={copyKeys}
          >
            <Copy class="w-4 h-4" />
          </Button>
        </ToolbarTooltip>

        <ToolbarTooltip content="Paste" shortcut="Ctrl+V">
          <Button
            class="btn btn-sm btn-square btn-ghost"
            disabled={!editState().clipboard()}
            onClick={pasteKeys}
          >
            <Clipboard class="w-4 h-4" />
          </Button>
        </ToolbarTooltip>

        <div class="border-l border-base-300 mx-1" />

        <ToolbarTooltip content="Mirror Horizontal">
          <Button
            class="btn btn-sm btn-square btn-ghost"
            disabled={!hasSelection()}
            onClick={mirrorHorizontal}
          >
            <FlipHorizontal2 class="w-4 h-4" />
          </Button>
        </ToolbarTooltip>

        <ToolbarTooltip content="Mirror Vertical">
          <Button
            class="btn btn-sm btn-square btn-ghost"
            disabled={!hasSelection()}
            onClick={mirrorVertical}
          >
            <FlipVertical2 class="w-4 h-4" />
          </Button>
        </ToolbarTooltip>

        <div class="border-l border-base-300 mx-1" />

        {/* Position/Size popover */}
        <MoveExactPopover />
      </div>
    </div>
  );
};

/**
 * Popover for entering exact position/size values
 */
const MoveExactPopover: VoidComponent = () => {
  const context = useWizardContext();
  const [isOpen, setIsOpen] = createSignal(false);

  // Local form state
  const [xValue, setXValue] = createSignal("");
  const [yValue, setYValue] = createSignal("");
  const [wValue, setWValue] = createSignal("");
  const [hValue, setHValue] = createSignal("");
  const [rValue, setRValue] = createSignal("");
  const [rxValue, setRxValue] = createSignal("");
  const [ryValue, setRyValue] = createSignal("");

  const hasSelection = createMemo(() => context.nav.selectedKeys.length > 0);

  // Load values when popover opens
  const loadValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    const selectedKeys = context.keyboard.layout.filter(k => selectedIds.includes(k.id));
    if (selectedKeys.length === 0) return;

    // If single selection, show exact values
    // If multiple selection, show empty (user can enter value to apply to all)
    if (selectedKeys.length === 1) {
      const k = selectedKeys[0];
      setXValue(k.x.toString());
      setYValue(k.y.toString());
      setWValue(k.w.toString());
      setHValue(k.h.toString());
      setRValue(k.r.toString());
      setRxValue(k.rx.toString());
      setRyValue(k.ry.toString());
    } else {
      // For multiple selection, check if values are the same
      const sameX = selectedKeys.every(k => k.x === selectedKeys[0].x);
      const sameY = selectedKeys.every(k => k.y === selectedKeys[0].y);
      const sameW = selectedKeys.every(k => k.w === selectedKeys[0].w);
      const sameH = selectedKeys.every(k => k.h === selectedKeys[0].h);
      const sameR = selectedKeys.every(k => k.r === selectedKeys[0].r);
      const sameRx = selectedKeys.every(k => k.rx === selectedKeys[0].rx);
      const sameRy = selectedKeys.every(k => k.ry === selectedKeys[0].ry);

      setXValue(sameX ? selectedKeys[0].x.toString() : "");
      setYValue(sameY ? selectedKeys[0].y.toString() : "");
      setWValue(sameW ? selectedKeys[0].w.toString() : "");
      setHValue(sameH ? selectedKeys[0].h.toString() : "");
      setRValue(sameR ? selectedKeys[0].r.toString() : "");
      setRxValue(sameRx ? selectedKeys[0].rx.toString() : "");
      setRyValue(sameRy ? selectedKeys[0].ry.toString() : "");
    }
  };

  // Apply values to selected keys
  const applyValues = () => {
    const selectedIds = context.nav.selectedKeys;
    if (selectedIds.length === 0) return;

    context.setKeyboard("layout", produce(layout => {
      selectedIds.forEach(id => {
        const k = layout.find(key => key.id === id);
        if (!k) return;

        const x = parseFloat(xValue());
        const y = parseFloat(yValue());
        const w = parseFloat(wValue());
        const h = parseFloat(hValue());
        const r = parseFloat(rValue());
        const rx = parseFloat(rxValue());
        const ry = parseFloat(ryValue());

        if (!isNaN(x)) k.x = x;
        if (!isNaN(y)) k.y = y;
        if (!isNaN(w) && w > 0) k.w = w;
        if (!isNaN(h) && h > 0) k.h = h;
        if (!isNaN(r)) k.r = r;
        if (!isNaN(rx)) k.rx = rx;
        if (!isNaN(ry)) k.ry = ry;
      });
    }));
    normalizeKeys(context);
    setIsOpen(false);
  };

  const fields = [
    { label: "X", value: xValue, setValue: setXValue, placeholder: "X position" },
    { label: "Y", value: yValue, setValue: setYValue, placeholder: "Y position" },
    { label: "W", value: wValue, setValue: setWValue, placeholder: "Width" },
    { label: "H", value: hValue, setValue: setHValue, placeholder: "Height" },
    { label: "R", value: rValue, setValue: setRValue, placeholder: "Rotation (deg)" },
    { label: "RX", value: rxValue, setValue: setRxValue, placeholder: "Rotation origin X" },
    { label: "RY", value: ryValue, setValue: setRyValue, placeholder: "Rotation origin Y" },
  ];

  return (
    <Popover open={isOpen()} onOpenChange={(open) => {
      setIsOpen(open);
      if (open) loadValues();
    }}>
      <ToolbarTooltip content="Set exact values">
        <Popover.Trigger
          class="btn btn-sm btn-square btn-ghost"
          disabled={!hasSelection()}
        >
          <Target class="w-4 h-4" />
        </Popover.Trigger>
      </ToolbarTooltip>
      <Popover.Portal>
        <Popover.Content class="popover--content w-64 p-3 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-sm">Set Key Properties</h3>
            <Popover.CloseButton class="btn btn-xs btn-circle btn-ghost">
              <X class="w-4 h-4" />
            </Popover.CloseButton>
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <For each={fields}>
              {(field) => (
                <label class="input input-sm input-bordered flex items-center gap-1">
                  <span class="text-xs font-mono text-base-content/70 w-6">{field.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={field.placeholder}
                    class="w-full bg-transparent"
                    value={field.value()}
                    onInput={(e) => field.setValue(e.currentTarget.value)}
                  />
                </label>
              )}
            </For>
          </div>

          <div class="flex justify-end gap-2">
            <Popover.CloseButton class="btn btn-sm btn-ghost">
              Cancel
            </Popover.CloseButton>
            <Button class="btn btn-sm btn-primary" onClick={applyValues}>
              Apply
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
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
