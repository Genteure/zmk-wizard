/**
 * Move mode event handlers for the graphics component.
 * 
 * In Move mode:
 * - Click and drag on move handle (key center) to move selected keys
 * - Click and drag on resize handle (bottom-right corner) to resize selected keys
 * - Click and drag anywhere else to box select keys
 */

import { produce } from "solid-js/store";
import { keyToPolygon, polygonsIntersectSAT } from "~/lib/geometry";
import type { Point } from "~/typedef";
import { normalizeKeys } from "../context";
import { roundTo, snapToGrid, type LayoutEditState } from "./editState";
import type { GraphicState, InteractionEventHandlers, SelectionOverlay } from "./types";

/** Pixels of movement required before a drag operation starts */
const DRAG_THRESHOLD_PX = 5;

/** Pixels per unit (1U = 70px) */
const KEY_SIZE = 70;

interface MoveModeDragState {
  type: "move" | "resize" | "box-select";
  startClientX: number;
  startClientY: number;
  startVirtualPos: Point;
  // For move/resize: original key states
  originalKeys?: Map<string, { x: number; y: number; w: number; h: number; rx: number; ry: number }>;
  // For box select: selection overlay
  overlay?: SelectionOverlay;
}

/**
 * Create event handlers for Move mode
 */
export function createMoveModeHandlers(
  state: GraphicState,
  editState: LayoutEditState,
  setIsDragging: (isDragging: boolean) => void,
): InteractionEventHandlers {
  let drag: MoveModeDragState | null = null;

  const getVirtualPosWithOffset = (clientX: number, clientY: number): Point => {
    const vPos = state.c2v(clientX, clientY);
    const bbox = state.contentBbox();
    return {
      x: vPos.x + bbox.min.x + bbox.width / 2,
      y: vPos.y + bbox.min.y + bbox.height / 2,
    };
  };

  const captureOriginalKeys = (keyIds: string[]) => {
    const map = new Map<string, { x: number; y: number; w: number; h: number; rx: number; ry: number }>();
    const layout = state.context.keyboard.layout;
    for (const id of keyIds) {
      const k = layout.find(key => key.id === id);
      if (k) {
        map.set(id, { x: k.x, y: k.y, w: k.w, h: k.h, rx: k.rx, ry: k.ry });
      }
    }
    return map;
  };

  const applyMove = (dx: number, dy: number, snap: boolean) => {
    if (!drag || drag.type !== "move" || !drag.originalKeys) return;

    let deltaX = dx / KEY_SIZE;
    let deltaY = dy / KEY_SIZE;

    if (snap) {
      const snapSize = editState.snapSettings().moveSnap;
      deltaX = snapToGrid(deltaX, snapSize);
      deltaY = snapToGrid(deltaY, snapSize);
    }

    state.context.setKeyboard("layout", produce(layout => {
      for (const [id, original] of drag!.originalKeys!) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        k.x = roundTo(original.x + deltaX);
        k.y = roundTo(original.y + deltaY);
        if (original.rx !== 0) k.rx = roundTo(original.rx + deltaX);
        if (original.ry !== 0) k.ry = roundTo(original.ry + deltaY);
      }
    }));
  };

  const applyResize = (dw: number, dh: number, snap: boolean) => {
    if (!drag || drag.type !== "resize" || !drag.originalKeys) return;

    let deltaW = dw / KEY_SIZE;
    let deltaH = dh / KEY_SIZE;

    if (snap) {
      const snapSize = editState.snapSettings().moveSnap;
      deltaW = snapToGrid(deltaW, snapSize);
      deltaH = snapToGrid(deltaH, snapSize);
    }

    state.context.setKeyboard("layout", produce(layout => {
      for (const [id, original] of drag!.originalKeys!) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        k.w = Math.max(0.25, roundTo(original.w + deltaW));
        k.h = Math.max(0.25, roundTo(original.h + deltaH));
      }
    }));
  };

  const startDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    const virtualPos = getVirtualPosWithOffset(clientX, clientY);

    // Check if we clicked on a handle
    const handleElement = (target as HTMLElement | SVGElement)?.closest?.("[data-handle]");
    const handleType = handleElement?.getAttribute("data-handle");
    const handleKeyId = handleElement?.getAttribute("data-key-id");

    if (handleType === "move" || handleType === "resize") {
      // Start move/resize drag
      let selectedKeys = state.context.nav.selectedKeys;

      // If handle is for a key that's not selected, select only that key
      if (handleKeyId && !selectedKeys.includes(handleKeyId)) {
        selectedKeys = [handleKeyId];
        state.context.setNav("selectedKeys", selectedKeys);
      }

      if (selectedKeys.length === 0) return;

      drag = {
        type: handleType,
        startClientX: clientX,
        startClientY: clientY,
        startVirtualPos: virtualPos,
        originalKeys: captureOriginalKeys(selectedKeys),
      };
    } else {
      // Start box selection
      const vPos = state.c2v(clientX, clientY);
      drag = {
        type: "box-select",
        startClientX: clientX,
        startClientY: clientY,
        startVirtualPos: virtualPos,
        overlay: { start: vPos, end: null },
      };
      state.setOverlay({ start: vPos, end: null });
    }
  };

  const continueDrag = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!drag) return;

    const dx = clientX - drag.startClientX;
    const dy = clientY - drag.startClientY;

    // Check threshold
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
      return;
    }

    setIsDragging(true);
    const snap = !shiftKey;

    if (drag.type === "move") {
      const currentPos = getVirtualPosWithOffset(clientX, clientY);
      applyMove(currentPos.x - drag.startVirtualPos.x, currentPos.y - drag.startVirtualPos.y, snap);
    } else if (drag.type === "resize") {
      const currentPos = getVirtualPosWithOffset(clientX, clientY);
      applyResize(currentPos.x - drag.startVirtualPos.x, currentPos.y - drag.startVirtualPos.y, snap);
    } else if (drag.type === "box-select") {
      const virtualPos = state.c2v(clientX, clientY);
      state.setOverlay(p => {
        if (!p) return null;
        return { start: p.start, end: virtualPos };
      });
    }
  };

  const endDrag = (_clientX: number, _clientY: number, shiftKey: boolean, altKey: boolean) => {
    if (!drag) return;

    if (drag.type === "move" || drag.type === "resize") {
      normalizeKeys(state.context);
    } else if (drag.type === "box-select") {
      // Finalize box selection
      const overlay = state.overlay();
      if (overlay?.end) {
        const bbox = state.contentBbox();
        const offsetX = bbox.min.x + bbox.width / 2;
        const offsetY = bbox.min.y + bbox.height / 2;
        const { start, end } = overlay;
        
        const selectionPolygon = [
          { x: offsetX + start.x, y: offsetY + start.y },
          { x: offsetX + end.x, y: offsetY + start.y },
          { x: offsetX + end.x, y: offsetY + end.y },
          { x: offsetX + start.x, y: offsetY + end.y }
        ];

        const selectedKeys: string[] = [];
        state.keys().forEach(key => {
          if (state.context.nav.activeEditPart !== null && state.context.nav.activeEditPart !== key.part) return;

          const keyPolygon = keyToPolygon(key);
          if (polygonsIntersectSAT(keyPolygon, selectionPolygon)) {
            selectedKeys.push(key.key.id);
          }
        });

        if (shiftKey) {
          // Add to existing selection
          state.context.nav.selectedKeys.forEach(k => {
            if (!selectedKeys.includes(k)) {
              selectedKeys.push(k);
            }
          });
        } else if (altKey) {
          // Toggle in existing selection
          state.context.nav.selectedKeys.forEach(k => {
            if (selectedKeys.includes(k)) {
              selectedKeys.splice(selectedKeys.indexOf(k), 1);
            } else {
              selectedKeys.push(k);
            }
          });
        }

        state.context.setNav("selectedKeys", selectedKeys);
      }
      state.setOverlay(null);
    }

    drag = null;
    setIsDragging(false);
  };

  return {
    onMouseDown: (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-controls]")) return;

      e.preventDefault();
      startDrag(e.clientX, e.clientY, e.target);
    },

    onMouseMove: (e) => {
      if (!drag) return;
      e.preventDefault();
      continueDrag(e.clientX, e.clientY, e.shiftKey);
    },

    onMouseUp: (e) => {
      if (!drag) return;
      e.preventDefault();
      endDrag(e.clientX, e.clientY, e.shiftKey, e.altKey);
    },

    onTouchStart: (e) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-controls]")) return;

      e.preventDefault();
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },

    onTouchMove: (e) => {
      if (!drag || e.touches.length !== 1) return;
      e.preventDefault();
      continueDrag(e.touches[0].clientX, e.touches[0].clientY, false);
    },

    onTouchEnd: () => {
      if (!drag) return;
      endDrag(drag.startClientX, drag.startClientY, false, false);
    },

    reset: () => {
      drag = null;
      setIsDragging(false);
      state.setOverlay(null);
    },
  };
}
