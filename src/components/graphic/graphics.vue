<template>
  <div class="shrink-0 p-1 flex items-center justify-between gap-1 flex-notIne">
    <UTabs class="min-w-0" :content="false" size="sm" :items="toolbarItems" v-model="toolbarTool" />
    <HelpModal />
  </div>
  <div class="shrink-0 p-1 flex lg:hidden items-center">
    <UTabs v-model="selectedGraphic" size="sm" class="w-full" :content="false" :items="graphicTabs" />
  </div>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 bg-default lg:border-b border-default"
      :class="selectedGraphic === 'physical' ? '' : 'hidden lg:block'">
      <CanvasViewport ref="physicalCanvas" :bbox="keysBbox" :tool="toolbarTool" :entity-interaction="interactiveKeys"
        :selection-b-box="physicalSelectionBBox" :show-rotate-handle="true" :space-held="spaceHeld"
        :hit-test="wiringHitTest" :wire-callback="handleWireEntity"
        @contextmenu="handleContextMenu('physical', $event)">
        <KeyEntity v-for="(key, i) in keyboard.layout" :key="key.id" :key-data="key" :index="i"
          :selected="selection.selectedIdSet.has(key.id)" :pending-selected="currentPendingIds.has(key.id)"
          :input-pin-label="keyWiringLabels.get(key.id)?.inputPinLabel"
          :output-pin-label="keyWiringLabels.get(key.id)?.outputPinLabel"
          :pin-active="isKeyPinActive(key.id)" />
        <!-- Ghost entities during move/rotate (physical) -->
        <g v-for="ghost in physicalGhosts" :key="'pg-' + ghost.id" :transform="ghost.transform" opacity="0.45">
          <path :d="ghost.path" fill="var(--ui-bg)" stroke="var(--ui-text-muted)" stroke-width="1" />
        </g>
      </CanvasViewport>
    </div>
    <div class="flex-1 min-h-0 bg-default" :class="selectedGraphic === 'keymap' ? '' : 'hidden lg:block'">
      <CanvasViewport ref="keymapCanvas" :bbox="keymapBbox" :grid-cell-size="0" :grid-major-cell-size="DEFAULT_KEY_SIZE"
        :tool="toolbarTool" :entity-interaction="interactiveKeys" :selection-b-box="keymapSelectionBBox"
        :show-rotate-handle="false" :space-held="spaceHeld" :hit-test="wiringHitTestKeymap" :wire-callback="handleWireEntity"
        @contextmenu="handleContextMenu('keymap', $event)">
        <KeyEntity v-for="(key, i) in keyboard.layout" :key="key.id" :key-data="key" :index="i" position-mode="logical"
          :selected="selection.selectedIdSet.has(key.id)" :pending-selected="currentPendingIds.has(key.id)"
          :input-pin-label="keyWiringLabels.get(key.id)?.inputPinLabel"
          :output-pin-label="keyWiringLabels.get(key.id)?.outputPinLabel"
          :pin-active="isKeyPinActive(key.id)" />
        <!-- Ghost entities during move (keymap) -->
        <g v-for="ghost in keymapGhosts" :key="'kg-' + ghost.id" :transform="ghost.transform" opacity="0.45">
          <path :d="ghost.path" fill="var(--ui-bg)" stroke="var(--ui-text-muted)" stroke-width="1" />
        </g>
      </CanvasViewport>
    </div>
    <ContextMenu :visible="contextMenu.visible" :x="contextMenu.x" :y="contextMenu.y" :items="contextMenu.items"
      @close="closeContextMenu" />
  </div>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { computed, reactive, ref, watch, watchEffect } from 'vue';
import type { Gesture } from './composables/useCanvasGestures';
import { useKeyboardStore, useNavigationStore, useSelectionStore } from '../stores';
import CanvasViewport from './CanvasViewport.vue';
import KeyEntity from './KeyEntity.vue';
import { keysBoundingBox, keyBoundingBox, logicalKeysBoundingBox, logicalKeyBoundingBox, keyToSvgPath, normalizeRotationOrigin, rotateAndNormalizeKey, rotateKeyAroundCenter, DEFAULT_KEY_SIZE, DEFAULT_PADDING, DEFAULT_BORDER_RADIUS } from './keyShape';
import type { BoundingBox } from '~/types/geometry';
import type { KeyId } from '~/types/keyboard';
import type { PinId } from '~/types/devices';
import type { CanvasTool } from '~/types/tools';
import { useCanvasHotkeys, type CanvasHandle } from './composables/useCanvasHotkeys';
import ContextMenu from './ContextMenu.vue';
import type { ContextMenuItem } from './ContextMenu.vue';
import HelpModal from './HelpModal.vue';
import { resolvePinInventory } from '~/lib/pinInventory';

// ─── Stores ────────────────────────────────────────────────────
const nav = useNavigationStore();
const selection = useSelectionStore();
const keyboard = useKeyboardStore();

// ─── Toolbar ───────────────────────────────────────────────────
const toolbarTool = ref<CanvasTool>('select');
const selectedGraphic = ref<'physical' | 'keymap'>('physical');

const graphicTabs = computed<TabsItem[]>(() => [
  { label: 'Physical Layout', value: 'physical' },
  { label: 'Keymap Layout', value: 'keymap' },
]);

const interactiveKeys = computed(() => toolbarTool.value === 'wire');

// ─── Key wiring pin labels (Parts tab, active part) ────────────

/**
 * Wiring labels per key for the active part.
 * - `undefined` value → pin is not applicable (don't render row).
 * - `"???"` value → pin is required by the kscan but not yet assigned.
 * - string value → actual pin label.
 *
 * Direct kscan keys only need input; output is always undefined.
 * Matrix and charlieplex keys need both; missing pins show "???".
 */
const keyWiringLabels = computed(() => {
  const map = new Map<string, { inputPinLabel?: string; outputPinLabel?: string }>();
  if (nav.activePart === null) return map;
  const part = keyboard.parts[nav.activePart];
  if (!part) return map;

  // Resolve all pins (controller + device) and index by id for O(1) label lookup.
  const { allPins } = resolvePinInventory(part);
  const pinLabelMap = new Map<string, string>(allPins.map((p) => [p.id, p.label]));

  for (const [keyId, wiring] of Object.entries(part.keys)) {
    if (!wiring) continue;
    const anyPinId = (wiring.input ?? wiring.output) as PinId | undefined;
    if (!anyPinId) continue;
    const pinUsage = part.pins[anyPinId];
    if (pinUsage?.usage !== 'kscan') continue;
    const kscan = part.kscans.find((k) => k.id === pinUsage.kscan);
    if (!kscan) continue;

    const needsOutput = kscan.kind !== 'direct';
    const result: { inputPinLabel?: string; outputPinLabel?: string } = {};

    result.inputPinLabel = wiring.input
      ? (pinLabelMap.get(wiring.input) ?? '???')
      : (needsOutput ? '???' : undefined);

    if (needsOutput) {
      result.outputPinLabel = wiring.output
        ? (pinLabelMap.get(wiring.output) ?? '???')
        : '???';
    }

    map.set(keyId, result);
  }
  return map;
});

/** Whether the selected wiring pin is used by the given key. */
function isKeyPinActive(keyId: string): boolean {
  const ws = nav.wiringSelection;
  if (!ws) return false;
  const wiring = keyWiringLabels.value.get(keyId);
  if (!wiring) return false;
  // Check if either input or output pin label matches — but we compare pinIds.
  // Since labels are derived from pinIds in the same map, check the raw wiring data.
  if (nav.activePart === null) return false;
  const part = keyboard.parts[nav.activePart];
  if (!part) return false;
  const keyWiring = part.keys[keyId as KeyId];
  if (!keyWiring) return false;
  return keyWiring.input === ws.pinId || keyWiring.output === ws.pinId;
}

// ─── Canvas refs ───────────────────────────────────────────────
const physicalCanvas = ref<CanvasHandle>();
const keymapCanvas = ref<CanvasHandle>();
// ─── Gesture cancellation (for Escape key) ────────────────────

function onCancelGesture(canvas: 'physical' | 'keymap') {
  // Clear previous gesture state BEFORE cancelling, so the watch
  // transition handler never fires with a non-idle prev state.
  if (canvas === 'physical') {
    prevPhysicalGesture = { mode: 'idle' };
    lastSelectingPhysical.value = null;
  } else {
    prevKeymapGesture = { mode: 'idle' };
    lastSelectingKeymap.value = null;
  }
  const cv = canvas === 'physical' ? physicalCanvas.value : keymapCanvas.value;
  cv?.cancelGesture();
}

const activeTab = computed(() => nav.activeTab);
// ─── Hotkeys ───────────────────────────────────────────────────
const { spaceHeld, hasClipboard, actions } = useCanvasHotkeys({
  activeTab,
  physicalCanvas,
  keymapCanvas,
  onCancelGesture,
});

// ─── Context menu ──────────────────────────────────────────────

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  items: [] as ContextMenuItem[],
});

function handleContextMenu(
  canvas: 'physical' | 'keymap',
  info: { clientX: number; clientY: number; vpX: number; vpY: number },
) {
  if (nav.activeTab !== 'layout') return;

  const cv = canvas === 'physical' ? physicalCanvas.value : keymapCanvas.value;
  const entities = canvas === 'physical' ? physicalEntities.value : keymapEntities.value;
  if (!cv) return;

  const entityId = findEntityAtPoint(info.vpX, info.vpY, cv.pan, cv.zoom, entities);

  if (!entityId) {
    // Empty canvas — show utility actions
    contextMenu.items = [
      { label: 'Paste', action: actions.paste, disabled: !hasClipboard.value },
      { label: 'Select All', action: actions.selectAll },
      { label: 'Zoom to Fit', action: actions.fitAll },
    ];
  } else {
    // Right-click on entity — select it if not already, then show entity actions
    if (!selection.selectedIdSet.has(entityId)) {
      selection.setSelected([entityId]);
    }
    contextMenu.items = [
      { label: 'Copy', action: actions.copy, shortcut: '⌘C' },
      { label: 'Paste', action: actions.paste, shortcut: '⌘V', disabled: !hasClipboard.value },
      { label: 'Duplicate', action: actions.duplicate, shortcut: '⌘D' },
      { label: 'Delete', action: actions.deleteSelected, shortcut: '⌫' },
      { label: 'Mirror Horizontal', action: actions.mirrorHorizontal, disabled: selection.selectedCount === 0 },
      { label: 'Mirror Vertical', action: actions.mirrorVertical, disabled: selection.selectedCount === 0 },
    ];
  }

  contextMenu.x = info.clientX;
  contextMenu.y = info.clientY;
  contextMenu.visible = true;
}

function closeContextMenu() {
  contextMenu.visible = false;
}
// ─── Layout bounding boxes ─────────────────────────────────────
const keysBbox = computed(() => keysBoundingBox(keyboard.layout, DEFAULT_KEY_SIZE));
const keymapBbox = computed(() => logicalKeysBoundingBox(keyboard.layout, DEFAULT_KEY_SIZE));

// ─── Entity bounding boxes for hit testing ─────────────────────
const physicalEntities = computed(() =>
  keyboard.layout.map((k) => ({ id: k.id, bbox: keyBoundingBox(k, DEFAULT_KEY_SIZE) })),
);
const keymapEntities = computed(() =>
  keyboard.layout.map((k) => ({ id: k.id, bbox: logicalKeyBoundingBox(k, DEFAULT_KEY_SIZE) })),
);
// ─── Wiring mode ─────────────────────────────────────────────

/** Hit-test for wiring mode: returns entity ID at world coords if it belongs to the active part. */
function wiringHitTest(wx: number, wy: number): string | null {
  const part = nav.activePart;
  for (const k of keyboard.layout) {
    // Skip keys not in the active part (dimmed — not interactive).
    if (part !== null && k.part !== part) continue;
    const bbox = keyBoundingBox(k, DEFAULT_KEY_SIZE);
    if (wx >= bbox.min.x && wx <= bbox.max.x && wy >= bbox.min.y && wy <= bbox.max.y) {
      return k.id;
    }
  }
  return null;
}

/** Hit-test for keymap wiring: uses logical (col, row) coordinates. */
function wiringHitTestKeymap(wx: number, wy: number): string | null {
  const part = nav.activePart;
  for (const k of keyboard.layout) {
    if (part !== null && k.part !== part) continue;
    const bbox = logicalKeyBoundingBox(k, DEFAULT_KEY_SIZE);
    if (wx >= bbox.min.x && wx <= bbox.max.x && wy >= bbox.min.y && wy <= bbox.max.y) {
      return k.id;
    }
  }
  return null;
}

/** Callback fired by the graphics layer when an entity is activated during wiring scrub. */
function handleWireEntity(entityId: string) {
  const wiring = nav.wiringSelection;
  const partIdx = nav.activePart;
  if (!wiring || partIdx === null) return;

  keyboard.setKeyWiring(partIdx, entityId as KeyId, {
    pinId: wiring.pinId as PinId,
    role: wiring.role,
  });
}

// ─── Selection bounding boxes (for overlay + handles) ──────────

const selectedKeys = computed(() =>
  keyboard.layout.filter((k) => selection.selectedIdSet.has(k.id)),
);

const physicalSelectionBBox = computed(() => {
  if (selectedKeys.value.length === 0) return null;
  return keysBoundingBox(selectedKeys.value, DEFAULT_KEY_SIZE);
});

const keymapSelectionBBox = computed(() => {
  if (selectedKeys.value.length === 0) return null;
  return logicalKeysBoundingBox(selectedKeys.value, DEFAULT_KEY_SIZE);
});

// ─── Selection logic ───────────────────────────────────────────

/** Find entity at a viewport position (hit test by world coords). */
function findEntityAtPoint(
  vpX: number, vpY: number,
  pan: { x: number; y: number }, zoom: number,
  entities: Array<{ id: string; bbox: BoundingBox }>,
): string | null {
  const wx = (vpX - pan.x) / zoom;
  const wy = (vpY - pan.y) / zoom;
  for (const { id, bbox } of entities) {
    if (wx >= bbox.min.x && wx <= bbox.max.x && wy >= bbox.min.y && wy <= bbox.max.y) {
      return id;
    }
  }
  return null;
}

/** Compute which entity IDs fall inside a viewport rect. */
function entitiesInRect(
  rect: { x: number; y: number; width: number; height: number },
  pan: { x: number; y: number }, zoom: number,
  entities: Array<{ id: string; bbox: BoundingBox }>,
  enclose: boolean,
): Set<string> {
  const wMin = { x: (rect.x - pan.x) / zoom, y: (rect.y - pan.y) / zoom };
  const wMax = { x: (rect.x + rect.width - pan.x) / zoom, y: (rect.y + rect.height - pan.y) / zoom };
  const result = new Set<string>();
  for (const { id, bbox } of entities) {
    const hit = enclose
      ? (bbox.min.x >= wMin.x && bbox.max.x <= wMax.x && bbox.min.y >= wMin.y && bbox.max.y <= wMax.y)
      : (bbox.min.x <= wMax.x && bbox.max.x >= wMin.x && bbox.min.y <= wMax.y && bbox.max.y >= wMin.y);
    if (hit) result.add(id);
  }
  return result;
}

/** Pending selected IDs — updated by gesture watches. */
const currentPendingIds = ref(new Set<string>());

/**
 * Reactive pending IDs — recomputes whenever gesture or currentPointer changes.
 */
watchEffect(() => {
  const set = new Set<string>();
  for (const canvas of [physicalCanvas.value, keymapCanvas.value]) {
    if (!canvas) continue;
    const g = canvas.gesture;
    const mode = g?.mode;
    const confirmed = (g as any)?.confirmed;
    const cp = canvas.currentPointer;
    const _rect = canvas.selectionRect;
    if (mode !== 'selecting' || !confirmed) continue;
    if (!_rect) continue;
    if (!cp) continue;
    const entities = canvas === physicalCanvas.value ? physicalEntities.value : keymapEntities.value;
    const enclose = cp.x >= g.sx;
    const ids = entitiesInRect(_rect, canvas.pan, canvas.zoom, entities, enclose);
    for (const id of ids) set.add(id);
  }
  currentPendingIds.value = set;
});

// ─── Selection watches (click + box commit) ────────────────────

let prevPhysicalGesture: Gesture = { mode: 'idle' };
let prevKeymapGesture: Gesture = { mode: 'idle' };

const lastSelectingPhysical = ref<{ sx: number; sy: number; shift: boolean; alt: boolean; cmd: boolean; confirmed: boolean } | null>(null);
const lastSelectingKeymap = ref<{ sx: number; sy: number; shift: boolean; alt: boolean; cmd: boolean; confirmed: boolean } | null>(null);

watch(() => physicalCanvas.value?.gesture, (g) => {
  if (!g) return;

  // ── Commit move ──
  if (prevPhysicalGesture.mode === 'moving' && g.mode !== 'moving') {
    handleMoveEnd(prevPhysicalGesture as Extract<Gesture, { mode: 'moving' }>, physicalCanvas.value, true);
  }

  // ── Commit rotate ──
  if (prevPhysicalGesture.mode === 'rotating' && g.mode !== 'rotating') {
    handleRotateEnd(prevPhysicalGesture as Extract<Gesture, { mode: 'rotating' }>, physicalCanvas.value);
  }

  // ── Selection ──
  if (g.mode === 'selecting') {
    lastSelectingPhysical.value = { sx: g.sx, sy: g.sy, shift: g.shift, alt: g.alt, cmd: g.cmd, confirmed: g.confirmed };
  } else if (lastSelectingPhysical.value) {
    handleSelectEnd(lastSelectingPhysical.value, physicalCanvas.value, physicalEntities.value);
    lastSelectingPhysical.value = null;
  }

  prevPhysicalGesture = { ...g };
}, { deep: true });

watch(() => keymapCanvas.value?.gesture, (g) => {
  if (!g) return;

  // ── Commit move (keymap) ──
  if (prevKeymapGesture.mode === 'moving' && g.mode !== 'moving') {
    handleMoveEnd(prevKeymapGesture as Extract<Gesture, { mode: 'moving' }>, keymapCanvas.value, false);
  }

  // ── Selection ──
  if (g.mode === 'selecting') {
    lastSelectingKeymap.value = { sx: g.sx, sy: g.sy, shift: g.shift, alt: g.alt, cmd: g.cmd, confirmed: g.confirmed };
  } else if (lastSelectingKeymap.value) {
    handleSelectEnd(lastSelectingKeymap.value, keymapCanvas.value, keymapEntities.value);
    lastSelectingKeymap.value = null;
  }

  prevKeymapGesture = { ...g };
}, { deep: true });

function handleSelectEnd(
  state: { sx: number; sy: number; shift: boolean; alt: boolean; cmd: boolean; confirmed: boolean },
  canvas: CanvasHandle | undefined,
  entities: Array<{ id: string; bbox: BoundingBox }>,
) {
  if (!canvas) return;

  if (!state.confirmed) {
    // Click: hit test the start position
    const entityId = findEntityAtPoint(state.sx, state.sy, canvas.pan, canvas.zoom, entities);
    if (entityId) {
      if (state.shift || state.cmd) {
        selection.toggleSelected([entityId]);
      } else {
        selection.setSelected([entityId]);
      }
    } else if (!state.shift) {
      selection.clearSelected();
    }
  } else {
    // Box selection commit
    const cp = canvas.currentPointer;
    const p = canvas.pan;
    const z = canvas.zoom;
    if (!cp || !p || z == null) return;
    const rect = {
      x: Math.min(state.sx, cp.x),
      y: Math.min(state.sy, cp.y),
      width: Math.abs(cp.x - state.sx),
      height: Math.abs(cp.y - state.sy),
    };
    const enclose = cp.x >= state.sx;
    const ids = [...entitiesInRect(rect, p, z, entities, enclose)];
    if (ids.length === 0) return;

    if (state.alt) {
      selection.removeSelected(ids);
    } else if (state.shift || state.cmd) {
      selection.addSelected(ids);
    } else {
      selection.setSelected(ids);
    }
  }
}

// ─── Delta computation helpers (shared by ghosts + commits) ────

/** Quantized move delta. Returns null if zero. */
function computeMoveDelta(
  svx: number, svy: number, cvx: number, cvy: number,
  shift: boolean, canvasZoom: number, isPhysical: boolean,
) {
  const dx = (cvx - svx) / canvasZoom;
  const dy = (cvy - svy) / canvasZoom;
  if (isPhysical) {
    const QUANTUM = DEFAULT_KEY_SIZE * 0.25;
    let qdx = Math.round(dx / QUANTUM) * QUANTUM;
    let qdy = Math.round(dy / QUANTUM) * QUANTUM;
    if (shift) { if (Math.abs(dx) > Math.abs(dy)) qdy = 0; else qdx = 0; }
    if (qdx === 0 && qdy === 0) return null;
    return { dU: qdx / DEFAULT_KEY_SIZE, dV: qdy / DEFAULT_KEY_SIZE, pxX: qdx, pxY: qdy };
  }
  const qdx = Math.round(dx / DEFAULT_KEY_SIZE);
  const qdy = Math.round(dy / DEFAULT_KEY_SIZE);
  if (qdx === 0 && qdy === 0) return null;
  return { dU: qdx, dV: qdy, pxX: qdx * DEFAULT_KEY_SIZE, pxY: qdy * DEFAULT_KEY_SIZE };
}

/** Rotation delta in degrees. Returns null if zero. */
function computeRotateDelta(
  svx: number, svy: number, cvx: number, cvy: number,
  cx: number, cy: number, shift: boolean,
  pan: { x: number; y: number }, zoom: number,
) {
  const sa = Math.atan2((svy - pan.y) / zoom - cy, (svx - pan.x) / zoom - cx);
  const ca = Math.atan2((cvy - pan.y) / zoom - cy, (cvx - pan.x) / zoom - cx);
  let d = (ca - sa) * (180 / Math.PI);
  if (shift) d = Math.round(d / 15) * 15;
  return d === 0 ? null : d;
}

// ─── Move commit ───────────────────────────────────────────────

function handleMoveEnd(g: Extract<Gesture, { mode: 'moving' }>, canvas: CanvasHandle | undefined, isPhysical: boolean) {
  if (!canvas) return;
  const d = computeMoveDelta(g.svx, g.svy, g.cvx, g.cvy, g.shift, canvas.zoom, isPhysical);
  if (!d) return;
  keyboard.patchKeys(selectedKeys.value.map((k) => {
    if (!isPhysical) return { id: k.id as KeyId, changes: { col: k.col + d.dU, row: k.row + d.dV } };
    // Per algo §"Move key by dx, dy":
    //   r=0 → only x,y; rx/ry ignored
    //   r≠0 → x,y offset; rx/ry offset only if non-zero
    const base = { x: k.x + d.dU, y: k.y + d.dV };
    if (k.r === 0) return { id: k.id as KeyId, changes: base };
    return {
      id: k.id as KeyId,
      changes: {
        ...base,
        ...(k.rx !== 0 ? { rx: k.rx + d.dU } : {}),
        ...(k.ry !== 0 ? { ry: k.ry + d.dV } : {}),
      },
    };
  }));
}


function handleRotateEnd(g: Extract<Gesture, { mode: 'rotating' }>, canvas: CanvasHandle | undefined) {
  if (!canvas) return;
  const delta = computeRotateDelta(g.svx, g.svy, g.cvx, g.cvy, g.cx, g.cy, g.shift, canvas.pan, canvas.zoom);
  if (delta === null) return;

  if (g.alt || g.ctrl) {
    // Rotate around each key's own center point
    keyboard.patchKeys(selectedKeys.value.map((k) => {
      const result = rotateKeyAroundCenter(k, delta);
      return {
        id: k.id as KeyId,
        changes: { x: result.x, y: result.y, r: result.r, rx: 0, ry: 0 },
      };
    }));
  } else {
    // Rotate around group center — use correct algorithm + normalize
    const cxU = g.cx / DEFAULT_KEY_SIZE, cyU = g.cy / DEFAULT_KEY_SIZE;
    keyboard.patchKeys(selectedKeys.value.map((k) => {
      const result = rotateAndNormalizeKey(k, cxU, cyU, delta);
      return {
        id: k.id as KeyId,
        changes: { x: result.x, y: result.y, r: result.r, rx: 0, ry: 0 },
      };
    }));
  }
}

// ─── Ghost entities (during move/rotate) ───────────────────────

interface GhostEntity { id: string; transform: string; path: string; }

function ghostPath(k: { w: number; h: number }) {
  return keyToSvgPath({ w: k.w, h: k.h }, { keySize: DEFAULT_KEY_SIZE, padding: DEFAULT_PADDING, borderRadius: DEFAULT_BORDER_RADIUS });
}

function ghostTransform(tx: number, ty: number, r: number, rx: number, ry: number) {
  const base = `translate(${tx},${ty})`;
  return r === 0 ? base : `${base} rotate(${r}, ${rx},${ry})`;
}

const physicalGhosts = computed<GhostEntity[]>(() => {
  const g = physicalCanvas.value?.gesture;
  if (!g || (g.mode !== 'moving' && g.mode !== 'rotating') || selectedKeys.value.length === 0) return [];
  if (g.mode === 'moving') {
    const d = computeMoveDelta(g.svx, g.svy, g.cvx, g.cvy, g.shift, physicalCanvas.value!.zoom, true);
    if (!d) return [];
    return selectedKeys.value.map((k) => {
      // Rotation offset with rx/ry fallback: when rx=0, effective rx = x → offset = 0
      const rotOffX = (k.rx === 0 ? 0 : (k.rx - k.x)) * DEFAULT_KEY_SIZE;
      const rotOffY = (k.ry === 0 ? 0 : (k.ry - k.y)) * DEFAULT_KEY_SIZE;
      return {
        id: k.id,
        path: ghostPath(k),
        transform: ghostTransform(k.x * DEFAULT_KEY_SIZE + d.pxX, k.y * DEFAULT_KEY_SIZE + d.pxY, k.r, rotOffX, rotOffY),
      };
    });
  }
  // Rotate ghost — match the commit behavior for alt vs group
  const delta = computeRotateDelta(g.svx, g.svy, g.cvx, g.cvy, g.cx, g.cy, g.shift, physicalCanvas.value!.pan, physicalCanvas.value!.zoom);
  if (delta === null) return [];
  if (g.alt || g.ctrl) {
    // Individual rotation around each key's own center
    return selectedKeys.value.map((k) => {
      const result = rotateKeyAroundCenter(k, delta);
      return {
        id: k.id, path: ghostPath(k),
        transform: ghostTransform(result.x * DEFAULT_KEY_SIZE, result.y * DEFAULT_KEY_SIZE, result.r, 0, 0),
      };
    });
  }
  const cxU = g.cx / DEFAULT_KEY_SIZE, cyU = g.cy / DEFAULT_KEY_SIZE;
  return selectedKeys.value.map((k) => {
    const result = rotateAndNormalizeKey(k, cxU, cyU, delta);
    return {
      id: k.id, path: ghostPath(k),
      // After normalization rx=0, ry=0 → rotation about key's own top-left → offset 0
      transform: ghostTransform(result.x * DEFAULT_KEY_SIZE, result.y * DEFAULT_KEY_SIZE, result.r, 0, 0),
    };
  });
});

const keymapGhosts = computed<GhostEntity[]>(() => {
  const g = keymapCanvas.value?.gesture;
  if (!g || g.mode !== 'moving' || selectedKeys.value.length === 0) return [];
  const d = computeMoveDelta(g.svx, g.svy, g.cvx, g.cvy, g.shift, keymapCanvas.value!.zoom, false);
  if (!d) return [];
  return selectedKeys.value.map((k) => ({
    id: k.id,
    path: keyToSvgPath({ w: 1, h: 1 }, { keySize: DEFAULT_KEY_SIZE, padding: DEFAULT_PADDING, borderRadius: DEFAULT_BORDER_RADIUS }),
    transform: `translate(${(k.col + d.dU) * DEFAULT_KEY_SIZE},${(k.row + d.dV) * DEFAULT_KEY_SIZE})`,
  }));
});

// ─── Toolbar tabs ──────────────────────────────────────────────
watch(() => nav.activeTab, (newTab) => {
  if (newTab === 'layout') {
    toolbarTool.value = 'select';
  } else if (newTab === 'parts') {
    if (!['pan', 'wire'].includes(toolbarTool.value)) {
      toolbarTool.value = 'wire';
    }
  } else {
    toolbarTool.value = 'pan';
  }
});

const toolbarItems = computed<TabsItem[]>(() => {
  const list: TabsItem[] = [
    { icon: 'i-lucide-move', label: 'Pan', value: 'pan' },
  ];
  if (nav.activeTab === 'layout') {
    list.push(
      { icon: 'i-lucide-square-dashed-mouse-pointer', label: 'Select', value: 'select' },
    );
  }
  if (nav.activeTab === 'parts') {
    list.push({ icon: 'i-lucide-mouse-pointer-click', label: 'Wire', value: 'wire' });
  }
  return list;
});
</script>
