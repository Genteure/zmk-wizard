import { computed, reactive, ref } from 'vue';
import type { BoundingBox, Point } from '~/types/geometry';

const MAX_AUTO_SCALE = 1.5;

interface CanvasTransformOptions {
  /** Minor grid cell size in world-space px (default 0.25U = 17.5) */
  gridCellSize?: number;
  /** Major grid cell size in world-space px (default 1U = 70) */
  gridMajorCellSize?: number;
}

/**
 * Manages the viewport transform for an infinite canvas: pan offset, zoom level,
 * world transform string, and grid visibility. Also provides screen↔world
 * coordinate conversion and auto-fit.
 */
export function useCanvasTransform(options?: CanvasTransformOptions) {
  const minorGridSize = options?.gridCellSize ?? 17.5;
  const majorGridSize = options?.gridMajorCellSize ?? 70;

  const pan = reactive({ x: 0, y: 0 });
  const zoom = ref(1);
  const viewportWidth = ref(0);
  const viewportHeight = ref(0);

  /** The SVG transform attribute for the world `<g>` element. */
  const worldTransform = computed(() =>
    `translate(${pan.x},${pan.y}) scale(${zoom.value})`,
  );

  /** Minor grid lines visible when grid size × zoom ≥ 6px. */
  const minorVisible = computed(() => minorGridSize * zoom.value >= 6);

  /** Major grid lines visible when major grid size × zoom ≥ 6px. */
  const majorVisible = computed(() => majorGridSize * zoom.value >= 6);

  /**
   * Compute the world-space rectangle that covers the visible viewport.
   * Used as the fill rect for grid patterns.
   */
  const gridRect = computed(() => {
    const w = viewportWidth.value / zoom.value;
    const h = viewportHeight.value / zoom.value;
    const left = -pan.x / zoom.value;
    const top = -pan.y / zoom.value;
    // Overfill by the viewport size so the grid never shows edges during pan
    const pad = Math.max(w, h);
    return {
      x: left - pad,
      y: top - pad,
      width: w + 2 * pad,
      height: h + 2 * pad,
    };
  });

  /**
   * Adjust pan and zoom so the given bounding box fills the viewport
   * with the specified padding (in screen pixels).
   */
  function fitAll(bbox: BoundingBox, padding = 40): void {
    const vw = viewportWidth.value;
    const vh = viewportHeight.value;
    if (vw === 0 || vh === 0) return;

    const bw = bbox.max.x - bbox.min.x;
    const bh = bbox.max.y - bbox.min.y;
    if (bw === 0 && bh === 0) {
      // Single point or empty — center at default zoom
      zoom.value = 1;
      pan.x = vw / 2 - bbox.min.x;
      pan.y = vh / 2 - bbox.min.y;
      return;
    }

    const sx = (vw - padding * 2) / bw;
    const sy = (vh - padding * 2) / bh;
    zoom.value = Math.min(sx, sy, MAX_AUTO_SCALE);

    // Center the bbox in the viewport
    pan.x = vw / 2 - (bbox.min.x + bw / 2) * zoom.value;
    pan.y = vh / 2 - (bbox.min.y + bh / 2) * zoom.value;
  }

  /**
   * Convert viewport-relative coordinates to world-space coordinates.
   * For client (screen) coords, use getScreenCTM().inverse() in the gesture layer.
   */
  function screenToWorld(vx: number, vy: number): Point {
    return {
      x: (vx - pan.x) / zoom.value,
      y: (vy - pan.y) / zoom.value,
    };
  }

  // ─── Zoom / pan interaction ───────────────────────────────

  const ZOOM_MIN = 0.04;
  const ZOOM_MAX = 25;

  /**
   * Zoom toward a viewport-relative point by the given factor.
   * The point stays fixed on screen; pan adjusts to compensate.
   */
  function applyZoom(viewportX: number, viewportY: number, factor: number): void {
    const oldZoom = zoom.value;
    const newZoom = Math.min(Math.max(oldZoom * factor, ZOOM_MIN), ZOOM_MAX);
    if (newZoom === oldZoom) return;

    pan.x = viewportX - (viewportX - pan.x) * (newZoom / oldZoom);
    pan.y = viewportY - (viewportY - pan.y) * (newZoom / oldZoom);
    zoom.value = newZoom;
  }

  /**
   * Combined zoom + pan for pinch gestures.
   * Keeps the midpoint of the two fingers fixed on screen while zooming.
   */
  function applyPinch(
    oldMidX: number, oldMidY: number,
    newMidX: number, newMidY: number,
    factor: number,
  ): void {
    const oldZoom = zoom.value;
    const newZoom = Math.min(Math.max(oldZoom * factor, ZOOM_MIN), ZOOM_MAX);

    // World point that was under oldMid
    const wx = (oldMidX - pan.x) / oldZoom;
    const wy = (oldMidY - pan.y) / oldZoom;

    // New pan so the same world point is under newMid at new zoom
    pan.x = newMidX - wx * newZoom;
    pan.y = newMidY - wy * newZoom;
    zoom.value = newZoom;
  }

  return {
    pan,
    zoom,
    viewportWidth,
    viewportHeight,
    worldTransform,
    gridRect,
    minorVisible,
    majorVisible,
    fitAll,
    screenToWorld,
    applyZoom,
    applyPinch,
  };
}
