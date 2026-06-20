<script setup lang="ts">
/**
 * Kscan (keyboard scan) panel. Manages kscan drivers and their pin assignments.
 *
 * Kscan drivers detect key presses by monitoring GPIO pin states. Three types:
 * - **matrix**: Row/column grid. Pins have roles: input (sensing) and output (driving).
 * - **direct**: One pin per key. All pins are input; the other side of each switch
 *   connects to GND or VCC.
 * - **charlieplex**: Pins are both input and output simultaneously. The same pin is
 *   assigned to keys as both input and output. Can have 0 or 1 interrupt pin.
 *
 * Pin assignments are stored in `part.pins` (the shared pin map), not on the kscan
 * entity itself. This panel reads/writes that map via emit callbacks to the parent.
 */

const ROLE_ORDER: Record<string, number> = { input: 0, output: 1, interrupt: 2 };
import { ref } from 'vue';
import type { KeyboardPart, PinId, KscanDriverKind } from '~/types';
import { Controllers } from '~/metadata/controllers';
import { kscanLabel } from '~/components/utils/labels';

const props = defineProps<{
  part: KeyboardPart;
}>();


/** Look up the display label for a GPIO pin from controller metadata. */
function pinLabel(pinId: PinId): string {
  return Controllers[props.part.controller]?.gpios[pinId]?.label ?? pinId;
}

const emit = defineEmits<{
  addKscan: [kind: KscanDriverKind];
  removeKscan: [kscanId: string];
  moveKscan: [kscanId: string, direction: -1 | 1];
  patchKscan: [kscanId: string, changes: Record<string, unknown>];
  assignPin: [payload: { pinId: PinId; kscanId: string; role: 'input' | 'output' | 'interrupt' }];
  releasePin: [pinId: PinId];
}>();

import type { DropdownMenuItem } from '@nuxt/ui';

const addMenuItems: DropdownMenuItem[][] = [[
  { label: 'Matrix', onSelect: () => addKscan('matrix') },
  { label: 'Direct', onSelect: () => addKscan('direct') },
  { label: 'Charlieplex', onSelect: () => addKscan('charlieplex') },
]];

const showAddMenu = ref(false);

function addKscan(kind: KscanDriverKind) {
  emit('addKscan', kind);
  showAddMenu.value = false;
}

/** Pins assigned to a specific kscan. */
function kscanPins(kscanId: string) {
  const pins = Object.entries(props.part.pins)
    .filter(([, u]) => u?.usage === 'kscan' && u.kscan === kscanId)
    .map(([id, u]) => ({ pinId: id as PinId, role: u!.role }));
  return pins.sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3));
}

/** Find the interrupt pin currently assigned to a kscan (charlieplex only). */
function kscanInterruptPin(kscanId: string): PinId | undefined {
  for (const [pinId, usage] of Object.entries(props.part.pins)) {
    if (usage?.usage === 'kscan' && usage.kscan === kscanId && usage.role === 'interrupt') {
      return pinId as PinId;
    }
  }
  return undefined;
}

/** Sentinel value for the "no pin" option — USelect rejects empty strings. */
const NONE_SENTINEL = '__none__';

/** Build dropdown options for the interrupt pin: none + free pins + current assignment. */
function interruptPinOptions(kscanId: string) {
  const current = kscanInterruptPin(kscanId);
  const free = Object.entries(props.part.pins)
    .filter(([id, u]) => !u || id === current)
    .map(([id]) => ({ label: pinLabel(id as PinId), value: id }));
  return [{ label: '— none —', value: NONE_SENTINEL }, ...free];
}
/** Handle interrupt pin selection for charlieplex kscan. */
function handleInterruptPin(kscanId: string, value: string) {
  // Release current interrupt pin if any
  const current = kscanInterruptPin(kscanId);
  if (current) emit('releasePin', current);
  // Assign new pin (skip if "none" selected)
  if (value !== NONE_SENTINEL) {
    emit('assignPin', { pinId: value as PinId, kscanId, role: 'interrupt' });
  }
}

</script>

<template>
  <UCard class="mt-4">
    <template #header>
      <div class="flex justify-between items-center gap-2">
        <div>
          <div class="text-highlighted font-semibold">Kscan Drivers</div>
          <div class="mt-1 text-muted text-sm">
            Detect key presses by monitoring the state of the pins. Supports matrix, direct,
            charlieplex kscan drivers and combinations of them.
          </div>
        </div>
        <UDropdownMenu v-model:open="showAddMenu" :items="addMenuItems">
          <UButton label="Add Kscan" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" />
        </UDropdownMenu>
      </div>
    </template>

    <div v-if="part.kscans.length === 0" class="text-muted text-sm py-4 text-center">
      No kscan drivers configured yet.
    </div>

    <!-- Composite kscan0 — virtual, shown only when >1 real kscans exist -->
    <div v-if="part.kscans.length > 1" class="rounded-xl p-3 bg-muted ring ring-default mb-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UBadge variant="subtle" color="neutral" class="uppercase">composite</UBadge>
          <span class="text-sm font-mono text-base-content/50">{{ part.name }}_kscan0</span>
        </div>
      </div>
      <!-- Fake properties: list all real kscans -->
      <div class="mt-3 flex flex-wrap gap-3">
        <UFormField label="kscans" class="w-auto">
          <div class="flex flex-wrap gap-1">
            <span v-for="i in part.kscans.length" :key="i"
              class="inline-flex items-center gap-1 rounded bg-default ring ring-accented px-2 py-0.5 text-xs font-mono">
              {{ part.name }}_kscan{{ i }}
            </span>
          </div>
        </UFormField>
      </div>
    </div>
    <div v-for="kscan in part.kscans" :key="kscan.id" class="rounded-xl p-3 bg-muted ring ring-default mb-3 last:mb-0">
      <!-- Header row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UBadge variant="subtle" color="neutral" class="uppercase">
            {{ kscan.kind }}
          </UBadge>
          <span class="text-sm font-mono text-base-content/50">{{ kscanLabel(part.name, part.kscans, kscan.id) }}</span>
        </div>
        <div class="flex items-center gap-1">
          <UFieldGroup v-if="part.kscans.length > 1" size="xs">
            <UButton icon="i-lucide-chevron-up" variant="subtle" color="neutral"
              :disabled="part.kscans.indexOf(kscan) === 0" @click="emit('moveKscan', kscan.id, -1)" />
            <UButton icon="i-lucide-chevron-down" variant="subtle" color="neutral"
              :disabled="part.kscans.indexOf(kscan) === part.kscans.length - 1"
              @click="emit('moveKscan', kscan.id, 1)" />
          </UFieldGroup>
          <UButton color="error" icon="i-lucide-trash" variant="subtle" size="xs"
            @click="emit('removeKscan', kscan.id)" />
        </div>
      </div>

      <!-- Properties -->
      <div class="mt-3 flex flex-wrap gap-3">
        <template v-if="kscan.kind === 'matrix'">
          <UFormField label="Diodes" class="w-32">
            <USelect :model-value="kscan.diodes ? 'true' : 'false'"
              :items="[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]"
              @update:model-value="emit('patchKscan', kscan.id, { diodes: $event === 'true' })" />
          </UFormField>
        </template>
        <template v-else-if="kscan.kind === 'direct'">
          <UFormField label="Mode" class="w-32">
            <USelect :model-value="kscan.mode" :items="[{ label: 'GND', value: 'gnd' }, { label: 'VCC', value: 'vcc' }]"
              @update:model-value="emit('patchKscan', kscan.id, { mode: $event })" />
          </UFormField>
        </template>
        <template v-else-if="kscan.kind === 'charlieplex'">
          <UFormField label="Interrupt Pin" class="w-48">
            <USelect :model-value="kscanInterruptPin(kscan.id) ?? NONE_SENTINEL" :items="interruptPinOptions(kscan.id)"
              @update:model-value="handleInterruptPin(kscan.id, $event)" />
          </UFormField>
        </template>
      </div>

      <!-- Assigned pins -->
      <div class="mt-3">
        <div v-if="kscanPins(kscan.id).length === 0" class="text-xs text-muted">No pins assigned.</div>
        <div class="flex flex-wrap gap-1">
          <div v-for="kp in kscanPins(kscan.id)" :key="kp.pinId"
            class="flex items-center gap-1 rounded bg-default ring ring-accented px-2 py-0.5 text-xs">
            <span class="font-bold">{{ pinLabel(kp.pinId) }}</span>
            <span class="text-base-content/50">({{ kp.role }})</span>
            <UButton class="rounded-full -mr-1" color="error" icon="i-lucide-x" variant="ghost" size="xs"
              @click="emit('releasePin', kp.pinId)" />
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
