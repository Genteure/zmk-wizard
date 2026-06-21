<template>
  <svg
    ref="svgEl"
    class="w-full h-full outline-none touch-none"
    :style="{ cursor }"
    xmlns="http://www.w3.org/2000/svg"
    tabindex="0"
    @pointerdown.capture="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @touchmove="onTouchMove"
    @wheel.prevent="onWheel"
    @contextmenu.prevent="onContextMenu"
  >
    <defs>
      <CanvasGrid :cell-size="gridCellSize" :major-cell-size="gridMajorCellSize" />
    </defs>

    <g :transform="worldTransform">
      <rect
        v-if="minorVisible"
        :x="gridRect.x" :y="gridRect.y"
        :width="gridRect.width" :height="gridRect.height"
        fill="url(#canvas-grid-minor)"
      />
      <rect
        v-if="majorVisible"
        :x="gridRect.x" :y="gridRect.y"
        :width="gridRect.width" :height="gridRect.height"
        fill="url(#canvas-grid-major)"
      />

      <slot />

      <!-- Selection bounding box + handles (layout tab, entities selected) -->
      <template v-if="selectionBBox">
        <rect
          :x="selectionBBox.min.x"
          :y="selectionBBox.min.y"
          :width="selectionBBoxWidth"
          :height="selectionBBoxHeight"
          fill="none"
          stroke="rgba(59,130,246,0.5)"
          stroke-width="1"
          stroke-dasharray="4 2"
          vector-effect="non-scaling-stroke"
        />

        <!-- Move handle (center of bounding box) -->
        <circle
          :cx="selectionCenterX"
          :cy="selectionCenterY"
:r="6 / zoom"
          fill="white"
          stroke="rgba(59,130,246,0.8)"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
          data-graphic-handle="move"
          style="cursor: grab"
        />

        <!-- Rotate handle (above center-top, physical layout only) -->
        <template v-if="showRotateHandle">
          <line
            :x1="selectionCenterX"
            :y1="selectionBBox.min.y"
            :x2="selectionCenterX"
:y2="selectionBBox.min.y - 20 / zoom"
            stroke="rgba(59,130,246,0.5)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <circle
            :cx="selectionCenterX"
:cy="selectionBBox.min.y - 20 / zoom"
:r="6 / zoom"
            fill="white"
            stroke="rgba(59,130,246,0.8)"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
            data-graphic-handle="rotate"
            style="cursor: grab"
          />
        </template>
      </template>

      <!-- Selection rectangle overlay (viewport → world) -->
      <rect
        v-if="computedSelectionRect"
        :x="(computedSelectionRect.x - pan.x) / zoom"
        :y="(computedSelectionRect.y - pan.y) / zoom"
        :width="computedSelectionRect.width / zoom"
        :height="computedSelectionRect.height / zoom"
        :fill="computedSelectionMode === 'remove' ? 'rgba(251,191,36,0.1)' : 'rgba(59,130,246,0.1)'"
        :stroke="computedSelectionMode === 'remove' ? 'rgba(251,191,36,0.5)' : 'rgba(59,130,246,0.5)'"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import type { BoundingBox } from '~/types/geometry';
import type { CanvasTool } from '~/types/tools';
import { useCanvasGestures } from './composables/useCanvasGestures';
import { useCanvasTransform } from './composables/useCanvasTransform';
import CanvasGrid from './CanvasGrid.vue';

const props = withDefaults(defineProps<{
  bbox?: BoundingBox | null;
  gridCellSize?: number;
  gridMajorCellSize?: number;
  tool?: CanvasTool;
  entityInteraction?: boolean;
  /** Bounding box of selected entities in world coords (for selection overlay). */
  selectionBBox?: BoundingBox | null;
  /** Show rotate handle (physical layout only, not keymap). */
  showRotateHandle?: boolean;
  /** True while Space is held for temporary pan override. */
  spaceHeld?: boolean;
  /** Hit-test: returns entity ID at viewport position, or null. Only active (non-dimmed) entities should match. */
  hitTest?: (vpX: number, vpY: number) => string | null;
  /** Called once per entity when the pointer first enters it during a wiring scrub drag. */
  wireCallback?: (entityId: string) => void;
}>(), {
  tool: 'pan',
  showRotateHandle: true,
});
const emit = defineEmits<{
  contextmenu: [info: { clientX: number; clientY: number; vpX: number; vpY: number }];
}>();

function onContextMenu(e: MouseEvent) {
  const el = svgEl.value;
  if (!el) return;
  const ctm = (el as SVGGraphicsElement).getScreenCTM();
  if (!ctm) return;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  emit('contextmenu', { clientX: e.clientX, clientY: e.clientY, vpX: p.x, vpY: p.y });
}

const svgEl = ref<SVGElement>();

const {
  pan, zoom, worldTransform,
  viewportWidth, viewportHeight,
  gridRect, minorVisible, majorVisible,
  fitAll, applyZoom,
} = useCanvasTransform({
  gridCellSize: props.gridCellSize,
  gridMajorCellSize: props.gridMajorCellSize,
});

const tool = toRef(props, 'tool');

// ─── Selection bounding box derived values ─────────────────────

const selectionCenterX = computed(() => {
  if (!props.selectionBBox) return 0;
  return (props.selectionBBox.min.x + props.selectionBBox.max.x) / 2;
});

const selectionCenterY = computed(() => {
  if (!props.selectionBBox) return 0;
  return (props.selectionBBox.min.y + props.selectionBBox.max.y) / 2;
});

const selectionBBoxWidth = computed(() =>
  props.selectionBBox ? props.selectionBBox.max.x - props.selectionBBox.min.x : 0,
);

const selectionBBoxHeight = computed(() =>
  props.selectionBBox ? props.selectionBBox.max.y - props.selectionBBox.min.y : 0,
);

/** Rotation center in world coords (center of selection bbox). Passed to gesture composable. */
const selectionCenter = computed(() => {
  if (!props.selectionBBox) return null;
  return { x: selectionCenterX.value, y: selectionCenterY.value };
});

// ─── Gesture system ────────────────────────────────────────────
const {
  gesture,
  currentPointer,
  selectionRect: computedSelectionRect,
  selectionDirection: computedSelectionDirection,
  selectionMode: computedSelectionMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchMove,
  onWheel,
} = useCanvasGestures({ svgRef: svgEl, tool, pan, zoom, applyZoom, entityInteraction: props.entityInteraction, selectionCenter, spaceHeld: toRef(props, 'spaceHeld'), hitTest: props.hitTest ? (vpX, vpY) => props.hitTest!((vpX - pan.x) / zoom.value, (vpY - pan.y) / zoom.value) : undefined, onWireEntity: props.wireCallback });

// ─── Cursor ─────────────────────────────────────────────────────

/** Entity ID under cursor in wiring mode (for pointer cursor). */
const hoveredEntityId = computed(() => {
  if (tool.value !== 'wire' || !props.hitTest) return null;
  const wx = (currentPointer.x - pan.x) / zoom.value;
  const wy = (currentPointer.y - pan.y) / zoom.value;
  return props.hitTest(wx, wy);
});

const cursor = computed(() => {
  const g = gesture.value;
  if (g.mode === 'moving' || g.mode === 'rotating') return 'grabbing';
  if (g.mode === 'panning' || g.mode === 'pinching') return 'grabbing';
  if (g.mode === 'scrubbing') return 'cell';
  if (props.spaceHeld || tool.value === 'pan') return 'grab';
  if (tool.value === 'wire') return hoveredEntityId.value ? 'pointer' : 'default';
  if (tool.value === 'select') return 'crosshair';
  return 'default';
});
// ─── Viewport size ─────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null;

function updateViewportSize() {
  if (!svgEl.value) return;
  const rect = svgEl.value.getBoundingClientRect();
  viewportWidth.value = rect.width;
  viewportHeight.value = rect.height;
}

onMounted(() => {
  updateViewportSize();
  if (svgEl.value) {
    resizeObserver = new ResizeObserver(() => updateViewportSize());
    resizeObserver.observe(svgEl.value);
  }
  if (props.bbox) fitAll(props.bbox);
});

onUnmounted(() => { resizeObserver?.disconnect(); });

watch(() => props.bbox, (b) => { if (b) fitAll(b); });
watch([viewportWidth, viewportHeight], () => { if (props.bbox) fitAll(props.bbox); });

// ─── Helper methods for hotkey composable ───────────────────────

/** Zoom at viewport center by the given factor. */
function zoomAtCenter(factor: number) {
  applyZoom(viewportWidth.value / 2, viewportHeight.value / 2, factor);
}

/** Fit all content using the bbox prop. */
function fitAllContent() {
  if (props.bbox) fitAll(props.bbox);
}

/** Set zoom level directly. */
function setZoom(value: number) {
  zoom.value = value;
}

/** Cancel the current gesture (Escape key). */
function cancelGesture() {
  gesture.value = { mode: 'idle' };
}

// ─── Expose reactive state and methods for parent ──────────────

defineExpose({
  gesture,
  currentPointer,
  pan,
  zoom,
  selectionRect: computedSelectionRect,
  selectionDirection: computedSelectionDirection,
  selectionMode: computedSelectionMode,
  zoomAtCenter,
  fitAll: fitAllContent,
  setZoom,
  cancelGesture,
});

</script>