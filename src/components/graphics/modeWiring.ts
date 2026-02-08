import { keyToPolygon, pointInPolygon } from "~/lib/geometry";
import type { Point } from "~/typedef";
import type { GraphicState, InteractionEventHandlers } from "./types";


export function createWiringEventHandlers(states: GraphicState): InteractionEventHandlers {
  // Wiring handlers: track drag state via GraphicState and trigger hovered keys once per drag
  let triggeredDuringDrag: Set<string> = new Set();
  let pendingDragStart: { startX: number; startY: number; startedOnButton: boolean; } | null = null;
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
}
