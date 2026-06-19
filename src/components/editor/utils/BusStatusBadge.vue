<script setup lang="ts">
import { computed } from 'vue';

type BusStatus = 'active' | 'inactive' | 'unavailable';

const props = defineProps<{
  status: BusStatus;
}>();

const badgeUi = computed(() => {
  if (props.status === 'unavailable') {
    return { label: 'Unavailable', color: 'warning' as const, variant: 'soft' as const };
  }

  if (props.status === 'active') {
    return { label: 'Active', color: 'success' as const, variant: 'solid' as const };
  }

  return { label: 'Inactive', color: 'neutral' as const, variant: 'outline' as const };
});
</script>

<template>
  <UBadge class="select-none" :color="badgeUi.color" :variant="badgeUi.variant">
    {{ badgeUi.label }}
  </UBadge>
</template>
