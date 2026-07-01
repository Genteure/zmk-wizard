<template>
  <UTabs class="min-w-full" variant="link" :content=false :items="editorTabs" v-model="selectedEditorTab" />
  <component :is="selectedEditorComponent" />
</template>
<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { useFluent } from 'fluent-vue';
import { computed } from 'vue';

import { useKeyboardStore, useNavigationStore } from '~/components/stores.ts';
import KeyboardEditor from './keyboard.vue';
import LayoutEditor from './layout.vue';
import PartEditor from './part.vue';

const { $t } = useFluent();

const keyboard = useKeyboardStore();
const nav = useNavigationStore();

// TODO: extract to a shared constants file, or maybe custom color scheme
const PART_AVATAR_COLORS = [
  'bg-part0-500',
  'bg-part1-500',
  'bg-part2-500',
  'bg-part3-500',
  'bg-part4-500',
];

const selectedEditorTab = computed<string>({
  get() {
    if (nav.activeTab === 'parts' && nav.activePart !== null)
      return `part-${nav.activePart}`;
    return nav.activeTab;
  },
  set(value) {
    if (value === 'layout' || value === 'keyboard')
      nav.$patch({ activeTab: value, activePart: null });
    if (value.startsWith('part-'))
      nav.$patch({ activeTab: 'parts', activePart: parseInt(value.slice(5), 10) });
  },
});

const selectedEditorComponent = computed(() => {
  const value = nav.activeTab;
  if (value === 'layout') return LayoutEditor;
  if (value === 'keyboard') return KeyboardEditor;
  if (value === 'parts' && nav.activePart !== null) return PartEditor;
  return null;
});

const editorTabs = computed<TabsItem[]>(() => {
  const tabs: TabsItem[] = [
    {
      label: $t('tab-layout'),
      value: 'layout',
      icon: 'i-lucide-layout-dashboard',
    },
    {
      label: $t('tab-keyboard'),
      value: 'keyboard',
      icon: 'i-lucide-keyboard',
    },
  ];

  keyboard.parts.forEach((part, index) => {
    tabs.push({
      label: part.name,
      value: `part-${index}`,
      avatar: {
        class: `${PART_AVATAR_COLORS[index % PART_AVATAR_COLORS.length]} rounded-full w-3 h-3`,
      },
    });
  });

  return tabs;
});
</script>

<!--
Keyboard tab renamed to Firmware because it's more accurate.
Only changed the label because it's less work.
-->
<ftl locale="en">
tab-layout = Layout
tab-keyboard = Firmware
</ftl>

<ftl locale="zh-CN">
tab-layout = 布局
tab-keyboard = 固件
</ftl>

<ftl locale="ja">
tab-layout = レイアウト
tab-keyboard = ファームウェア
</ftl>
