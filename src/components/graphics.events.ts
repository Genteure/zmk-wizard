import type { Accessor, JSX, Setter } from "solid-js";
import { produce } from "solid-js/store";
import { keyToPolygon, pointInPolygon, polygonsIntersectSAT, type Point } from "~/lib/geometry";
import type { WizardContextType } from "./context";
import type { GraphicsKey } from "./graphics";

export interface InteractionEventHandlers {
  onMouseDown: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseMove: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseUp: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onTouchStart: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchMove: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchEnd: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  reset: () => void;
}

export interface TransformValues {
  s: number;
  x: number;
  y: number;
}

export interface SelectionOverlay {
  start: Point;
  end: Point | null;
}

export interface GraphicState {
  c2v: (clientX: number, clientY: number) => { x: number; y: number; };
  contentBbox: () => { min: { x: number; y: number; }; width: number; height: number; };
  keys: Accessor<GraphicsKey[]>,
  context: WizardContextType,
  onKeySetWiring?: ((key: GraphicsKey) => void) | undefined;

  setAutoZoom: Setter<boolean>;
  transform: Accessor<TransformValues>;
  setTransform: Setter<TransformValues>;
  overlay: Accessor<SelectionOverlay | null>;
  setOverlay: Setter<SelectionOverlay | null>;
  setIsPanning: Setter<boolean>;
  isWiringDragging: Accessor<boolean>;
  setIsWiringDragging: Setter<boolean>;
}

export function createPanEventHandlers(states: GraphicState): InteractionEventHandlers {
  let panStart: {
    clientX: number,
    clientY: number,
    offsetX: number,
    offsetY: number,
  } | null = null;
  let pinchStartDistance: number | null = null;
  let pinchStartTransform = { s: 1, x: 0, y: 0 };
  let pinchStartCenter = { x: 0, y: 0 };

  const handlers: InteractionEventHandlers = {
    onMouseDown: (e) => {
      e.preventDefault();
      panStart = {
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: states.transform().x,
        offsetY: states.transform().y,
      }
      states.setIsPanning(true);
    },
    onMouseMove: (e) => {
      if (panStart) {
        // Continue pan
        e.preventDefault();
        states.setAutoZoom(false);
        const deltaX = e.clientX - panStart.clientX;
        const deltaY = e.clientY - panStart.clientY;
        states.setTransform(t => ({
          s: t.s,
          x: panStart!.offsetX + deltaX / t.s,
          y: panStart!.offsetY + deltaY / t.s,
        }));
      }
    },
    onMouseUp: (e) => {
      if (panStart) {
        // End pan
        e.preventDefault();
        panStart = null;
        states.setIsPanning(false);
      }
    },
    onTouchStart: (e) => {
      const touches = e.touches;
      if (touches.length === 1) {
        e.preventDefault();
        panStart = {
          clientX: touches[0].clientX,
          clientY: touches[0].clientY,
          offsetX: states.transform().x,
          offsetY: states.transform().y,
        };
        states.setIsPanning(true);
      } else if (touches.length === 2) {
        e.preventDefault();
        const touch1 = touches[0];
        const touch2 = touches[1];

        pinchStartDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        pinchStartTransform = states.transform();
        pinchStartCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
        states.setIsPanning(false);
      }
    },
    onTouchMove: (e) => {
      const touches = e.touches;

      if (touches.length === 1 && panStart) {
        e.preventDefault();
        states.setAutoZoom(false);
        const deltaX = touches[0].clientX - panStart.clientX;
        const deltaY = touches[0].clientY - panStart.clientY;
        states.setTransform(t => ({
          s: t.s,
          x: panStart!.offsetX + deltaX / t.s,
          y: panStart!.offsetY + deltaY / t.s,
        }));
        states.setIsPanning(true);
      } else if (touches.length === 2 && pinchStartDistance !== null) {
        e.preventDefault();
        states.setAutoZoom(false);
        states.setIsPanning(false);

        const touch1 = touches[0];
        const touch2 = touches[1];

        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        const newScale = pinchStartTransform.s * currentDistance / pinchStartDistance;
        if (newScale < 0.2 || newScale > 5) return;

        const rect = e.currentTarget.getBoundingClientRect();

        const touchCurrentCenterX = (touch1.clientX + touch2.clientX) / 2;
        const touchCurrentCenterY = (touch1.clientY + touch2.clientY) / 2;

        const adjustedPinchStartX = pinchStartCenter.x - rect.left - (rect.width / 2);
        const adjustedPinchStartY = pinchStartCenter.y - rect.top - (rect.height / 2);

        const deltaCenterX = touchCurrentCenterX - pinchStartCenter.x;
        const deltaCenterY = touchCurrentCenterY - pinchStartCenter.y;

        const pointX = adjustedPinchStartX / pinchStartTransform.s - pinchStartTransform.x;
        const pointY = adjustedPinchStartY / pinchStartTransform.s - pinchStartTransform.y;
        const newX = adjustedPinchStartX / newScale - pointX + deltaCenterX / newScale;
        const newY = adjustedPinchStartY / newScale - pointY + deltaCenterY / newScale;

        states.setTransform({
          s: newScale,
          x: newX,
          y: newY
        });
      }
    },
    onTouchEnd: (e) => {
      const touches = e.touches;
      if (touches.length === 0) {
        panStart = null;
        pinchStartDistance = null;
        states.setIsPanning(false);
      } else if (touches.length === 1) {
        pinchStartDistance = null;
        panStart = {
          clientX: touches[0].clientX,
          clientY: touches[0].clientY,
          offsetX: states.transform().x,
          offsetY: states.transform().y,
        };
        states.setIsPanning(true);
      }
    },
    reset: () => {
      panStart = null;
      pinchStartDistance = null;
      states.setIsPanning?.(false);
    }
  };
  return handlers;
};

export function createDragSelectEventHandlers(states: GraphicState): InteractionEventHandlers {
  /**
   * false: not dragging
   * Point: pending, start position of drag
   * true: dragging in progress
   */
  let touchDragSelect: boolean | Point = false;

  const selectKeyAtVirtualPosition = (pos: Point) => {
    const { context, keys, contentBbox } = states;
    const bbox = contentBbox();
    const withOffsetX = pos.x + bbox.min.x + bbox.width / 2;
    const withOffsetY = pos.y + bbox.min.y + bbox.height / 2;

    context.setNav("selectedKeys", produce((selectedKeys) => {
      keys().forEach(k => {
        if (context.nav.activeEditPart !== null && context.nav.activeEditPart !== k.part) return;

        const polygon = keyToPolygon(k);
        if (pointInPolygon(polygon, withOffsetX, withOffsetY)) {
          if (!context.nav.selectedKeys.includes(k.key.id)) {
            selectedKeys.push(k.key.id);
          }
        }
      })
    }));
  }

  const handlers: InteractionEventHandlers = {
    onMouseDown: (e) => {
      e.preventDefault();
      const virtualPos = states.c2v(e.clientX, e.clientY);
      states.setOverlay({ start: virtualPos, end: null });
    },

    onMouseMove: (e) => {
      if (states.overlay()) {
        // Update selection in edit mode
        e.preventDefault();
        states.setOverlay(p => {
          if (e.buttons === 0 || !p) {
            // If no buttons are pressed, cancel selection
            return null;
          }

          const virtualPos = states.c2v(e.clientX, e.clientY);

          if (!p.end) {
            const distance = Math.hypot(
              virtualPos.x - p.start.x,
              virtualPos.y - p.start.y
            );
            if (distance < 20) {
              // If mouse hasn't moved enough, don't update selection
              return p;
            }
          }

          return {
            start: p.start,
            end: virtualPos
          };
        });
      }
    },

    onMouseUp: (e) => {
      const dragPos = states.overlay();
      if (!dragPos) {
        return;
      }
      const { start, end } = dragPos;
      if (!end) {
        states.setOverlay(null);
        return;
      }

      e.preventDefault();

      const bbox = states.contentBbox();
      const offsetX = bbox.min.x + bbox.width / 2;
      const offsetY = bbox.min.y + bbox.height / 2;
      const selectionPolygon = [
        { x: offsetX + start.x, y: offsetY + start.y },
        { x: offsetX + end.x, y: offsetY + start.y },
        { x: offsetX + end.x, y: offsetY + end.y },
        { x: offsetX + start.x, y: offsetY + end.y }
      ]

      const selectedKeys: string[] = []
      states.keys().forEach(key => {
        if (states.context.nav.activeEditPart !== null && states.context.nav.activeEditPart !== key.part) return;

        const keyPolygon = keyToPolygon(key)
        if (polygonsIntersectSAT(keyPolygon, selectionPolygon)) {
          selectedKeys.push(key.key.id);
        }
      });

      if (e.shiftKey) {
        // Add to existing selection
        states.context.nav.selectedKeys.forEach(k => {
          if (!selectedKeys.includes(k)) {
            selectedKeys.push(k);
          }
        })
      } else if (e.altKey) {
        // Merge with existing selection, toggling existing keys
        states.context.nav.selectedKeys.forEach(k => {
          if (selectedKeys.includes(k)) {
            selectedKeys.splice(selectedKeys.indexOf(k), 1);
          } else {
            selectedKeys.push(k);
          }
        })
      }

      states.context.setNav("selectedKeys", selectedKeys);

      states.setOverlay(null);
    },

    onTouchStart: (e) => {
      const touches = e.touches;
      if (touchDragSelect === false && touches.length === 1) {
        e.preventDefault();
        const virtualPos = states.c2v(touches[0].clientX, touches[0].clientY);
        touchDragSelect = virtualPos;
      }
    },

    onTouchMove: (e) => {
      const touches = e.touches;
      const { c2v, context } = states;
      if (touchDragSelect) {
        if (touches.length !== 1) {
          touchDragSelect = false;
          return;
        }
        e.preventDefault();

        const virtualPos = c2v(touches[0].clientX, touches[0].clientY);

        if (touchDragSelect === true) {
          // Dragging in progress
          // Add key under finger to selection
          selectKeyAtVirtualPosition(virtualPos);
        } else {
          // Pending, check movement threshold
          const distance = Math.hypot(
            virtualPos.x - touchDragSelect.x,
            virtualPos.y - touchDragSelect.y
          );
          if (distance < 20) {
            // If finger hasn't moved enough, don't start selection
            return;
          }

          // Clear existing selection and start new selection
          context.setNav("selectedKeys", []);
          selectKeyAtVirtualPosition(touchDragSelect);
          selectKeyAtVirtualPosition(virtualPos);
          touchDragSelect = true;
        }
      }
    },

    onTouchEnd: (_e) => {
      touchDragSelect = false;
    },

    reset: () => {
      states.setOverlay(null);
      touchDragSelect = false;
    },
  };
  return handlers;
};

export function createWiringEventHandlers(states: GraphicState): InteractionEventHandlers {
  // Wiring handlers: track drag state via GraphicState and trigger hovered keys once per drag
  let triggeredDuringDrag: Set<string> = new Set();
  let pendingDragStart: { startX: number; startY: number; startedOnButton: boolean } | null = null;
  const dragThreshold = 6; // px before turning a press into a drag

  const toPos = (clientX: number, clientY: number) => states.c2v(clientX, clientY);

  const triggerKeyAtVirtualPosition = (pos: Point) => {
    const bbox = states.contentBbox();
    const withOffsetX = pos.x + bbox.min.x + bbox.width / 2;
    const withOffsetY = pos.y + bbox.min.y + bbox.height / 2;

    for (const k of states.keys()) {
      if (states.context.nav.activeEditPart !== null && states.context.nav.activeEditPart !== k.part) continue;
      if (triggeredDuringDrag.has(k.key.id)) continue;

      const polygon = keyToPolygon(k);
      if (pointInPolygon(polygon, withOffsetX, withOffsetY)) {
        states.onKeySetWiring?.(k);
        triggeredDuringDrag.add(k.key.id);
        break; // only one key per pointer position
      }
    }
  };

  const handlers: InteractionEventHandlers = {
    onMouseDown: (e) => {
      // Allow button clicks to propagate; otherwise start pending drag
      const target = e.target as HTMLElement | null;
      const isButton = !!target?.closest("button");
      if (!isButton) {
        e.preventDefault();
      }
      pendingDragStart = { startX: e.clientX, startY: e.clientY, startedOnButton: isButton };
      triggeredDuringDrag.clear();
    },
    onMouseMove: (e) => {
      // If not dragging yet, check threshold
      if (!states.isWiringDragging()) {
        if (!pendingDragStart) return;
        const distance = Math.hypot(
          e.clientX - pendingDragStart.startX,
          e.clientY - pendingDragStart.startY
        );
        if (distance < dragThreshold) return;
        // Switch to dragging
        states.setIsWiringDragging(true);
      }
      e.preventDefault();
      const p = toPos(e.clientX, e.clientY);
      triggerKeyAtVirtualPosition(p);
    },
    onMouseUp: (e) => {
      if (!states.isWiringDragging()) {
        // No drag occurred; allow click if it was on a button
        pendingDragStart = null;
        return;
      }
      // Drag ended: prevent default to avoid generating a click
      e.preventDefault();
      states.setIsWiringDragging(false);
      triggeredDuringDrag.clear();
      pendingDragStart = null;
    },
    onTouchStart: (e) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      const isButton = !!target?.closest("button");
      if (!isButton) {
        e.preventDefault();
      }
      const t = e.touches[0];
      pendingDragStart = { startX: t.clientX, startY: t.clientY, startedOnButton: isButton };
      triggeredDuringDrag.clear();
    },
    onTouchMove: (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!states.isWiringDragging()) {
        if (!pendingDragStart) return;
        const distance = Math.hypot(
          t.clientX - pendingDragStart.startX,
          t.clientY - pendingDragStart.startY
        );
        if (distance < dragThreshold) return;
        // Switch to dragging
        states.setIsWiringDragging(true);
      }
      e.preventDefault();
      const p = toPos(t.clientX, t.clientY);
      triggerKeyAtVirtualPosition(p);
    },
    onTouchEnd: (_e) => {
      if (!states.isWiringDragging()) {
        pendingDragStart = null;
        return;
      }
      states.setIsWiringDragging(false);
      triggeredDuringDrag.clear();
      pendingDragStart = null;
    },
    reset: () => {
      states.setIsWiringDragging(false);
      triggeredDuringDrag.clear();
      pendingDragStart = null;
    }
  };
  return handlers;
};
