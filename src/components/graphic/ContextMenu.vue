<template>
  <Teleport to="body">
    <!-- Invisible backdrop catches clicks outside the menu -->
    <div v-if="visible" class="fixed inset-0 z-49" @click="emit('close')" @contextmenu.prevent="emit('close')" />
    <div
      v-if="visible"
      ref="menuEl"
      class="fixed z-50 bg-default border border-default rounded-lg shadow-lg py-1 min-w-36"
      :style="menuStyle"
      @mousedown.stop
      @contextmenu.prevent.stop
    >
      <button
        v-for="item in items"
        :key="item.label"
        class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-4"
        :disabled="item.disabled"
        @click="handleClick(item)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.shortcut" class="text-muted text-xs">{{ item.shortcut }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
}

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{ close: [] }>();

/** Position the menu so it stays within the viewport. */
const menuStyle = computed(() => {
  const MENU_WIDTH = 160;
  const ITEM_HEIGHT = 32;
  const MENU_HEIGHT = props.items.length * ITEM_HEIGHT + 8;
  const MARGIN = 4;

  let x = props.x;
  let y = props.y;

  if (typeof window !== 'undefined') {
    if (x + MENU_WIDTH > window.innerWidth - MARGIN) {
      x = window.innerWidth - MARGIN - MENU_WIDTH;
    }
    if (y + MENU_HEIGHT > window.innerHeight - MARGIN) {
      y = window.innerHeight - MARGIN - MENU_HEIGHT;
    }
  }

  return { left: `${x}px`, top: `${y}px` };
});

function handleClick(item: ContextMenuItem) {
  if (item.disabled) return;
  item.action();
  emit('close');
}
</script>
