<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import { useKeyboardStore } from '~/components/stores';
import { Controllers } from '~/metadata/controllers';
import type { ControllerId } from '~/types';

const { $t } = useFluent();

const open = defineModel<boolean>({ default: false });

const emit = defineEmits<{
  confirm: [controllerId: ControllerId];
}>();

/** Local option list — intentionally decoupled from ControllerIdSchema for UI-only overrides. */
const controllers: { id: ControllerId; label: string }[] = [
  { id: 'nice_nano_v2', label: Controllers.nice_nano_v2.name },
  { id: 'xiao_ble', label: Controllers.xiao_ble.name },
  { id: 'xiao_rp2040', label: Controllers.xiao_rp2040.name },
  { id: 'rpi_pico', label: Controllers.rpi_pico.name },
];

const selected = ref<ControllerId>(controllers[0].id);

const keyboard = useKeyboardStore();

const isRp2040OnSplit = computed(() => {
  return Controllers[selected.value].soc === 'rp2040' && keyboard.parts.length > 1;
});

function onConfirm() {
  emit('confirm', selected.value);
  open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ footer: 'justify-end' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-alert-triangle" class="text-warning" />
        <span class="text-highlighted font-semibold">{{ $t('change-controller-title') }}</span>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-4">
        <i18n path="change-controller-warning" tag="p" class="text-sm text-muted">
          <template #danger="{ danger }">
            <span class="text-warning font-semibold">{{ danger }}</span>
          </template>
        </i18n>

        <UAlert v-if="isRp2040OnSplit" color="error" variant="soft" icon="i-lucide-alert-circle"
          :title="$t('rp2040-split-error')" />

        <UFormField :label="$t('change-controller-new-label')">
          <USelect v-model="selected" :items="controllers.map(c => ({ label: c.label, value: c.id }))" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton :label="$t('cancel')" color="neutral" variant="ghost" @click="open = false" />
      <UButton :label="$t('change-controller-confirm')" color="error" :disabled="isRp2040OnSplit" @click="onConfirm" />
    </template>
  </UModal>
</template>

<ftl locale="en">
change-controller-title = Change {-controller}
change-controller-warning = Changing the {-controller} will { $danger }, including existing wiring, kscan drivers, encoders, and peripheral devices.
  .danger = reset everything on this {-part}
change-controller-new-label = New {-controller}
change-controller-confirm = Change & Reset
rp2040-split-error = Shield Wizard only supports RP2040 controllers on unibody keyboards. Shield Wizard does not support configuring ZMK wired split transport (yet).
</ftl>

<ftl locale="zh-CN">
change-controller-title = 更换{-controller}
change-controller-warning = 更换{-controller}将{ $danger }，包括现有接线、Kscan 驱动、编码器和外设。
  .danger = 重置此{-part}的所有内容
change-controller-new-label = 新{-controller}
change-controller-confirm = 更换并重置
rp2040-split-error = Shield Wizard 仅支持在一体式键盘上使用 RP2040 {-controller}。Shield Wizard 暂不支持配置 ZMK 分体间有线通讯。
</ftl>

<ftl locale="ja">
change-controller-title = {-controller}の変更
change-controller-warning = {-controller}を変更すると{ $danger }。既存の配線、Kscanドライバー、エンコーダー、周辺機器もすべてリセットされます。
  .danger = この{-part}のすべてがリセットされます
change-controller-new-label = 新しい{-controller}
change-controller-confirm = 変更してリセット
rp2040-split-error = Shield Wizard は RP2040{-controller}をユニボディ（一体型）キーボードでのみサポートしています。ZMK の有線スプリット通信の設定には（まだ）対応していません。
</ftl>
