<template>
  <UModal v-model:open="isOpen" :title="$t('confirm-modal-title')" :description="$t('confirm-modal-description')"
    :close="true" :ui="{ content: 'max-w-2xl', footer: 'justify-end' }">
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <div class="text-xs font-medium text-toned">{{ $t('confirm-physical-layout') }}</div>
          <div class="h-40 rounded-md border border-default bg-elevated overflow-hidden">
            <CanvasViewport :bbox="physicalBbox" tool="pan" :entity-interaction="false">
              <KeyEntity v-for="(key, i) in keys" :key="key.id" :key-data="key" :index="i" preview-mode />
            </CanvasViewport>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <div class="text-xs font-medium text-toned">{{ $t('confirm-keymap-layout') }}</div>
          <div class="h-40 rounded-md border border-default bg-elevated overflow-hidden">
            <CanvasViewport :bbox="keymapBbox" :grid-cell-size="0" tool="pan" :entity-interaction="false">
              <KeyEntity v-for="(key, i) in keys" :key="key.id" :key-data="key" :index="i" position-mode="logical"
                preview-mode />
            </CanvasViewport>
          </div>
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
import { keysBoundingBox, logicalKeysBoundingBox } from '../graphic/keyShape';

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
const keymapBbox = computed(() => logicalKeysBoundingBox(props.keys));

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
confirm-physical-layout = Physical Layout
confirm-keymap-layout = Keymap Layout (order shown as A, B, C...)
confirm-question = Is the key order correct? If it looks wrong, edit the keymap layout before continuing.
confirm-edit = Edit Keymap Layout
confirm-continue = Looks Good, Continue
</ftl>

<ftl locale="zh-CN">
confirm-modal-title = 确认键位布局
confirm-modal-description = 生成固件前，请确认下方按键顺序与你的键盘一致。
confirm-physical-layout = 物理布局
confirm-keymap-layout = 键位布局（按 A、B、C... 顺序显示）
confirm-question = 按键顺序是否正确？如果顺序不对，请先编辑键位布局再继续。
confirm-edit = 编辑键位布局
confirm-continue = 顺序正确，继续
</ftl>

<ftl locale="ja">
confirm-modal-title = キーマップレイアウトの確認
confirm-modal-description = ファームウェアを生成する前に、以下のキーの並び順がお使いのキーボードと一致しているか確認してください。
confirm-physical-layout = 物理レイアウト
confirm-keymap-layout = キーマップレイアウト（A, B, C... の順に表示）
confirm-question = キーの並び順は正しいですか？おかしい場合は、続行する前にキーマップレイアウトを編集してください。
confirm-edit = キーマップレイアウトを編集
confirm-continue = 問題なし、続行
</ftl>
