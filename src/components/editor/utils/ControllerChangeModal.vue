<script setup lang="ts">
import { ref } from 'vue';
import { Controllers } from '~/metadata/controllers';
import type { ControllerId } from '~/types';

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
        <span class="text-highlighted font-semibold">Change Controller</span>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Changing the controller will <span class="text-warning">reset</span> existing
          wiring, kscan drivers, encoders, and peripheral devices configured on this part.
        </p>

        <UFormField label="New Controller">
          <USelect v-model="selected" :items="controllers.map(c => ({ label: c.label, value: c.id }))" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
      <UButton label="Change & Reset" color="error" @click="onConfirm" />
    </template>
  </UModal>
</template>
