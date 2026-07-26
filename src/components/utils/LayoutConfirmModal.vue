<template>
  <UModal v-model:open="isOpen" :title="$t('confirm-modal-title')" :description="$t('confirm-modal-description')"
    :close="true" :ui="{ content: 'max-w-2xl', footer: 'justify-end' }">
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="h-40 rounded-md border border-default bg-elevated overflow-hidden">
          <CanvasViewport :bbox="physicalBbox" tool="pan" :entity-interaction="false">
            <KeyEntity v-for="(key, i) in keys" :key="key.id" :key-data="key" :index="i" preview-mode />
          </CanvasViewport>
        </div>
        <div class="text-sm text-toned">{{ $t('confirm-question') }}</div>
      </div>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" size="md" icon="i-lucide-pencil" @click="onEdit">
        {{ $t('confirm-edit') }}
      </UButton>
      <UButton color="primary" size="md" icon="i-lucide-check" @click="onConfirm">
        {{ $t('confirm-continue') }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed } from 'vue';
import type { Key } from '~/types';
import CanvasViewport from '../graphic/CanvasViewport.vue';
import KeyEntity from '../graphic/KeyEntity.vue';
import { keysBoundingBox } from '../graphic/keyShape';

const { $t } = useFluent();

const isOpen = defineModel<boolean>('open', { default: false });

const props = defineProps<{
  keys: Key[];
}>();

const emit = defineEmits<{
  confirm: [];
  edit: [];
}>();

const physicalBbox = computed(() => keysBoundingBox(props.keys));

function onConfirm() {
  isOpen.value = false;
  emit('confirm');
}

function onEdit() {
  isOpen.value = false;
  emit('edit');
}
</script>

<ftl locale="en">
confirm-modal-title = Confirm Keymap Layout
confirm-modal-description = Make sure the key order below matches your keyboard before building the firmware.
confirm-question = Does the order of the keys match your expectation? If not, edit the keymap layout to fix it.
confirm-edit = Edit Keymap Layout
confirm-continue = Looks Good, Continue
</ftl>

<ftl locale="zh-CN">
confirm-modal-title = 确认键位布局
confirm-modal-description = 生成固件前，请确认下方按键顺序与你的键盘一致。
confirm-question = 键位顺序是否符合你的预期？如果不符，请编辑键位布局。
confirm-edit = 编辑键位布局
confirm-continue = 顺序正确，继续
</ftl>

<ftl locale="ja">
confirm-modal-title = キーマップレイアウトの確認
confirm-modal-description = ファームウェアを生成する前に、以下のキーの並び順がお使いのキーボードと一致しているか確認してください。
confirm-question = キーの並び順は想定通りですか？そうでない場合は、キーマップレイアウトを編集してください。
confirm-edit = キーマップレイアウトを編集
confirm-continue = 問題なし、続行
</ftl>
