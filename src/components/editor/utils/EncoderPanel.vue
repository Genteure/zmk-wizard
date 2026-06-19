<script setup lang="ts">
import { computed } from 'vue';
import { Controllers } from '~/metadata/controllers';
import type { KeyboardPart, PinId } from '~/types';

const props = defineProps<{
  part: KeyboardPart;
}>();

/** Friendly display name: e.g. "left_encoder0", "right_encoder1". */
function encoderLabel(encoderId: string): string {
  const idx = props.part.encoders.findIndex((e) => e.id === encoderId);
  return `${props.part.name}_encoder${idx}`;
}

/** Look up the display label for a GPIO pin from controller metadata. */
function pinLabel(pinId: PinId): string {
  return Controllers[props.part.controller]?.gpios[pinId]?.label ?? pinId;
}
const emit = defineEmits<{
  addEncoder: [];
  removeEncoder: [encoderId: string];
  moveEncoder: [encoderId: string, direction: -1 | 1];
  setPin: [payload: { encoderId: string; phase: 'pinA' | 'pinB'; pinId: string | undefined }];
}>();

/** Find the pin currently assigned to an encoder phase. */
function encoderPin(encoderId: string, phase: 'pinA' | 'pinB'): PinId | undefined {
  for (const [pinId, usage] of Object.entries(props.part.pins)) {
    if (usage?.usage === 'encoder' && usage.encoderId === encoderId && usage.role === phase) {
      return pinId as PinId;
    }
  }
  return undefined;
}

/** Sentinel value for the "no pin" option — USelect rejects empty strings. */
const NONE_SENTINEL = '__none__';

/** Build dropdown options for an encoder phase: none + free pins + the currently assigned pin. */
function encoderPhaseOptions(encoderId: string, phase: 'pinA' | 'pinB') {
  const current = encoderPin(encoderId, phase);
  const free = Object.entries(props.part.pins)
    .filter(([id, u]) => !u || id === current)
    .map(([id]) => ({ label: pinLabel(id as PinId), value: id }));
  return [{ label: '— none —', value: NONE_SENTINEL }, ...free];
}
</script>

<template>
  <UCard class="mt-4">
    <template #header>
      <div class="flex justify-between items-center gap-2">
        <div>
          <div class="text-highlighted font-semibold">Encoders (EC11)</div>
          <div class="mt-1 text-muted text-sm">
            EC11-like rotary encoders. Only rotational inputs are configured here, add press-down
            inputs as direct kscan keys.
          </div>
        </div>
        <UButton label="Add Encoder" variant="outline" color="neutral"
          @click="emit('addEncoder')" />
      </div>
    </template>

    <div v-if="part.encoders.length === 0" class="text-muted text-sm py-4 text-center">
      No encoders configured yet.
    </div>

    <div v-for="encoder in part.encoders" :key="encoder.id"
      class="rounded-xl p-3 bg-muted ring ring-default mb-3 last:mb-0">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-mono text-base-content/50">{{ encoderLabel(encoder.id) }}</span>
        <div class="flex items-center gap-1">
          <UFieldGroup v-if="part.encoders.length > 1" size="xs">
            <UButton icon="i-lucide-chevron-up" variant="subtle" color="neutral"
              :disabled="part.encoders.indexOf(encoder) === 0"
              @click="emit('moveEncoder', encoder.id, -1)" />
            <UButton icon="i-lucide-chevron-down" variant="subtle" color="neutral"
              :disabled="part.encoders.indexOf(encoder) === part.encoders.length - 1"
              @click="emit('moveEncoder', encoder.id, 1)" />
          </UFieldGroup>
          <UButton color="error" icon="i-lucide-trash" variant="subtle" size="xs"
            @click="emit('removeEncoder', encoder.id)" />
        </div>
      </div>

      <div class="mt-3 flex gap-4">
        <UFormField label="Pin A" class="w-40">
          <USelect :model-value="encoderPin(encoder.id, 'pinA') ?? NONE_SENTINEL"
            :items="encoderPhaseOptions(encoder.id, 'pinA')"
            @update:model-value="emit('setPin', { encoderId: encoder.id, phase: 'pinA', pinId: $event === NONE_SENTINEL ? undefined : $event })" />
        </UFormField>
        <UFormField label="Pin B" class="w-40">
          <USelect :model-value="encoderPin(encoder.id, 'pinB') ?? NONE_SENTINEL"
            :items="encoderPhaseOptions(encoder.id, 'pinB')"
            @update:model-value="emit('setPin', { encoderId: encoder.id, phase: 'pinB', pinId: $event === NONE_SENTINEL ? undefined : $event })" />
        </UFormField>
      </div>
    </div>
  </UCard>
</template>
