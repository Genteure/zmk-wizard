<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { ref } from 'vue';
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
];

const selected = ref<ControllerId>(controllers[0].id);

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

        <UFormField :label="$t('change-controller-new-label')">
          <USelect v-model="selected" :items="controllers.map(c => ({ label: c.label, value: c.id }))" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton :label="$t('change-controller-cancel')" color="neutral" variant="ghost" @click="open = false" />
      <UButton :label="$t('change-controller-confirm')" color="error" @click="onConfirm" />
    </template>
  </UModal>
</template>

<ftl locale="en">
change-controller-title = Change Controller
change-controller-warning = Changing the controller will { $danger }, including existing wiring, kscan drivers, encoders, and peripheral devices.
  .danger = reset everything on this part
change-controller-new-label = New Controller
change-controller-cancel = Cancel
change-controller-confirm = Change & Reset
</ftl>

<ftl locale="zh-CN">
change-controller-title = 更换控制器
change-controller-warning = 更换控制器将{ $danger }，包括现有接线、Kscan 驱动、编码器和外设。
  .danger = 重置此分体的所有内容
change-controller-new-label = 新控制器
change-controller-cancel = 取消
change-controller-confirm = 更换并重置
</ftl>

<ftl locale="ja">
change-controller-title = コントローラーの変更
change-controller-warning = コントローラーを変更すると{ $danger }。既存の配線、Kscanドライバー、エンコーダー、周辺機器もすべてリセットされます。
  .danger = このパーツのすべてがリセットされます
change-controller-new-label = 新しいコントローラー
change-controller-cancel = キャンセル
change-controller-confirm = 変更してリセット
</ftl>
