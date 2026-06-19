import type { ComputedRef, Ref } from 'vue';
import { computed, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useKeyboardStore, useSelectionStore } from '../../stores';
import type { KeyId } from '~/types/keyboard';
import type { Gesture } from './useCanvasGestures';
import { keysBoundingBox, logicalKeysBoundingBox, DEFAULT_KEY_SIZE } from '../keyShape';

// ─── Types ──────────────────────────────────────────────────────

/** Shape of a CanvasViewport expose as accessed by parent. */
export interface CanvasHandle {
  gesture: Gesture;
  pan: { x: number; y: number };
  zoom: number;
  currentPointer: { x: number; y: number } | null;
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  zoomAtCenter: (factor: number) => void;
  fitAll: () => void;
  setZoom: (value: number) => void;
  cancelGesture: () => void;
}

export interface CanvasHotkeysOptions {
  activeTab: ComputedRef<string>;
  physicalCanvas: Ref<CanvasHandle | undefined>;
  keymapCanvas: Ref<CanvasHandle | undefined>;
  onCancelGesture: (canvas: 'physical' | 'keymap') => void;
}

export interface CanvasHotkeysReturn {
  /** True while Space is held — gesture system uses this for temporary pan override. */
  spaceHeld: Ref<boolean>;
  /** Grid snap toggle state (default off). */
  gridSnap: Ref<boolean>;
  /** True when clipboard has content (for context menu Paste visibility). */
  hasClipboard: Ref<boolean>;
  actions: {
    deleteSelected: () => void;
    selectAll: () => void;
    copy: () => void;
    paste: () => void;
    duplicate: () => void;
    undo: () => void;
    redo: () => void;
    nudge: (dxU: number, dyU: number) => void;
    rotateSelected: (angleDeg: number) => void;
    mirrorHorizontal: () => void;
    mirrorVertical: () => void;
    toggleGridSnap: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    fitAll: () => void;
    zoomReset: () => void;
  };
}

// ─── Constants ──────────────────────────────────────────────────

const ZOOM_STEP = 1.12;

// ─── Composable ─────────────────────────────────────────────────

export function useCanvasHotkeys(options: CanvasHotkeysOptions): CanvasHotkeysReturn {
  const { activeTab, physicalCanvas, keymapCanvas, onCancelGesture } = options;
  const selection = useSelectionStore();
  const keyboard = useKeyboardStore();

  const spaceHeld = ref(false);
  const gridSnap = ref(false);

  // ─── Clipboard (in-memory, not browser clipboard) ────────────
  const clipboard = ref<typeof keyboard.layout>([]);
  const hasClipboard = computed(() => clipboard.value.length > 0);

  // ─── Helpers ─────────────────────────────────────────────────

  function isInputFocused(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLElement
      && !!el.closest('input, textarea, select, [contenteditable]');
  }

  function selectedKeys() {
    return keyboard.layout.filter((k) => selection.selectedIdSet.has(k.id));
  }

  // ─── Actions (exposed for context menu reuse) ────────────────

  const actions = {
    deleteSelected() {
      keyboard.deleteSelected();
    },

    selectAll() {
      selection.setSelected(keyboard.layout.map((k) => k.id));
    },

    copy() {
      clipboard.value = selectedKeys().map((k) => ({ ...k }));
    },

    paste() {
      if (clipboard.value.length === 0) return;
      const allKeys = keyboard.layout;

      // ── Physical layout placement (§5.10) ──
      const srcBbox = keysBoundingBox(clipboard.value, DEFAULT_KEY_SIZE);
      if (!srcBbox) return;
      const srcW = srcBbox.max.x - srcBbox.min.x;
      const srcH = srcBbox.max.y - srcBbox.min.y;
      let pxOffset = 0;
      let pyOffset = 0;
      if (allKeys.length > 0) {
        if (srcW >= srcH) {
          // Place below — new top edge = max(existing bottom) + 0.25U gap
          const maxBottom = Math.max(...allKeys.map((k) => (k.y + k.h) * DEFAULT_KEY_SIZE));
          pyOffset = maxBottom + DEFAULT_KEY_SIZE * 0.25 - srcBbox.min.y;
        } else {
          // Place to the right — new left edge = max(existing right) + 0.25U gap
          const maxRight = Math.max(...allKeys.map((k) => (k.x + k.w) * DEFAULT_KEY_SIZE));
          pxOffset = maxRight + DEFAULT_KEY_SIZE * 0.25 - srcBbox.min.x;
        }
      }

      // ── Keymap layout placement (§5.10, same logic, integer units) ──
      const srcLBox = logicalKeysBoundingBox(clipboard.value, DEFAULT_KEY_SIZE);
      let colOffset = 0;
      let rowOffset = 0;
      if (allKeys.length > 0 && srcLBox) {
        const srcLCols = (srcLBox.max.x - srcLBox.min.x) / DEFAULT_KEY_SIZE;
        const srcLRows = (srcLBox.max.y - srcLBox.min.y) / DEFAULT_KEY_SIZE;
        if (srcLCols >= srcLRows) {
          const maxRow = Math.max(...allKeys.map((k) => k.row + 1));
          rowOffset = maxRow - srcLBox.min.y / DEFAULT_KEY_SIZE;
        } else {
          const maxCol = Math.max(...allKeys.map((k) => k.col + 1));
          colOffset = maxCol - srcLBox.min.x / DEFAULT_KEY_SIZE;
        }
      }

      // ── Create new keys ──
      const newIds = keyboard.addKeys(clipboard.value.map((k) => ({part: k.part,
      row: k.row + rowOffset,
      col: k.col + colOffset,
      w: k.w,
      h: k.h,
      x: k.x + pxOffset / DEFAULT_KEY_SIZE,
      y: k.y + pyOffset / DEFAULT_KEY_SIZE,
      r: k.r,
      rx: k.rx + pxOffset / DEFAULT_KEY_SIZE,
      ry: k.ry + pyOffset / DEFAULT_KEY_SIZE,})));
      selection.setSelected(newIds);
    },

    duplicate() {
      // TODO: implement duplicate with placement algorithm (interaction-design §5.10)
      console.log('[hotkey] duplicate: not yet implemented');
    },

    undo() {
      // TODO: implement undo stack (interaction-design §1.4)
      console.log('[hotkey] undo: not yet implemented');
    },

    redo() {
      // TODO: implement redo stack (interaction-design §1.4)
      console.log('[hotkey] redo: not yet implemented');
    },

    nudge(dxU: number, dyU: number) {
      const keys = selectedKeys();
      if (keys.length === 0) return;
      keyboard.patchKeys(keys.map((k) => ({
        id: k.id as KeyId,
        changes: { x: k.x + dxU, y: k.y + dyU, rx: k.rx + dxU, ry: k.ry + dyU },
      })));
    },

    rotateSelected(angleDeg: number) {
      const keys = selectedKeys();
      if (keys.length === 0) return;
      keyboard.patchKeys(keys.map((k) => ({
        id: k.id as KeyId,
        changes: { r: k.r + angleDeg },
      })));
    },
    mirrorHorizontal() {
      const keys = selectedKeys();
      if (keys.length === 0) return;
      const bbox = keysBoundingBox(keys, DEFAULT_KEY_SIZE);
      if (!bbox) return;
      const cx = (bbox.min.x + bbox.max.x) / 2 / DEFAULT_KEY_SIZE;
      const lBox = logicalKeysBoundingBox(keys, DEFAULT_KEY_SIZE);
      const centerCol = lBox ? (lBox.min.x + lBox.max.x) / 2 / DEFAULT_KEY_SIZE : null;
      keyboard.patchKeys(keys.map((k) => ({
        id: k.id as KeyId,
        changes: {
          x: 2 * cx - k.x - k.w,
          rx: 2 * cx - k.rx,
          r: -k.r,
          ...(centerCol !== null ? { col: Math.round(2 * centerCol - k.col - 1) } : {}),
        },
      })));
    },

    mirrorVertical() {
      const keys = selectedKeys();
      if (keys.length === 0) return;
      const bbox = keysBoundingBox(keys, DEFAULT_KEY_SIZE);
      if (!bbox) return;
      const cy = (bbox.min.y + bbox.max.y) / 2 / DEFAULT_KEY_SIZE;
      const lBox = logicalKeysBoundingBox(keys, DEFAULT_KEY_SIZE);
      const centerRow = lBox ? (lBox.min.y + lBox.max.y) / 2 / DEFAULT_KEY_SIZE : null;
      keyboard.patchKeys(keys.map((k) => ({
        id: k.id as KeyId,
        changes: {
          y: 2 * cy - k.y - k.h,
          ry: 2 * cy - k.ry,
          r: -k.r,
          ...(centerRow !== null ? { row: Math.round(2 * centerRow - k.row - 1) } : {}),
        },
      })));
    },

    toggleGridSnap() {
      gridSnap.value = !gridSnap.value;
    },

    zoomIn() {
      physicalCanvas.value?.zoomAtCenter(ZOOM_STEP);
      keymapCanvas.value?.zoomAtCenter(ZOOM_STEP);
    },

    zoomOut() {
      physicalCanvas.value?.zoomAtCenter(1 / ZOOM_STEP);
      keymapCanvas.value?.zoomAtCenter(1 / ZOOM_STEP);
    },

    fitAll() {
      physicalCanvas.value?.fitAll();
      keymapCanvas.value?.fitAll();
    },

    zoomReset() {
      physicalCanvas.value?.setZoom(1);
      keymapCanvas.value?.setZoom(1);
    },
  };

  // ─── Keyboard handlers ───────────────────────────────────────

  function onKeyDown(e: KeyboardEvent) {
    if (isInputFocused()) return;

    // ── Space: temporary pan override ──
    if (e.code === 'Space' && !spaceHeld.value && !e.repeat) {
      e.preventDefault();
      spaceHeld.value = true;
      return;
    }

    const cmd = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    // ── Escape: cancel gesture or deselect ──
    if (e.key === 'Escape') {
      const pg = physicalCanvas.value?.gesture;
      const kg = keymapCanvas.value?.gesture;
      if (pg && pg.mode !== 'idle') {
        onCancelGesture('physical');
        return;
      }
      if (kg && kg.mode !== 'idle') {
        onCancelGesture('keymap');
        return;
      }
      if (selection.selectedCount > 0) {
        selection.clearSelected();
      }
      return;
    }

    // ── Universal shortcuts (all modes) ──

    if (cmd) {
      switch (e.key) {
        case '=': case '+':
          e.preventDefault();
          actions.zoomIn();
          return;
        case '-':
          e.preventDefault();
          actions.zoomOut();
          return;
        case '0':
          e.preventDefault();
          actions.fitAll();
          return;
        case '1':
          e.preventDefault();
          actions.zoomReset();
          return;
      }
    }

    // ── Layout mode shortcuts ──

    if (activeTab.value !== 'layout') return;

    // Delete / Backspace → delete selected
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.selectedCount > 0) {
      e.preventDefault();
      actions.deleteSelected();
      return;
    }

    // ⌘+A → select all
    if (cmd && e.key === 'a') {
      e.preventDefault();
      actions.selectAll();
      return;
    }

    // ⌘+C → copy
    if (cmd && e.key === 'c') {
      e.preventDefault();
      actions.copy();
      return;
    }

    // ⌘+V → paste
    if (cmd && e.key === 'v') {
      e.preventDefault();
      actions.paste();
      return;
    }

    // ⌘+D → duplicate
    if (cmd && e.key === 'd') {
      e.preventDefault();
      actions.duplicate();
      return;
    }

    // ⌘+Z → undo, ⌘+⇧+Z → redo
    if (cmd && e.key === 'z') {
      e.preventDefault();
      if (shift) actions.redo();
      else actions.undo();
      return;
    }

    // Arrow keys → nudge (0.25U, or 1U with ⇧)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        && selection.selectedCount > 0) {
      e.preventDefault();
      const step = shift ? 1 : 0.25;
      switch (e.key) {
        case 'ArrowUp':    actions.nudge(0, -step); break;
        case 'ArrowDown':  actions.nudge(0, step); break;
        case 'ArrowLeft':  actions.nudge(-step, 0); break;
        case 'ArrowRight': actions.nudge(step, 0); break;
      }
      return;
    }

    // R → rotate 30° CW, ⇧+R → rotate 30° CCW
    if (e.key === 'r' && selection.selectedCount > 0) {
      e.preventDefault();
      actions.rotateSelected(shift ? -30 : 30);
      return;
    }

    // G → toggle grid snap
    if (e.key === 'g') {
      e.preventDefault();
      actions.toggleGridSnap();
      return;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceHeld.value = false;
    }
  }

  // ─── Register listeners (auto-cleanup via useEventListener) ──

  useEventListener(window, 'keydown', onKeyDown);
  useEventListener(window, 'keyup', onKeyUp);
  return { spaceHeld, gridSnap, hasClipboard, actions };

}
