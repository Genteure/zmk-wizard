import type { Accessor, JSX, Setter } from "solid-js";
import { produce } from "solid-js/store";
import { keyCenter, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import type { WizardContextType } from "./context";
import { normalizeKeys } from "./context";
import type { GraphicsKey } from "./graphics";
import type { LayoutEditTool, RotateMode } from "./layoutEditing";
import { angleFromPoints, roundTo, snapToGrid } from "./layoutEditing";

/** Pixels of movement required before a drag operation starts */
const DRAG_THRESHOLD_PX = 5;

/** Rotation snapping increment in degrees */
const ROTATION_SNAP_DEGREES = 15;

/**
 * State interface for layout editing drag operations
 */
export interface LayoutEditDragState {
  c2v: (clientX: number, clientY: number) => { x: number; y: number };
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
  keys: Accessor<GraphicsKey[]>;
  context: WizardContextType;
  tool: Accessor<LayoutEditTool>;
  rotateMode: Accessor<RotateMode>;
  setIsDragging: Setter<boolean>;
  setDragPreview: Setter<DragPreview | null>;
}

/**
 * Visual preview of a drag operation
 */
export interface DragPreview {
  type: "move" | "rotate" | "resize";
  /** Original key positions before drag */
  originalKeys: Map<string, { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }>;
  /** Current drag offset or transformation */
  delta: { x: number; y: number } | { angle: number; anchor: Point } | { dw: number; dh: number };
  /** Helper lines to display */
  helperLines?: HelperLine[];
  /** Snap indicators */
  snapPoints?: Point[];
}

/**
 * Helper line for visual guidance
 */
export interface HelperLine {
  type: "horizontal" | "vertical" | "rotation-guide" | "anchor";
  start: Point;
  end: Point;
  color?: string;
}

/**
 * Create event handlers for layout editing drag operations
 */
export function createLayoutEditEventHandlers(state: LayoutEditDragState): {
  onMouseDown: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseMove: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseUp: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onTouchStart: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchMove: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchEnd: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  reset: () => void;
} {
  let dragStart: {
    clientX: number;
    clientY: number;
    virtualPos: Point;
    tool: LayoutEditTool;
    handleType: string; // "move", "resize", "rotate-center", "rotate-anchor"
    selectedKeyIds: string[];
    originalKeys: Map<string, { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }>;
    rotateAnchor?: Point;
  } | null = null;

  /**
   * Get the virtual position with bounding box offset
   */
  const getVirtualPosWithOffset = (clientX: number, clientY: number): Point => {
    const vPos = state.c2v(clientX, clientY);
    const bbox = state.contentBbox();
    return {
      x: vPos.x + bbox.min.x + bbox.width / 2,
      y: vPos.y + bbox.min.y + bbox.height / 2,
    };
  };

  /**
   * Store original key states for the drag operation
   */
  const captureOriginalKeys = (keyIds: string[]): Map<string, { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }> => {
    const map = new Map();
    const layout = state.context.keyboard.layout;
    for (const id of keyIds) {
      const k = layout.find(key => key.id === id);
      if (k) {
        map.set(id, { x: k.x, y: k.y, w: k.w, h: k.h, r: k.r, rx: k.rx, ry: k.ry });
      }
    }
    return map;
  };

  /**
   * Calculate rotation anchor point for anchor mode
   */
  const calculateRotationAnchor = (keyIds: string[]): Point => {
    const layout = state.context.keyboard.layout;
    const keys = keyIds.map(id => layout.find(k => k.id === id)).filter((k): k is Key => k !== undefined);

    if (keys.length === 0) return { x: 0, y: 0 };

    if (keys.length === 1) {
      const k = keys[0];
      // Use existing anchor if set, otherwise key center
      if (k.rx !== 0 || k.ry !== 0) {
        return { x: k.rx * 70, y: k.ry * 70 }; // Convert to pixels
      }
      const center = keyCenter(k);
      return center;
    }

    // For multiple keys, use the center of the selection
    let sumX = 0, sumY = 0;
    for (const k of keys) {
      const center = keyCenter(k);
      sumX += center.x;
      sumY += center.y;
    }
    return { x: sumX / keys.length, y: sumY / keys.length };
  };

  /**
   * Apply move transformation during drag
   */
  const applyMoveTransform = (dx: number, dy: number, snap: boolean) => {
    if (!dragStart) return;

    // Convert pixel delta to units
    let deltaX = dx / 70;
    let deltaY = dy / 70;

    if (snap) {
      deltaX = snapToGrid(deltaX);
      deltaY = snapToGrid(deltaY);
    }

    state.context.setKeyboard("layout", produce(layout => {
      for (const [id, original] of dragStart!.originalKeys) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        k.x = roundTo(original.x + deltaX);
        k.y = roundTo(original.y + deltaY);
        // Also move rotation anchor if it's set
        if (original.rx !== 0) k.rx = roundTo(original.rx + deltaX);
        if (original.ry !== 0) k.ry = roundTo(original.ry + deltaY);
      }
    }));
  };

  /**
   * Apply rotation transformation during drag
   */
  const applyRotateTransform = (currentPos: Point, snap: boolean) => {
    if (!dragStart || !dragStart.rotateAnchor) return;

    const rotateMode = state.rotateMode();
    const anchor = dragStart.rotateAnchor;

    state.context.setKeyboard("layout", produce(layout => {
      for (const [id, original] of dragStart!.originalKeys) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        if (rotateMode === "center") {
          // Rotate around each key's own center
          const keyCenter = { x: (original.x + original.w / 2) * 70, y: (original.y + original.h / 2) * 70 };
          const startAngle = angleFromPoints(keyCenter, dragStart!.virtualPos);
          const currentAngle = angleFromPoints(keyCenter, currentPos);
          let deltaAngle = currentAngle - startAngle;

          if (snap) {
            deltaAngle = Math.round(deltaAngle / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
          }

          k.r = roundTo(original.r + deltaAngle);
          // Set rotation origin to key center
          k.rx = 0;
          k.ry = 0;
        } else {
          // Rotate around common anchor point
          const startAngle = angleFromPoints(anchor, dragStart!.virtualPos);
          const currentAngle = angleFromPoints(anchor, currentPos);
          let deltaAngle = currentAngle - startAngle;

          if (snap) {
            deltaAngle = Math.round(deltaAngle / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES;
          }

          // Calculate new position by rotating key center around anchor
          const keyCenter = { x: (original.x + original.w / 2) * 70, y: (original.y + original.h / 2) * 70 };
          const dx = keyCenter.x - anchor.x;
          const dy = keyCenter.y - anchor.y;
          const rad = deltaAngle * Math.PI / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const newCenterX = anchor.x + dx * cos - dy * sin;
          const newCenterY = anchor.y + dx * sin + dy * cos;

          // Update key position (convert from center to top-left)
          k.x = roundTo((newCenterX - original.w * 70 / 2) / 70);
          k.y = roundTo((newCenterY - original.h * 70 / 2) / 70);

          // Update rotation
          k.r = roundTo(original.r + deltaAngle);

          // Set rotation origin to the anchor point
          k.rx = roundTo(anchor.x / 70);
          k.ry = roundTo(anchor.y / 70);
        }
      }
    }));
  };

  /**
   * Apply resize transformation during drag
   */
  const applyResizeTransform = (dx: number, dy: number, snap: boolean) => {
    if (!dragStart) return;

    // Convert pixel delta to units
    let deltaW = dx / 70;
    let deltaH = dy / 70;

    if (snap) {
      deltaW = snapToGrid(deltaW);
      deltaH = snapToGrid(deltaH);
    }

    state.context.setKeyboard("layout", produce(layout => {
      for (const [id, original] of dragStart!.originalKeys) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        const newW = Math.max(0.25, roundTo(original.w + deltaW));
        const newH = Math.max(0.25, roundTo(original.h + deltaH));
        k.w = newW;
        k.h = newH;
      }
    }));
  };

  /**
   * Start drag operation - only if clicking on a handle
   */
  const startDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    const tool = state.tool();
    if (tool === "select") return; // Select tool doesn't use this handler

    // Check if we clicked on a handle element
    const handleElement = (target as HTMLElement | SVGElement)?.closest?.("[data-handle]");
    if (!handleElement) return; // Only start drag if clicking on a handle

    const handleType = handleElement.getAttribute("data-handle");
    const handleKeyId = handleElement.getAttribute("data-key-id");
    if (!handleType) return;

    const virtualPos = getVirtualPosWithOffset(clientX, clientY);
    let selectedKeys = state.context.nav.selectedKeys;

    // If handle is for a specific key that's not selected, select it
    if (handleKeyId && !selectedKeys.includes(handleKeyId)) {
      selectedKeys = [handleKeyId];
      state.context.setNav("selectedKeys", selectedKeys);
    }

    if (selectedKeys.length === 0) return;

    const originalKeys = captureOriginalKeys(selectedKeys);
    const rotateAnchor = tool === "rotate" ? calculateRotationAnchor(selectedKeys) : undefined;

    dragStart = {
      clientX,
      clientY,
      virtualPos,
      tool,
      handleType,
      selectedKeyIds: selectedKeys,
      originalKeys,
      rotateAnchor,
    };
  };

  /**
   * Continue drag operation
   */
  const continueDrag = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!dragStart) return;

    const dx = clientX - dragStart.clientX;
    const dy = clientY - dragStart.clientY;

    // Check if we've moved enough to start dragging
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
      return;
    }

    state.setIsDragging(true);

    const snap = !shiftKey; // Hold shift to disable snapping
    const currentPos = getVirtualPosWithOffset(clientX, clientY);

    switch (dragStart.tool) {
      case "move":
        applyMoveTransform(currentPos.x - dragStart.virtualPos.x, currentPos.y - dragStart.virtualPos.y, snap);
        break;
      case "rotate":
        applyRotateTransform(currentPos, snap);
        break;
      case "resize":
        applyResizeTransform(currentPos.x - dragStart.virtualPos.x, currentPos.y - dragStart.virtualPos.y, snap);
        break;
    }
  };

  /**
   * End drag operation
   */
  const endDrag = () => {
    if (dragStart) {
      normalizeKeys(state.context);
    }
    dragStart = null;
    state.setIsDragging(false);
    state.setDragPreview(null);
  };

  return {
    onMouseDown: (e) => {
      // Don't handle if clicking on a control
      const target = e.target as HTMLElement;
      if (target.closest("[data-controls]")) return;

      // Only start drag if clicking on a handle
      startDrag(e.clientX, e.clientY, e.target);
      if (dragStart) {
        e.preventDefault();
      }
    },

    onMouseMove: (e) => {
      if (!dragStart) return;
      e.preventDefault();
      continueDrag(e.clientX, e.clientY, e.shiftKey);
    },

    onMouseUp: (e) => {
      if (!dragStart) return;
      e.preventDefault();
      endDrag();
    },

    onTouchStart: (e) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-controls]")) return;

      // Only start drag if touching a handle
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
      if (dragStart) {
        e.preventDefault();
      }
    },

    onTouchMove: (e) => {
      if (!dragStart || e.touches.length !== 1) return;
      e.preventDefault();
      continueDrag(e.touches[0].clientX, e.touches[0].clientY, false);
    },

    onTouchEnd: () => {
      endDrag();
    },

    reset: () => {
      endDrag();
    },
  };
}
