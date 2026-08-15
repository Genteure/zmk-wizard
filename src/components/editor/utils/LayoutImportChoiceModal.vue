<template>
  <UModal
    v-model:open="open"
    :title="$t('layout-choice-title')"
    :description="$t('layout-choice-description')"
    :close="false"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-3xl', footer: 'justify-end' }"
  >
    <template #body>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="option in options"
          :key="option.value"
          class="flex flex-col gap-2 rounded-lg border p-3 transition-colors"
          :class="selected === option.value
            ? 'border-primary bg-muted'
            : 'border-default bg-muted/50'"
        >
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="selected"
              type="radio"
              name="layout-row-col-choice"
              :value="option.value"
              class="mt-0.5 shrink-0"
            >
            <div class="min-w-0">
              <div class="text-sm font-semibold">
                {{ option.label }}
              </div>
              <div class="text-xs text-toned">
                {{ option.description }}
              </div>
            </div>
          </label>
          <div
            class="h-48 w-full rounded border border-muted bg-default overflow-hidden pointer-events-none"
          >
            <NumberedLayoutPreview :keys="option.keys" />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        :label="$t('layout-choice-confirm')"
        color="primary"
        :disabled="selected === null"
        @click="confirmSelection"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed, ref, watch } from 'vue';
import type { Key } from '~/types';
import NumberedLayoutPreview from '../../graphic/NumberedLayoutPreview.vue';
import type { ImportedLayout } from './layouthelper';

const { $t } = useFluent();

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  result: ImportedLayout | null;
}>();

const emit = defineEmits<{
  select: [choice: 'original' | 'generated'];
}>();

type Choice = 'original' | 'generated';

const selected = ref<Choice | null>(null);

watch(open, (isOpen) => {
  if (isOpen) selected.value = null;
});

interface Option {
  value: Choice;
  label: string;
  description: string;
  keys: Key[];
}

const options = computed<Option[]>(() => [
  {
    value: 'original',
    label: $t('layout-choice-original'),
    description: $t('layout-choice-original-desc'),
    keys: props.result?.original ?? [],
  },
  {
    value: 'generated',
    label: $t('layout-choice-generated'),
    description: $t('layout-choice-generated-desc'),
    keys: props.result?.generated ?? [],
  },
]);

function confirmSelection() {
  if (selected.value === null) return;
  emit('select', selected.value);
}
</script>

<ftl locale="en">
layout-choice-title = Which is better?
layout-choice-description = The imported layout has row/col data. Keys are numbered in keymap order for each option.
layout-choice-original = Use Imported row/col
layout-choice-original-desc = Key order follows the row/col values included in the imported data.
layout-choice-generated = Use Generated row/col
layout-choice-generated-desc = Key order is derived from the physical key positions by the layout algorithm.
layout-choice-confirm = Use Selection
</ftl>

<ftl locale="zh-CN">
layout-choice-title = 哪种更好？
layout-choice-description = 导入的布局带有 row/col 数据。按键按每个选项的 keymap 顺序编号显示。
layout-choice-original = 使用导入的 row/col
layout-choice-original-desc = 按键顺序遵循导入数据中包含的 row/col 值。
layout-choice-generated = 使用生成的 row/col
layout-choice-generated-desc = 按键顺序由布局算法根据物理位置推导得出。
layout-choice-confirm = 使用所选方案
</ftl>

<ftl locale="ja">
layout-choice-title = どちらが良いですか？
layout-choice-description = インポートしたレイアウトには row/col データがあります。キーは各選択肢のキーマップ順に番号で表示されます。
layout-choice-original = インポートの row/col を使う
layout-choice-original-desc = キーの順序はインポートデータの row/col 値に従います。
layout-choice-generated = 生成された row/col を使う
layout-choice-generated-desc = キーの順序は物理的な位置からレイアウトアルゴリズムが導出します。
layout-choice-confirm = 選択した方を適用
</ftl>
