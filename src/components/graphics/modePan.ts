import type { GraphicState, InteractionEventHandlers } from "./types";


export function createPanEventHandlers(states: GraphicState): InteractionEventHandlers {
  let panStart: {
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
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
      };
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
}
