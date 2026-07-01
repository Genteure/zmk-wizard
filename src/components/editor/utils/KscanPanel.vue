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
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import { kscanLabel } from '~/components/utils/labels';
import { usePinInventory } from '~/lib/usePinInventory';
import type { KeyboardPart, KscanDriverKind, PinId } from '~/types';

const props = defineProps<{
  part: KeyboardPart;
}>();

const partRef = computed(() => props.part);
const { allPins, getPin } = usePinInventory(partRef);

const { $t } = useFluent();


/** Look up the display label for a GPIO pin from controller metadata. */
function pinLabel(pinId: PinId): string {
  return getPin(pinId)?.label ?? pinId;
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
  const free = allPins.value.filter(p => !(p.id in props.part.pins) || p.id === current).map(p => ({ label: p.label, value: p.id }));
  return [{ label: $t('none-option'), value: NONE_SENTINEL }, ...free];
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
          <div class="text-highlighted font-semibold">{{ $t('kscan-drivers') }}</div>
          <div class="mt-1 text-muted text-sm">
            {{ $t('kscan-drivers-desc') }}
          </div>
        </div>
        <UDropdownMenu v-model:open="showAddMenu" :items="addMenuItems">
          <UButton :label="$t('add-kscan')" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" />
        </UDropdownMenu>
      </div>
    </template>

    <div v-if="part.kscans.length === 0" class="text-muted text-sm py-4 text-center">
      {{ $t('no-kscan-drivers') }}
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
        <UFormField :label="$t('kscans-field')" class="w-auto">
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
          <UFormField :label="$t('kscan-matrix-diodes')" class="w-32">
            <USelect :model-value="kscan.diodes ? 'true' : 'false'"
              :items="[{ label: $t('kscan-matrix-diodes-yes'), value: 'true' }, { label: $t('kscan-matrix-diodes-no'), value: 'false' }]"
              @update:model-value="emit('patchKscan', kscan.id, { diodes: $event === 'true' })" />
          </UFormField>
        </template>
        <template v-else-if="kscan.kind === 'direct'">
          <UFormField :label="$t('kscan-direct-mode')" class="w-32">
            <USelect :model-value="kscan.mode" :items="[{ label: 'GND', value: 'gnd' }, { label: 'VCC', value: 'vcc' }]"
              @update:model-value="emit('patchKscan', kscan.id, { mode: $event })" />
          </UFormField>
        </template>
        <template v-else-if="kscan.kind === 'charlieplex'">
          <UFormField :label="$t('kscan-charlieplex-interrupt-pin')" class="w-48">
            <USelect :model-value="kscanInterruptPin(kscan.id) ?? NONE_SENTINEL" :items="interruptPinOptions(kscan.id)"
              @update:model-value="handleInterruptPin(kscan.id, $event)" />
          </UFormField>
        </template>
      </div>

      <!-- Assigned pins -->
      <div class="mt-3">
        <div v-if="kscanPins(kscan.id).length === 0" class="text-xs text-muted">{{ $t('no-pins-assigned') }}</div>
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

<ftl locale="en">
kscan-drivers = {-kscan} Drivers
kscan-drivers-desc = Detect key presses by monitoring the state of the pins. Supports matrix, direct, charlieplex kscan drivers and combinations of them.
add-kscan = Add {-kscan}
no-kscan-drivers = No kscan drivers configured yet.
kscans-field = kscans
kscan-matrix-diodes = Diodes
kscan-matrix-diodes-yes = With diodes
kscan-matrix-diodes-no = Without diodes
kscan-direct-mode = Mode
kscan-charlieplex-interrupt-pin = Interrupt Pin
no-pins-assigned = No pins assigned.
none-option = — {none} —
</ftl>

<ftl locale="zh-CN">
kscan-drivers = {-kscan} 驱动
kscan-drivers-desc = 通过监测引脚状态检测按键输入。支持矩阵(matrix)、直连(direct)、charlieplex 等多种 Kscan 驱动及其组合。
add-kscan = 添加 {-kscan}
no-kscan-drivers = 尚未配置 Kscan 驱动
kscans-field = Kscan 列表
kscan-matrix-diodes = 二极管
kscan-matrix-diodes-yes = 有二极管
kscan-matrix-diodes-no = 无二极管
kscan-direct-mode = 模式
kscan-charlieplex-interrupt-pin = 中断引脚
no-pins-assigned = 未分配引脚
none-option = — {none} —
</ftl>

<ftl locale="ja">
kscan-drivers = {-kscan} ドライバー
kscan-drivers-desc = ピンの状態を監視してキー入力を検出します。matrix、direct、charlieplex などの Kscan ドライバーとそれらの組み合わせに対応しています。
add-kscan = {-kscan} を追加
no-kscan-drivers = {-kscan} ドライバーが未設定です
kscans-field = Kscan 一覧
kscan-matrix-diodes = ダイオード
kscan-matrix-diodes-yes = ダイオードあり
kscan-matrix-diodes-no = ダイオードなし
kscan-direct-mode = モード
kscan-charlieplex-interrupt-pin = 割り込みピン
no-pins-assigned = ピンが割り当てられていません
none-option = — {none} —
</ftl>
