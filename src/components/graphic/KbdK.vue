<template>
  <span class="inline-flex items-center gap-0.5">
    <kbd v-for="(k, i) in parts" :key="i"
      class="px-1.5 py-0.5 rounded bg-default border border-default text-xs font-mono">{{ k }}</kbd>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ keys: string }>();

/**
 * Split a key string into displayable segments.
 * Splits on "+" and trims whitespace.
 * Example: "⌘ + Click" → ["⌘", "Click"]
 */
const parts = computed(() => props.keys.split('+').map((s) => s.trim()));
</script>
