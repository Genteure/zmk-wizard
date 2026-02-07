/**
 * Rotate mode event handlers for the graphics component.
 * 
 * In Rotate mode:
 * - Click and drag on rotation handles to rotate selected keys
 * - Click and drag anywhere else to box select keys
 * 
 * Rotation sub-modes:
 * - Center: Rotate around key's own center (or rx,ry if set)
 * - Anchor: Rotate around anchor point, key points away from it
 */

import { produce } from "solid-js/store";
import { keyToPolygon, polygonsIntersectSAT } from "~/lib/geometry";
import {
  applyAnchorRotation,
  getKeyRotatedCenter,
  moveAnchorKeepingOriginalPosition,
  moveAnchorWithoutAffectingPosition,
  rotatePoint,
} from "~/lib/keyRotation";
import type { Point } from "~/typedef";
import { normalizeKeys } from "../context";
import { roundTo, snapToGrid, type LayoutEditState } from "./editState";
import type { GraphicState, InteractionEventHandlers, SelectionOverlay } from "./types";

/** Pixels of movement required before a drag operation starts */
const DRAG_THRESHOLD_PX = 5;

/** Pixels per unit (1U = 70px) */
const KEY_SIZE = 70;

interface RotateModeDragState {
  type: "rotate-ring" | "rotate-anchor" | "rotate-common" | "box-select";
  startClientX: number;
  startClientY: number;
  startVirtualPos: Point;
  // For rotation: original key states
  originalKeys?: Map<string, { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }>;
  // For box select: selection overlay
  overlay?: SelectionOverlay;
}

/**
 * Calculate angle from a point to another point in degrees
 */
function angleFromPoints(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Create event handlers for Rotate mode
 */
export function createRotateModeHandlers(
  state: GraphicState,
  editState: LayoutEditState,
  setIsDragging: (isDragging: boolean) => void,
): InteractionEventHandlers {
  let drag: RotateModeDragState | null = null;

  const getVirtualPosWithOffset = (clientX: number, clientY: number): Point => {
    const vPos = state.c2v(clientX, clientY);
    const bbox = state.contentBbox();
    return {
      x: vPos.x + bbox.min.x + bbox.width / 2,
      y: vPos.y + bbox.min.y + bbox.height / 2,
    };
  };

  const captureOriginalKeys = (keyIds: string[]) => {
    const map = new Map<string, { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }>();
    const layout = state.context.keyboard.layout;
    for (const id of keyIds) {
      const k = layout.find(key => key.id === id);
      if (k) {
        map.set(id, { x: k.x, y: k.y, w: k.w, h: k.h, r: k.r, rx: k.rx, ry: k.ry });
      }
    }
    return map;
  };

  const applyRotation = (currentPos: Point, snap: boolean) => {
    if (!drag || !drag.originalKeys) return;

    const rotateSubMode = editState.rotateSubMode();

    state.context.setKeyboard("layout", produce(layout => {
      // Common center rotation for multiple keys
      if (drag!.type === "rotate-common" && rotateSubMode === "center") {
        const selectedKeys = [...drag!.originalKeys!.values()];
        
        // Calculate common center (visual center of all keys)
        let sumX = 0, sumY = 0;
        for (const orig of selectedKeys) {
          const rotatedCenter = getKeyRotatedCenter(orig);
          sumX += rotatedCenter.x;
          sumY += rotatedCenter.y;
        }
        const commonCenterUnit = {
          x: sumX / selectedKeys.length,
          y: sumY / selectedKeys.length
        };
        const commonCenterPx = {
          x: commonCenterUnit.x * KEY_SIZE,
          y: commonCenterUnit.y * KEY_SIZE
        };

        // Calculate rotation delta
        const startAngle = angleFromPoints(commonCenterPx, drag!.startVirtualPos);
        const currentAngle = angleFromPoints(commonCenterPx, currentPos);
        let deltaAngle = currentAngle - startAngle;

        if (snap) {
          const rotateSnap = editState.snapSettings().rotateSnap;
          deltaAngle = Math.round(deltaAngle / rotateSnap) * rotateSnap;
        }

        // Apply rotation to each key around the common center
        for (const [id, original] of drag!.originalKeys!) {
          const k = layout.find(key => key.id === id);
          if (!k) continue;

          const originalRotatedCenter = getKeyRotatedCenter(original);
          const newRotatedCenterUnit = rotatePoint(originalRotatedCenter, commonCenterUnit, deltaAngle);
          const newR = original.r + deltaAngle;
          const newX = newRotatedCenterUnit.x - original.w / 2;
          const newY = newRotatedCenterUnit.y - original.h / 2;
          const newRx = newX + original.w / 2;
          const newRy = newY + original.h / 2;

          k.x = roundTo(newX);
          k.y = roundTo(newY);
          k.r = roundTo(newR);
          k.rx = roundTo(newRx);
          k.ry = roundTo(newRy);
        }
        return;
      }

      // Individual key rotation
      for (const [id, original] of drag!.originalKeys!) {
        const k = layout.find(key => key.id === id);
        if (!k) continue;

        if (rotateSubMode === "center") {
          if (drag!.type === "rotate-anchor") {
            // Dragging anchor in center mode
            let newAnchorX = currentPos.x / KEY_SIZE;
            let newAnchorY = currentPos.y / KEY_SIZE;

            if (snap) {
              const snapSize = editState.snapSettings().moveSnap;
              newAnchorX = snapToGrid(newAnchorX, snapSize);
              newAnchorY = snapToGrid(newAnchorY, snapSize);
            }

            const newAnchor = { x: newAnchorX, y: newAnchorY };
            const anchorMoveMode = editState.centerAnchorMoveMode();
            const result = anchorMoveMode === "final"
              ? moveAnchorWithoutAffectingPosition(original, newAnchor)
              : moveAnchorKeepingOriginalPosition(original, newAnchor);

            k.x = result.x;
            k.y = result.y;
            k.r = result.r;
            k.rx = result.rx;
            k.ry = result.ry;
          } else {
            // Dragging rotation ring
            const rotationOriginUnit = (original.rx !== 0 || original.ry !== 0)
              ? { x: original.rx, y: original.ry }
              : { x: original.x + original.w / 2, y: original.y + original.h / 2 };

            const rotationOriginPx = {
              x: rotationOriginUnit.x * KEY_SIZE,
              y: rotationOriginUnit.y * KEY_SIZE
            };

            const startAngle = angleFromPoints(rotationOriginPx, drag!.startVirtualPos);
            const currentAngle = angleFromPoints(rotationOriginPx, currentPos);
            let deltaAngle = currentAngle - startAngle;

            if (snap) {
              const rotateSnap = editState.snapSettings().rotateSnap;
              deltaAngle = Math.round(deltaAngle / rotateSnap) * rotateSnap;
            }

            if (original.rx === 0 && original.ry === 0) {
              // No anchor set, rotate around key center
              const keyCenterUnit = { x: original.x + original.w / 2, y: original.y + original.h / 2 };
              k.r = roundTo(original.r + deltaAngle);
              k.rx = roundTo(keyCenterUnit.x);
              k.ry = roundTo(keyCenterUnit.y);
            } else {
              // Rotate around existing anchor
              const keyCenterUnit = { x: original.x + original.w / 2, y: original.y + original.h / 2 };
              const newKeyCenterUnit = rotatePoint(keyCenterUnit, rotationOriginUnit, deltaAngle);

              k.x = roundTo(newKeyCenterUnit.x - original.w / 2);
              k.y = roundTo(newKeyCenterUnit.y - original.h / 2);
              k.r = roundTo(original.r + deltaAngle);
              k.rx = original.rx;
              k.ry = original.ry;
            }
          }
        } else {
          // Anchor mode
          if (drag!.type === "rotate-anchor") {
            // Dragging anchor in anchor mode
            let newAnchorX = currentPos.x / KEY_SIZE;
            let newAnchorY = currentPos.y / KEY_SIZE;

            if (snap) {
              const snapSize = editState.snapSettings().moveSnap;
              newAnchorX = snapToGrid(newAnchorX, snapSize);
              newAnchorY = snapToGrid(newAnchorY, snapSize);
            }

            const newAnchor = { x: newAnchorX, y: newAnchorY };
            const result = applyAnchorRotation(original, newAnchor);
            k.x = result.x;
            k.y = result.y;
            k.r = result.r;
            k.rx = result.rx;
            k.ry = result.ry;
          } else {
            // Dragging rotation ring in anchor mode
            const anchorPx = {
              x: (original.rx || original.x) * KEY_SIZE,
              y: (original.ry || original.y) * KEY_SIZE
            };

            const startAngle = angleFromPoints(anchorPx, drag!.startVirtualPos);
            const currentAngle = angleFromPoints(anchorPx, currentPos);
            let deltaAngle = currentAngle - startAngle;

            if (snap) {
              const rotateSnap = editState.snapSettings().rotateSnap;
              deltaAngle = Math.round(deltaAngle / rotateSnap) * rotateSnap;
            }

            const rotatedCenter = getKeyRotatedCenter(original);
            const anchorUnit = { x: original.rx || original.x, y: original.ry || original.y };
            const newCenter = rotatePoint(rotatedCenter, anchorUnit, deltaAngle);
            const newR = original.r + deltaAngle;
            const unrotatedCenter = rotatePoint(newCenter, anchorUnit, -newR);

            k.x = roundTo(unrotatedCenter.x - original.w / 2);
            k.y = roundTo(unrotatedCenter.y - original.h / 2);
            k.r = roundTo(newR);
            k.rx = original.rx;
            k.ry = original.ry;
          }
        }
      }
    }));
  };

  const startDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    const virtualPos = getVirtualPosWithOffset(clientX, clientY);

    // Check if we clicked on a handle
    const handleElement = (target as HTMLElement | SVGElement)?.closest?.("[data-handle]");
    const handleType = handleElement?.getAttribute("data-handle");
    const handleKeyId = handleElement?.getAttribute("data-key-id");

    if (handleType?.startsWith("rotate-")) {
      // Start rotation drag
      let selectedKeys = state.context.nav.selectedKeys;

      // If handle is for a key that's not selected, select only that key
      if (handleKeyId && !selectedKeys.includes(handleKeyId)) {
        selectedKeys = [handleKeyId];
        state.context.setNav("selectedKeys", selectedKeys);
      }

      if (selectedKeys.length === 0) return;

      const type = handleType === "rotate-anchor" ? "rotate-anchor" 
        : handleType === "rotate-center-common" ? "rotate-common" 
        : "rotate-ring";

      drag = {
        type,
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

    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
      return;
    }

    setIsDragging(true);
    const snap = !shiftKey;

    if (drag.type === "box-select") {
      const virtualPos = state.c2v(clientX, clientY);
      state.setOverlay(p => {
        if (!p) return null;
        return { start: p.start, end: virtualPos };
      });
    } else {
      const currentPos = getVirtualPosWithOffset(clientX, clientY);
      applyRotation(currentPos, snap);
    }
  };

  const endDrag = (shiftKey: boolean, altKey: boolean) => {
    if (!drag) return;

    if (drag.type !== "box-select") {
      normalizeKeys(state.context);
    } else {
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
          state.context.nav.selectedKeys.forEach(k => {
            if (!selectedKeys.includes(k)) {
              selectedKeys.push(k);
            }
          });
        } else if (altKey) {
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
      endDrag(e.shiftKey, e.altKey);
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
      endDrag(false, false);
    },

    reset: () => {
      drag = null;
      setIsDragging(false);
      state.setOverlay(null);
    },
  };
}
