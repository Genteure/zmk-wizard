<script setup lang="ts">
/**
 * Extended pin section — buttons for pins from extension devices (shift registers, etc.).
 *
 * Mirrors the popover UX of PinButton.vue: click an ext pin button to assign it to a
 * kscan (or create a new one), then select it for key wiring.
 *
 * Extension device pins are output-only (gpioOut), so only matrix kscans (which accept
 * output pins) are shown.
 */

import { computed, ref } from 'vue';
import { useFluent } from 'fluent-vue';
import { usePinInventory } from '~/lib/usePinInventory';
import { useNavigationStore } from '~/components/stores';
import { kscanLabel } from '~/components/utils/labels';
import type { KeyboardPart, PinId, KscanDriver, DeviceId, PinInfo } from '~/types';
import { getDeviceMeta, type DeviceTypeName } from '~/metadata/device';

const props = defineProps<{
  part: KeyboardPart;
}>();

const { $t } = useFluent();
const partRef = computed(() => props.part);
const { allPins, deviceNodeLabels } = usePinInventory(partRef);
const nav = useNavigationStore();

const emit = defineEmits<{
  assignKscan: [pinId: string, kscanId: string, role: 'input' | 'output' | 'interrupt'];
  newKscan: [pinId: string, kind: KscanDriver['kind'], role: 'input' | 'output' | 'interrupt'];
  releasePin: [pinId: string];
  selectPin: [payload: { pinId: string; role: 'input' | 'output' } | null];
}>();

// ── Types ─────────────────────────────────────────────────

type BtnColor = 'success' | 'error' | 'warning' | 'primary' | 'secondary' | 'info' | 'neutral' | 'kscanin' | 'kscanout';

interface ExtPinGroup {
  deviceId: DeviceId;
  deviceTypeName: string;
  nodeLabel: string;
  busName: string;
  pins: PinInfo[];
}

interface KscanCard {
  heading: string;
  subtitle?: string;
  roles: { label: string; color: BtnColor; onSelect: () => void }[];
}

// ── Composable state ──────────────────────────────────────

/** Open popover state, keyed by pin.id. */
const openPopovers = ref<Record<string, boolean>>({});

/** Extension device pins with gpioOut capability, grouped by device. */
const extPinsByDevice = computed<ExtPinGroup[]>(() => {
  const groups = new Map<string, PinInfo[]>();
  for (const pin of allPins.value) {
    if (pin.source.type !== 'device') continue;
    if (!pin.capabilities.gpioOut) continue;
    const list = groups.get(pin.source.deviceId) ?? [];
    list.push(pin);
    groups.set(pin.source.deviceId, list);
  }
  if (groups.size === 0) return [];

  // Build deviceId → busName map for section headings
  const busMap = new Map<string, string>();
  for (const [busName, bus] of Object.entries(props.part.buses)) {
    for (const dev of bus.devices) {
      busMap.set(dev.id, busName);
    }
  }

  return Array.from(groups.entries()).map(([deviceId, pins]) => {
    const first = pins[0];
    return {
      deviceId: deviceId as DeviceId,
      deviceTypeName: first.source.type === 'device' ? first.source.deviceTypeName : '?',
      nodeLabel: deviceNodeLabels.value[deviceId as DeviceId] ?? deviceId,
      busName: busMap.get(deviceId) ?? '?',
      pins,
    };
  });
});

// ── Helpers ───────────────────────────────────────────────

/** Short display name from device metadata. */
function deviceShortName(typeName: string): string {
  return getDeviceMeta(typeName as DeviceTypeName).visual.short ?? typeName;
}
/** Get the usage of a pin from the shared pin map. */
function pinUsage(pinId: PinId) {
  return props.part.pins[pinId];
}

/** Whether this pin is assigned to a kscan. */
function pinAssigned(pinId: PinId): boolean {
  const u = pinUsage(pinId);
  return u?.usage === 'kscan';
}

/** Whether this pin is selectable for key wiring (kscan, non-interrupt). */
function pinSelectable(pinId: PinId): boolean {
  const u = pinUsage(pinId);
  return u?.usage === 'kscan' && u.role !== 'interrupt';
}

/** Get the kscan label for an assigned pin. */
function pinKscanLabel(pinId: PinId): string | undefined {
  const u = pinUsage(pinId);
  if (u?.usage !== 'kscan') return undefined;
  return kscanLabel(props.part.name, props.part.kscans, u.kscan);
}

/** Whether this pin is the currently selected wiring pin. */
function pinSelected(pinId: PinId): boolean {
  return nav.wiringSelection?.pinId === pinId;
}

// ── Click-to-select (mirrors PinButton.onPopoverClick) ────

/** Auto-select for wiring on click, or deselect, or open popover. */
function onExtPinClick(pinId: PinId) {
  const u = pinUsage(pinId);
  if (u?.usage === 'kscan' && u.role !== 'interrupt') {
    if (!pinSelected(pinId)) {
      emit('selectPin', { pinId, role: 'output' });
      return; // don't open popover
    }
    // Already selected — allow popover to open normally
  } else {
    emit('selectPin', null);
  }
}

// ── Kscan card generation (mirrors PinButton.vue) ─────────

const kscanKindLabels: Record<KscanDriver['kind'], string> = {
  matrix: 'kscan-kind-matrix',
  direct: 'kscan-kind-direct',
  charlieplex: 'kscan-kind-charlieplex',
};

const newTypes: { kind: KscanDriver['kind']; label: string }[] = [
  { kind: 'matrix', label: 'kscan-kind-matrix' },
];

const newTypesHeading = computed(() =>
  $t(props.part.kscans.length > 0 ? 'ext-pin-select-kscan' : 'ext-pin-create-kscan'),
);

/** Build kscan option cards for an ext pin. */
function kscanCardsForPin(pinId: PinId): { heading: string; cards: KscanCard[] } {
  const ctx = props.part;

  if (ctx.kscans.length > 0) {
    // Only show matrix kscans — ext pins can only be outputs
    const matrixKscans = ctx.kscans.filter((k) => k.kind === 'matrix');
    return {
      heading: $t('ext-pin-select-kscan'),
      cards: matrixKscans.map((kscan) => ({
        heading: kscanLabel(ctx.name, ctx.kscans, kscan.id),
        subtitle: $t(kscanKindLabels[kscan.kind]),
        roles: [{
          label: $t('role-output'),
          color: 'kscanout' as BtnColor,
          onSelect: () => {
            openPopovers.value[pinId] = false;
            emit('assignKscan', pinId, kscan.id, 'output');
          },
        }],
      })),
    };
  }

  // No kscans yet — offer to create a new matrix kscan
  return {
    heading: $t('ext-pin-create-kscan'),
    cards: newTypes.map(({ kind, label: kindLabel }) => ({
      heading: $t(kindLabel),
      roles: [{
        label: $t('role-output'),
        color: 'kscanout' as BtnColor,
        onSelect: () => {
          openPopovers.value[pinId] = false;
          emit('newKscan', pinId, kind, 'output');
        },
      }],
    })),
  };
}

/** Human-readable label from PinInfo, falling back to the id. */
function getPinLabel(pinId: PinId): string {
  return allPins.value.find((p) => p.id === pinId)?.label ?? pinId;
}

/** Button color based on usage. */
function pinButtonColor(pinId: PinId): BtnColor {
  const u = pinUsage(pinId);
  if (!u) return 'neutral';
  if (u.usage === 'kscan') return 'warning';
  return 'neutral';
}
</script>

<template>
  <div v-for="group in extPinsByDevice" :key="group.deviceId" class="rounded-xl bg-muted ring ring-default p-3 mt-3">
    <!-- Device heading -->
    <div class="mb-2 text-center">
      <span class="font-semibold text-toned">
        {{ deviceShortName(group.deviceTypeName) }}
      </span>
      <span class="font-mono text-sm text-muted">&nbsp;on {{ group.busName }}</span>
      <span class="font-mono text-sm text-muted">&nbsp;&mdash;&nbsp;{{ group.nodeLabel }}</span>
    </div>

    <!-- Pin buttons -->
    <div class="flex flex-wrap gap-2 justify-center">
      <UPopover v-for="pin in group.pins" :key="pin.id" v-model:open="openPopovers[pin.id]"
        :content="{ side: 'bottom', sideOffset: 8 }">
        <UButton :color="pinButtonColor(pin.id)" :label="pin.label" :variant="pinSelected(pin.id) ? 'solid' : 'subtle'"
          class="w-16 justify-center font-bold" size="sm" @click="onExtPinClick(pin.id)" />
        <template #content>
          <div class="p-3 min-w-52 max-w-[20rem] select-none">
            <!-- Pin header -->
            <div class="mb-3">
              <div class="font-semibold">{{ pin.label }}</div>
            </div>

            <!-- Assigned state -->
            <template v-if="pinAssigned(pin.id)">
              <div class="rounded-lg border border-default p-3 mb-3">
                <div class="flex items-center gap-1.5 mb-1.5">
                  <UBadge color="warning" variant="outline">
                    {{ $t('category-kscan') }}
                  </UBadge>
                  <UBadge color="kscanout" variant="outline">
                    {{ $t('role-output') }}
                  </UBadge>
                </div>
                <div class="font-medium">{{ pinKscanLabel(pin.id) }}</div>
              </div>

              <!-- Selection for key wiring -->
              <template v-if="pinSelectable(pin.id)">
                <template v-if="pinSelected(pin.id)">
                  <UButton :label="$t('deselect')" variant="subtle" color="neutral" class="w-full justify-center mb-3"
                    @click="emit('selectPin', null); openPopovers[pin.id] = false" />
                </template>
                <template v-else>
                  <UButton :label="$t('select-for-wiring', { role: $t('role-output') })" color="kscanout"
                    variant="outline" class="w-full justify-center mb-3"
                    @click="emit('selectPin', { pinId: pin.id, role: 'output' }); openPopovers[pin.id] = false" />
                </template>
              </template>

              <UButton icon="i-lucide-x" color="error" variant="subtle" :label="$t('unassign')"
                class="w-full justify-center" @click="emit('releasePin', pin.id); openPopovers[pin.id] = false" />
            </template>

            <!-- Unassigned: kscan option cards -->
            <template v-else>
              <div class="text-sm font-medium uppercase tracking-wider text-toned mb-2">
                {{ newTypesHeading }}
              </div>

              <div v-for="(card, ci) in kscanCardsForPin(pin.id).cards" :key="ci"
                class="rounded-lg border border-default p-2.5 mb-2 last:mb-0">
                <!-- Existing kscan: two-row layout -->
                <template v-if="card.subtitle">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <span class="font-medium">{{ card.heading }}</span>
                    <UBadge color="neutral" variant="outline">
                      {{ card.subtitle }}
                    </UBadge>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <UButton v-for="(role, ri) in card.roles" :key="ri" :color="role.color" variant="outline"
                      :label="role.label" @click="role.onSelect()" />
                  </div>
                </template>
                <!-- New kscan type: single-row layout -->
                <template v-else>
                  <div class="flex items-center gap-1.5">
                    <span class="font-medium">{{ card.heading }}</span>
                    <UButton v-for="(role, ri) in card.roles" :key="ri" :color="role.color" variant="outline"
                      :label="role.label" @click="role.onSelect()" />
                  </div>
                </template>
              </div>
            </template>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<ftl locale="en">
ext-pin-select-kscan = Select {-kscan}
ext-pin-create-kscan = Create new {-kscan}
role-output = Output
category-kscan = {-kscan}
select-for-wiring = Select for wiring ({ $role })
deselect = Deselect
unassign = Unassign
kscan-kind-matrix = Matrix
</ftl>

<ftl locale="zh-CN">
ext-pin-select-kscan = 选择{-kscan}
ext-pin-create-kscan = 创建新{-kscan}
role-output = 输出
category-kscan = {-kscan}
select-for-wiring = 选择用于接线（{ $role }）
deselect = 取消选择
unassign = 取消分配
kscan-kind-matrix = 矩阵
</ftl>

<ftl locale="ja">
ext-pin-select-kscan = {-kscan}を選択
ext-pin-create-kscan = 新しい{-kscan}を作成
role-output = 出力
category-kscan = {-kscan}
select-for-wiring = 配線として選択（{ $role }）
deselect = 選択解除
unassign = 割り当て解除
kscan-kind-matrix = Matrix
</ftl>
