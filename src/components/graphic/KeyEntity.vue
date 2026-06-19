<template>
  <g :transform="keyTransform" :data-graphic-entity="keyData.id">
    <!-- Key shape -->
    <path :d="pathData" :fill="pathFill" :stroke="pathStroke" :stroke-width="pathStrokeWidth" :opacity="pathOpacity"
      :stroke-dasharray="isDashed ? '4 2' : undefined" />

    <!-- HTML overlay inside key -->
    <foreignObject :x="padding / 2" :y="padding / 2" :width="foreignObjectWidth" :height="foreignObjectHeight">
      <div xmlns="http://www.w3.org/1999/xhtml" class="relative w-full h-full select-none">

        <!-- Key index: centered large in layout + parts-inactive, small top-left otherwise -->
        <div class="absolute inset-0" :class="indexContainerClass">
          <span class="tabular-nums" :class="indexTextClass">{{ index }}</span>
        </div>

        <!-- Keymap key code: keyboard tab only, centered -->
        <div v-if="nav.activeTab === 'keyboard'"
          class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span class="text-xl font-medium text-highlighted tabular-nums">{{ keyLabel }}</span>
        </div>

        <!-- Part label: layout tab only, bottom center -->
        <div v-if="isLayoutTab"
          class="absolute bottom-0 inset-x-0 flex items-center justify-center pointer-events-none pb-0.5">
          <div class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: partColor }"></span>
            <span class="text-xs/tight text-toned leading-none">{{ partLabel }}</span>
          </div>
        </div>


        <!-- Wiring pin labels: parts tab, active part only (§4.4) -->
        <div v-if="isInActivePart && (outputPinLabel !== undefined || inputPinLabel !== undefined)"
          class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
          <span v-if="outputPinLabel !== undefined" class="font-mono font-semibold text-kscanout leading-none">{{ outputPinLabel }}</span>
          <span v-if="inputPinLabel !== undefined" class="font-mono font-semibold text-kscanin leading-none">{{ inputPinLabel }}</span>
        </div>
      </div>
    </foreignObject>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Key } from '~/types/keyboard';
import { useKeyboardStore, useNavigationStore } from '../stores';
import { keyToSvgPath, DEFAULT_KEY_SIZE, DEFAULT_PADDING, DEFAULT_BORDER_RADIUS } from './keyShape';

// ─── Constants ──────────────────────────────────────────────────

const PART_NAMES = ['part0', 'part1', 'part2', 'part3', 'part4'] as const;

/**
 * Selection/focus state within the current tab.
 *
 * Tab-level concerns (parts inactive vs active) are NOT visual states —
 * they're determined by isPartsTab / isInActivePart / isPartsInactive.
 * See §1.3 state tree in content-visual.md.
 */
type KeyVisualState = 'default' | 'selected' | 'pending' | 'focused' | 'pin-active';

// ─── Props ──────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  keyData: Key;
  index: number;
  keySize?: number;
  padding?: number;
  borderRadius?: number;
  selected?: boolean;
  pendingSelected?: boolean;
  positionMode?: 'physical' | 'logical';
  /** Display label for the output pin (kscanout/rose), if any. */
  outputPinLabel?: string;
  /** Display label for the input pin (kscanin/sky), if any. */
  inputPinLabel?: string;
  /** True when the selected wiring pin is used by this key (§4.3). */
  pinActive?: boolean;
}>(), {
  keySize: DEFAULT_KEY_SIZE,
  padding: DEFAULT_PADDING,
  borderRadius: DEFAULT_BORDER_RADIUS,
  selected: false,
  pendingSelected: false,
  positionMode: 'physical',
  outputPinLabel: undefined,
  inputPinLabel: undefined,
  pinActive: false,
});

/** Keymap label: A-Z cycling */
const keyLabel = computed(() => String.fromCharCode(65 + (props.index % 26)));

// ─── Stores (read-only, no subscriptions) ───────────────────────

const nav = useNavigationStore();
const keyboard = useKeyboardStore();

// ─── Tab / part context ─────────────────────────────────────────

const isLayoutTab = computed(() => nav.activeTab === 'layout');
/** True when on parts tab with an active part selected */
const isPartsTab = computed(() => nav.activeTab === 'parts' && nav.activePart !== null);
/** True when the key belongs to the currently active part */
const isInActivePart = computed(() => isPartsTab.value && props.keyData.part === nav.activePart);
/** True when on parts tab and key is NOT in the active part → dimmed, non-interactive */
const isPartsInactive = computed(() => isPartsTab.value && !isInActivePart.value);

// ─── Part name & color ─────────────────────────────────────────

const partName = computed(() => PART_NAMES[props.keyData.part % PART_NAMES.length]);

/** Part dot/stroke color: auto-switches to neutral when key is in active part */
const partColor = computed(() => `var(--ui-${isInActivePart.value ? 'neutral' : partName.value})`);

/** Part label text (layout tab only — shows part name) */
const partLabel = computed(() => keyboard.parts[props.keyData.part]?.name || '—');

// ─── Key dimensions (mode-dependent) ───────────────────────────

const keyW = computed(() => props.positionMode === 'logical' ? 1 : props.keyData.w);
const keyH = computed(() => props.positionMode === 'logical' ? 1 : props.keyData.h);
const keyR = computed(() => props.positionMode === 'logical' ? 0 : props.keyData.r);
const keyX = computed(() => props.positionMode === 'logical' ? props.keyData.col : props.keyData.x);
const keyY = computed(() => props.positionMode === 'logical' ? props.keyData.row : props.keyData.y);
const keyRx = computed(() => props.positionMode === 'logical' ? 0 : props.keyData.rx);
const keyRy = computed(() => props.positionMode === 'logical' ? 0 : props.keyData.ry);

// ─── SVG path + transform ───────────────────────────────────────

const pathData = computed(() =>
  keyToSvgPath({ w: keyW.value, h: keyH.value }, {
    keySize: props.keySize,
    padding: props.padding,
    borderRadius: props.borderRadius,
  }),
);

const keyTransform = computed(() => {
  const ks = props.keySize;
  const tx = keyX.value * ks;
  const ty = keyY.value * ks;
  if (keyR.value === 0) return `translate(${tx},${ty})`;
  const rotx = (keyRx.value - keyX.value) * ks;
  const roty = (keyRy.value - keyY.value) * ks;
  return `translate(${tx},${ty}) rotate(${keyR.value}, ${rotx}, ${roty})`;
});

const foreignObjectWidth = computed(() => keyW.value * props.keySize - props.padding);
const foreignObjectHeight = computed(() => keyH.value * props.keySize - props.padding);

// ─── Visual state ──────────────────────────────────────────────
//
// Visual state tracks selection/focus within the current tab.
// Tab-level concerns (parts inactive/active) are handled separately
// via isPartsTab / isInActivePart / isPartsInactive in the style computeds.

/**
 * Priority: focused > pin-active > pending > selected > default
 */
const visualState = computed<KeyVisualState>(() => {
  // TODO: if (props.focused) return 'focused';
  if (props.pinActive) return 'pin-active';
  if (props.pendingSelected) return 'pending';
  if (props.selected) return 'selected';
  return 'default';
});

// ─── Path style ─────────────────────────────────────────────────
//
// Fill and stroke depend on BOTH visual state AND tab context.
//
// Layout / Keyboard tabs (§2, §3):
//   fill    = part-tinted background (part color @ 20% over base bg)
//   stroke  = part color
//
// Parts tab — inactive (§4.1):
//   fill    = canvas fill (var(--ui-bg))
//   stroke  = muted text, dashed, 50% opacity
//
// Parts tab — active (§4.2):
//   fill    = var(--ui-bg-elevated)
//   stroke  = var(--ui-border-accented)
//
// Parts tab — highlighted (§4.3, TODO):
//   fill    = var(--ui-bg-accented)
//   stroke  = var(--ui-primary)

/** Part-tinted background fill for layout/keyboard tabs */
const partBgFill = computed(() =>
  `color-mix(in srgb, ${partColor.value} 20%, var(--ui-bg))`,
);

const pathFill = computed(() => {
  // Parts tab — §4.1 inactive, §4.2 active
  if (isPartsTab.value) {
    if (isPartsInactive.value) return 'var(--ui-bg)';
    if (props.pinActive) return 'var(--ui-bg-accented)';
    return 'var(--ui-bg-elevated)';
  }
  // Layout / Keyboard tabs — §2.1 default, §2.2 selected, §2.3 pending
  switch (visualState.value) {
    case 'focused': case 'pin-active': return 'var(--ui-bg)';
    case 'selected': return `color-mix(in srgb, ${partColor.value} 35%, var(--ui-bg))`;
    default: return partBgFill.value; // pending and default share the same fill
  }
});

const pathStroke = computed(() => {
  // Parts tab
  if (isPartsTab.value) {
    if (isPartsInactive.value) return 'var(--ui-text-muted)';
    if (props.pinActive) return 'var(--ui-primary)';
    return 'var(--ui-border-accented)';
  }
  // Layout / Keyboard tabs
  switch (visualState.value) {
    case 'focused': return 'var(--color-sky-500)';
    case 'pin-active': return 'var(--color-amber-500)';
    default: return partColor.value; // selected, pending, default all use part color
  }
});

const pathStrokeWidth = computed(() => {
  if (isPartsTab.value) {
    if (props.pinActive) return 2;
    return 1;
  }
  switch (visualState.value) {
    case 'focused': return 3;
    case 'selected': case 'pending': return 2;
    default: return 1;
  }
});

const pathOpacity = computed(() => isPartsInactive.value ? 0.5 : 1);

const isDashed = computed(() =>
  isPartsInactive.value || visualState.value === 'pending',
);

// ─── Content overlay ────────────────────────────────────────────

/**
 * Index container positioning:
 *   centered → layout tab (§2.1) or parts-inactive (§4.1)
 *   top-left → keyboard tab (§3.1) or parts-active (§4.2)
 */
const indexContainerClass = computed(() =>
  (isLayoutTab.value || isPartsInactive.value)
    ? 'flex flex-col items-center justify-center'
    : 'flex items-start justify-start pl-0.5',
);

/**
 * Index text style per spec:
 *   layout tab  → text-2xl font-semibold text-highlighted  (§2.1)
 *   parts-inact → text-2xl font-semibold text-dimmed       (§4.1)
 *   otherwise   → text-xs text-highlighted               (§3.1, §4.2)
  */
 const indexTextClass = computed(() => {
   if (isLayoutTab.value) return 'text-2xl font-semibold text-highlighted';
   if (isPartsInactive.value) return 'text-2xl font-semibold text-dimmed';
  return 'text-xs font-semibold text-highlighted';
 });
</script>
