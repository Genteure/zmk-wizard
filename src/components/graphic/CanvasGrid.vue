<template>
  <!-- Minor grid: cellSize spacing -->
  <pattern
    id="canvas-grid-minor"
    :width="cellSize"
    :height="cellSize"
    patternUnits="userSpaceOnUse"
  >
    <path
      :d="`M ${cellSize} 0L0 0 0 ${cellSize}`"
      fill="none"
      :stroke="minorStroke"
      stroke-width=".5"
      vector-effect="non-scaling-stroke"
    />
  </pattern>

  <!-- Major grid: majorCellSize spacing -->
  <pattern
    id="canvas-grid-major"
    :width="majorCellSize"
    :height="majorCellSize"
    patternUnits="userSpaceOnUse"
  >
    <path
      :d="`M ${majorCellSize} 0L0 0 0 ${majorCellSize}`"
      fill="none"
      :stroke="majorStroke"
      stroke-width=".5"
      vector-effect="non-scaling-stroke"
    />
  </pattern>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  /** Spacing for minor grid lines in world-space pixels (0.25U = 17.5px at default scale) */
  cellSize?: number;
  /** Spacing for major grid lines in world-space pixels (1U = 70px at default scale) */
  majorCellSize?: number;
}>(), {
  cellSize: 17.5,
  majorCellSize: 70,
});

// TODO: theme-aware grid colors
const minorStroke = 'rgba(128,128,128,0.15)';
const majorStroke = 'rgba(128,128,128,0.25)';
</script>
