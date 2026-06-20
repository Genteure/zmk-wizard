import type { ComputedRef, Ref } from 'vue';
import { computed, reactive, ref } from 'vue';
import type { CanvasTool } from '~/types/tools';

const ZOOM_FACTOR = 1.23;
const ZOOM_MIN = 0.04;
const ZOOM_MAX = 25;
const DRAG_THRESHOLD = 4;

// ─── Gesture state (discriminated union) ───────────────────────

interface Pointer {
  id: number;
  clientX: number;
  clientY: number;
}

export type Gesture =
  | { mode: 'idle' }
  | { mode: 'panning'; sx: number; sy: number; px: number; py: number }
  | {
      mode: 'pinching';
      startDist: number;
      startMidX: number;
      startMidY: number;
      startPanX: number;
      startPanY: number;
      startZoom: number;
    }
  | {
      mode: 'selecting';
      sx: number;
      sy: number;
      shift: boolean;
      alt: boolean;
      cmd: boolean;
      confirmed: boolean;
    }
  | {
      mode: 'moving';
      /** Start position in viewport coords */
      svx: number;
      svy: number;
      /** Current position in viewport coords */
      cvx: number;
      cvy: number;
      shift: boolean;
    }
  | {
      mode: 'rotating';
      /** Start position in viewport coords */
      svx: number;
      svy: number;
      /** Current position in viewport coords */
      cvx: number;
      cvy: number;
      /** Rotation center in world coords */
      cx: number;
      cy: number;
      /** Angle at gesture start (degrees) */
      startAngle: number;
      shift: boolean;
      alt: boolean;
    }
  | {
      mode: 'scrubbing';
      /** Entity IDs activated (callback fired) during this drag. */
      activatedIds: Set<string>;
    };

// ─── Options ───────────────────────────────────────────────────

export interface CanvasGesturesOptions {
  svgRef: Ref<SVGElement | undefined>;
  tool: Ref<CanvasTool> | ComputedRef<CanvasTool>;
  pan: { x: number; y: number };
  zoom: Ref<number>;
  applyZoom: (vx: number, vy: number, factor: number) => void;
  entityInteraction?: boolean;
  /** Center of selection bounding box in world coords (for rotate handle angle computation). */
  selectionCenter?: ComputedRef<{ x: number; y: number } | null>;
  /** Reactive flag: true while Space is held for temporary pan override. */
  spaceHeld?: Ref<boolean>;
  /** Hit-test: returns entity ID at viewport position, or null. Only active (non-dimmed) entities should match. */
  hitTest?: (vpX: number, vpY: number) => string | null;
  /** Called once per entity when the pointer first enters it during a scrub drag. */
  onWireEntity?: (entityId: string) => void;
}

// ─── Composable ────────────────────────────────────────────────

export function useCanvasGestures(options: CanvasGesturesOptions) {
  const { svgRef, tool, pan, zoom, applyZoom, entityInteraction, selectionCenter, spaceHeld, hitTest, onWireEntity } = options;

  const gesture = ref<Gesture>({ mode: 'idle' });
  const pointers = new Map<number, Pointer>();

  /** Current pointer position in viewport coords, updated every pointermove. */
  const currentPointer = reactive({ x: 0, y: 0 });

  // ─── Selection computed properties (all in viewport coords) ─

  const selectionRect = computed(() => {
    const g = gesture.value;
    if (g.mode !== 'selecting' || !g.confirmed) return null;
    return {
      x: Math.min(g.sx, currentPointer.x),
      y: Math.min(g.sy, currentPointer.y),
      width: Math.abs(currentPointer.x - g.sx),
      height: Math.abs(currentPointer.y - g.sy),
    };
  });

  const selectionDirection = computed<'enclose' | 'intersect' | null>(() => {
    const g = gesture.value;
    if (g.mode !== 'selecting') return null;
    return currentPointer.x >= g.sx ? 'enclose' : 'intersect';
  });

  const selectionMode = computed(() => {
    const g = gesture.value;
    if (g.mode !== 'selecting') return null;
    if (g.alt) return 'remove' as const;
    if (g.shift || g.cmd) return 'add' as const;
    return 'replace' as const;
  });

  // ─── Helpers ────────────────────────────────────────────────

  function clientToViewport(clientX: number, clientY: number): { x: number; y: number } {
    const el = svgRef.value;
    if (!el) return { x: clientX, y: clientY };
    const ctm = (el as SVGGraphicsElement).getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function viewportToWorld(vx: number, vy: number): { x: number; y: number } {
    return {
      x: (vx - pan.x) / zoom.value,
      y: (vy - pan.y) / zoom.value,
    };
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('input, button, select, textarea, [contenteditable]');
  }
  function shouldStartPan(e: PointerEvent): boolean {
    if (e.button === 1) return true;
    if (spaceHeld?.value) return e.button === 0;
    if (tool.value !== 'pan') return false;
    return e.button === 0 || e.pointerType === 'touch';
  }

  function startPinch() {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
    const midX = (pts[0].clientX + pts[1].clientX) / 2;
    const midY = (pts[0].clientY + pts[1].clientY) / 2;
    gesture.value = {
      mode: 'pinching',
      startDist: dist,
      startMidX: midX,
      startMidY: midY,
      startPanX: pan.x,
      startPanY: pan.y,
      startZoom: zoom.value,
    };
  }

  // ─── Pointer handlers ───────────────────────────────────────

  function onPointerDown(e: PointerEvent) {
    const el = svgRef.value;
    if (!el) return;

    if (isInteractiveTarget(e.target)) return;

    if (entityInteraction && e.button !== 1 &&
        (e.target as HTMLElement)?.closest('foreignObject')) {
      return;
    }

    e.stopPropagation();

    pointers.set(e.pointerId, {
      id: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (gesture.value.mode !== 'idle') {
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (shouldStartPan(e)) {
      gesture.value = {
        mode: 'panning',
        sx: e.clientX,
        sy: e.clientY,
        px: pan.x,
        py: pan.y,
      };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // ── Handle clicks (move/rotate handles) — priority 1-2 ──
    const handleEl = (e.target as HTMLElement)?.closest('[data-graphic-handle]');
    if (handleEl && e.button === 0) {
      const handleType = handleEl.getAttribute('data-graphic-handle');
      const vp = clientToViewport(e.clientX, e.clientY);

      if (handleType === 'move') {
        gesture.value = {
          mode: 'moving',
          svx: vp.x, svy: vp.y,
          cvx: vp.x, cvy: vp.y,
          shift: e.shiftKey,
        };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      if (handleType === 'rotate' && selectionCenter?.value) {
        const center = selectionCenter.value;
        const world = viewportToWorld(vp.x, vp.y);
        const startAngle = Math.atan2(world.y - center.y, world.x - center.x) * (180 / Math.PI);
        gesture.value = {
          mode: 'rotating',
          svx: vp.x, svy: vp.y,
          cvx: vp.x, cvy: vp.y,
          cx: center.x, cy: center.y,
          startAngle,
          shift: e.shiftKey,
          alt: e.altKey,
        };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // ── Selection: left click in select mode ──
    if (tool.value === 'select' && e.button === 0) {
      const vp = clientToViewport(e.clientX, e.clientY);
      gesture.value = {
        mode: 'selecting',
        sx: vp.x,
        sy: vp.y,
        shift: e.shiftKey,
        alt: e.altKey,
        cmd: e.metaKey || e.ctrlKey,
        confirmed: false,
      };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // ── Wire tool: start scrub drag ──
    if (e.button === 0 && tool.value === 'wire') {
      const vp = clientToViewport(e.clientX, e.clientY);
      const activated = new Set<string>();
      const hit = hitTest?.(vp.x, vp.y);
      if (hit) {
        activated.add(hit);
        onWireEntity?.(hit);
      }
      gesture.value = { mode: 'scrubbing', activatedIds: activated };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const g = gesture.value;

    const ptr = pointers.get(e.pointerId);
    if (ptr) {
      ptr.clientX = e.clientX;
      ptr.clientY = e.clientY;
    }

    // Always update current pointer position (needed for hover tracking in wiring mode).
    const vp = clientToViewport(e.clientX, e.clientY);
    currentPointer.x = vp.x;
    currentPointer.y = vp.y;

    if (g.mode === 'idle') return;

    // ── Scrub drag (wiring) ──
    if (g.mode === 'scrubbing') {
      const hit = hitTest?.(vp.x, vp.y);
      if (hit && !g.activatedIds.has(hit)) {
        g.activatedIds.add(hit);
        onWireEntity?.(hit);
      }
      return;
    }

    // ── Panning ──
    if (g.mode === 'panning') {
      if (pointers.size <= 1) {
        pan.x = g.px + (e.clientX - g.sx);
        pan.y = g.py + (e.clientY - g.sy);
      } else {
        startPinch();
      }
      return;
    }

    // ── Pinching (snapshot-based) ──
    if (g.mode === 'pinching') {
      const pts = [...pointers.values()];

      if (pts.length < 2) {
        gesture.value = {
          mode: 'panning',
          sx: pts[0].clientX,
          sy: pts[0].clientY,
          px: pan.x,
          py: pan.y,
        };
        return;
      }

      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const midX = (pts[0].clientX + pts[1].clientX) / 2;
      const midY = (pts[0].clientY + pts[1].clientY) / 2;

      const startMidVp = clientToViewport(g.startMidX, g.startMidY);
      const currentMidVp = clientToViewport(midX, midY);

      const newZoom = g.startZoom * (dist / g.startDist);
      if (newZoom < ZOOM_MIN || newZoom > ZOOM_MAX) return;

      const wx = (startMidVp.x - g.startPanX) / g.startZoom;
      const wy = (startMidVp.y - g.startPanY) / g.startZoom;

      pan.x = currentMidVp.x - wx * newZoom;
      pan.y = currentMidVp.y - wy * newZoom;
      zoom.value = newZoom;

      gesture.value = { mode: 'pinching', startDist: g.startDist, startMidX: g.startMidX, startMidY: g.startMidY, startPanX: g.startPanX, startPanY: g.startPanY, startZoom: g.startZoom };
    }

    // ── Selecting ──
    if (g.mode === 'selecting') {
      const vp = clientToViewport(e.clientX, e.clientY);
      currentPointer.x = vp.x;
      currentPointer.y = vp.y;

      if (!g.confirmed) {
        const dx = vp.x - g.sx;
        const dy = vp.y - g.sy;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          gesture.value = { ...g, confirmed: true };
        }
      }
      return;
    }

    // ── Moving ──
    if (g.mode === 'moving') {
      const vp = clientToViewport(e.clientX, e.clientY);
      currentPointer.x = vp.x;
      currentPointer.y = vp.y;
      gesture.value = { ...g, cvx: vp.x, cvy: vp.y, shift: e.shiftKey };
      return;
    }

    // ── Rotating ──
    if (g.mode === 'rotating') {
      const vp = clientToViewport(e.clientX, e.clientY);
      currentPointer.x = vp.x;
      currentPointer.y = vp.y;
      gesture.value = { ...g, cvx: vp.x, cvy: vp.y, shift: e.shiftKey, alt: e.altKey };
      return;
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);

    if (pointers.size === 0) {
      gesture.value = { mode: 'idle' };
    }

    try {
      svgRef.value?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  // ─── Touch position sync ─────────────────────────────────────

  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      const ptr = pointers.get(t.identifier);
      if (ptr) {
        ptr.clientX = t.clientX;
        ptr.clientY = t.clientY;
      }
    }
  }

  // ─── Wheel (always zoom) ────────────────────────────────────
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const vp = clientToViewport(e.clientX, e.clientY);
    const base = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const factor = (e.metaKey || e.ctrlKey) ? (e.deltaY < 0 ? 1.05 : 1 / 1.05) : base;
    applyZoom(vp.x, vp.y, factor);
  }


  return {
    gesture,
    currentPointer,
    selectionRect,
    selectionDirection,
    selectionMode,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchMove,
    onWheel,
  };
}
