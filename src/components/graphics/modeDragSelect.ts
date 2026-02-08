import { produce } from "solid-js/store";
import { keyToPolygon, pointInPolygon, polygonsIntersectSAT } from "~/lib/geometry";
import type { Point } from "~/typedef";
import type { GraphicState, InteractionEventHandlers } from "./types";


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
      });
    }));
  };

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
      ];

      const selectedKeys: string[] = [];
      states.keys().forEach(key => {
        if (states.context.nav.activeEditPart !== null && states.context.nav.activeEditPart !== key.part) return;

        const keyPolygon = keyToPolygon(key);
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
        });
      } else if (e.altKey) {
        // Merge with existing selection, toggling existing keys
        states.context.nav.selectedKeys.forEach(k => {
          if (selectedKeys.includes(k)) {
            selectedKeys.splice(selectedKeys.indexOf(k), 1);
          } else {
            selectedKeys.push(k);
          }
        });
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
}
