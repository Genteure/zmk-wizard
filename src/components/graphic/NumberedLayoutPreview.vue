<template>
  <svg
    class="w-full h-full overflow-hidden pointer-events-none select-none"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="viewBox"
    aria-hidden="true"
  >
    <g
      v-for="(key, index) in keys"
      :key="key.id"
      :transform="computeTransform(key)"
    >
      <path
        :d="computePath(key)"
        fill="var(--ui-bg-elevated)"
        stroke="var(--ui-text-muted)"
        stroke-width="1"
      />
      <text
        :x="key.w * keySize / 2"
        :y="key.h * keySize / 2"
        text-anchor="middle"
        dominant-baseline="central"
        fill="var(--ui-text-highlighted)"
        :font-size="fontSize"
        class="font-semibold tabular-nums"
      >{{ index }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Key } from '~/types/keyboard';
import { keyToSvgPath, keysBoundingBox } from './keyShape';

/**
 * Non-interactive physical-layout preview where every key renders only its
 * sequence number (`index` in the passed array order). Used by dialogs that
 * compare candidate keymap row/col assignments.
 */
const props = withDefaults(defineProps<{
  keys: Key[];
  keySize?: number;
  viewPadding?: number;
}>(), {
  keySize: 24,
  viewPadding: 8,
});

const bbox = computed(() => keysBoundingBox(props.keys, props.keySize));

const viewBox = computed(() => {
  const box = bbox.value;
  if (!box) return '0 0 100 100';
  const pad = props.viewPadding;
  return `${box.min.x - pad} ${box.min.y - pad} ${box.max.x - box.min.x + pad * 2} ${box.max.y - box.min.y + pad * 2}`;
});

const fontSize = computed(() => Math.max(8, props.keySize * 0.36));

function computePath(key: Key): string {
  return keyToSvgPath({ w: key.w, h: key.h }, { keySize: props.keySize, borderRadius: 2, padding: 2 });
}

function computeTransform(key: Key): string {
  const ks = props.keySize;
  const tx = key.x * ks;
  const ty = key.y * ks;
  if (key.r === 0) return `translate(${tx},${ty})`;
  const effRx = key.rx === 0 ? key.x : key.rx;
  const effRy = key.ry === 0 ? key.y : key.ry;
  const rotx = (effRx - key.x) * ks;
  const roty = (effRy - key.y) * ks;
  return `translate(${tx},${ty}) rotate(${key.r}, ${rotx}, ${roty})`;
}
</script>
