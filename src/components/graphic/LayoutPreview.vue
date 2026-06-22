<template>
  <div v-if="!keys.length" class="w-full h-full flex items-center justify-center select-none">
    <!-- <span class="text-sm text-muted">&mdash;</span> -->
    <picture alt="waga">
      <source srcset="https://cdn.7tv.app/emote/01JA78H1M8000E34SZ69AYAM77/1x.avif" width="48" height="32"
        type="image/avif">
      <source srcset="https://cdn.7tv.app/emote/01JA78H1M8000E34SZ69AYAM77/1x.webp" width="48" height="32"
        type="image/webp">
      <source srcset="https://cdn.7tv.app/emote/01JA78H1M8000E34SZ69AYAM77/1x.gif" width="48" height="32"
        type="image/gif">
      <img alt="waga" src="https://cdn.7tv.app/emote/01JA78H1M8000E34SZ69AYAM77/1x.avif"
        style="width: 48px; height: 32px;">
    </picture>
  </div>
  <svg v-else class="w-full h-full overflow-hidden" xmlns="http://www.w3.org/2000/svg" :viewBox="viewBox">
    <g v-for="(key, i) in keys" :key="key.id" :transform="computeTransform(key)">
      <path :d="computePath(key)" fill="var(--ui-bg-elevated)" stroke="var(--ui-text)" stroke-width="1" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Key } from '~/types/keyboard';
import { keyToSvgPath, keysBoundingBox } from './keyShape';

const props = withDefaults(defineProps<{
  keys: Key[];
  keySize?: number;
  viewPadding?: number;
}>(), {
  keySize: 24,
  viewPadding: 10,
});

const bbox = computed(() => keysBoundingBox(props.keys, props.keySize));

const viewBox = computed(() => {
  const box = bbox.value;
  if (!box) return '0 0 100 100';
  const pad = props.viewPadding;
  return `${box.min.x - pad} ${box.min.y - pad} ${box.max.x - box.min.x + pad * 2} ${box.max.y - box.min.y + pad * 2}`;
});

function computePath(key: Key): string {
  return keyToSvgPath({ w: key.w, h: key.h }, { keySize: props.keySize, borderRadius: 2, padding: 1 });
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
