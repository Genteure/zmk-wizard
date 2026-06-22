<script lang="ts">
export type { PinVisual } from '~/metadata/pins';
</script>

<script setup lang="ts">
import type { PartPinContext } from '~/types/pinContext';
import type { ControllerMetadata } from '~/metadata/controllers';
import type { PinVisual } from '~/metadata/pins';
import type { KscanDriver, PinUsage } from '~/types';
import { computed, ref } from 'vue';
import { kscanLabel, encoderLabel } from '~/components/utils/labels';
import { useFluent } from 'fluent-vue';
type BtnColor = 'success' | 'error' | 'warning' | 'primary' | 'secondary' | 'info' | 'neutral' | 'kscanin' | 'kscanout';


const props = defineProps<{
  pin: PinVisual;
  controllerMeta: ControllerMetadata;
  /** Current usage of this GPIO pin from the shared pin map, or undefined if unused. */
  usage?: PinUsage;
  /** Part context for label generation and kscan assignment options. */
  context: PartPinContext;
  /**
   * When truthy, this pin is selected for key wiring.
   * The string value is the role it will play: 'input' | 'output'.
   */
  selected?: 'input' | 'output' | false;
}>();

const emit = defineEmits<{
  assignKscan: [pinId: string, kscanId: string, role: 'input' | 'output' | 'interrupt'];
  newKscan: [pinId: string, kind: KscanDriver['kind'], role: 'input' | 'output' | 'interrupt'];
  releasePin: [pinId: string];
  selectPin: [payload: { pinId: string; role: 'input' | 'output' } | null];
}>();

const { $t } = useFluent();
const isGpio = computed(() => props.pin.kind === 'gpio');

const variant = computed(() => isGpio.value ? (props.selected ? 'solid' : 'subtle') : 'ghost');

/** Derive button color from usage category — no external color prop needed. */
function usageColor(usage?: PinUsage): BtnColor {
  if (!usage) return 'neutral';
  switch (usage.usage) {
    case 'kscan': return 'warning';
    case 'encoder': return 'info';
    case 'bus': return 'success';
    case 'device': return 'success';
  }
}

const resolvedColor = computed<BtnColor>(() => {
  if (isGpio.value) return usageColor(props.usage);
  switch (props.pin.kind) {
    case 'vcc': return 'error';
    case 'ctl': return 'info';
    default: return 'neutral';
  }
});

const label = computed(() => {
  const pin = props.pin;
  if (pin.kind === 'none') return '\u00A0';
  if (pin.kind === 'gpio') return props.controllerMeta.gpios[pin.pinId]?.label ?? pin.pinId;
  return pin.text;
});

const buttonClass = computed(() => [
  'w-14 justify-center font-bold',
  !isGpio.value && 'pointer-events-none select-none opacity-70',
]);

const open = ref(false);

type KscanPinRole = 'input' | 'output' | 'interrupt';

/** GPIO pin metadata — label, aliases, internal id. */
const pinMeta = computed(() => {
  if (!isGpio.value) return null;
  const pinId = (props.pin as Extract<PinVisual, { kind: 'gpio' }>).pinId;
  const gpio = props.controllerMeta.gpios[pinId];
  return {
    id: pinId,
    label: gpio?.label ?? pinId,
    aliases: gpio?.aka ?? [],
  };
});

/** Whether this pin is currently assigned to something. */

/** Whether this pin is assigned to a charlieplex kscan. */
const isCharlieplex = computed(() => {
  if (props.usage?.usage !== 'kscan') return false;
  return props.context.kscans.some((k) => k.id === (props.usage as Extract<PinUsage, { usage: 'kscan' }>).kscan && k.kind === 'charlieplex');
});

/** Whether this pin is the interrupt pin of a kscan (not selectable for wiring). */
const isInterrupt = computed(() => props.usage?.usage === 'kscan' && props.usage.role === 'interrupt');

/** Whether this pin is selectable for key wiring (kscan, non-interrupt). */
const isSelectable = computed(() => props.usage?.usage === 'kscan' && props.usage.role !== 'interrupt');
const isAssigned = computed(() => !!props.usage);

/** Role display config: label, badge color. */
const roleConfig: Record<string, { label: string; color: BtnColor }> = {
  input: { label: 'role-input', color: 'kscanin' },
  output: { label: 'role-output', color: 'kscanout' },
  interrupt: { label: 'role-interrupt', color: 'error' },
  pinA: { label: 'role-pin-a', color: 'primary' },
  pinB: { label: 'role-pin-b', color: 'success' },
};

/** Category display config. */
const categoryConfig: Record<string, { color: BtnColor }> = {
  Kscan: { color: 'warning' },
  Encoder: { color: 'info' },
  Bus: { color: 'success' },
  Device: { color: 'success' },
};

/** Structured usage info for display. */
const usageInfo = computed(() => {
  const u = props.usage;
  if (!u) return null;
  switch (u.usage) {
    case 'kscan': {
      const role = roleConfig[u.role] ?? { label: u.role, color: 'neutral' as BtnColor };
      const roleLabel = (isCharlieplex.value && u.role === 'input') ? $t('role-dual') : $t(role.label);
      return {
        category: $t('category-kscan'),
        categoryColor: categoryConfig.Kscan.color,
        name: kscanLabel(props.context.name, props.context.kscans, u.kscan),
        roleLabel,
        roleColor: role.color,
      };
    }
    case 'encoder': {
      const role = roleConfig[u.role] ?? { label: u.role, color: 'neutral' as BtnColor };
      return {
        category: $t('category-encoder'),
        categoryColor: categoryConfig.Encoder.color,
        name: encoderLabel(props.context.name, props.context.encoders, u.encoderId),
        roleLabel: $t(role.label),
        roleColor: role.color,
      };
    }
    case 'bus': {
      const role = roleConfig[u.role] ?? { label: u.role, color: 'neutral' as BtnColor };
      return {
        category: $t('category-bus'),
        categoryColor: categoryConfig.Bus.color,
        name: u.bus,
        roleLabel: $t(role.label),
        roleColor: role.color,
      };
    }
    case 'device': {
      const role = roleConfig[u.role] ?? { label: u.role, color: 'neutral' as BtnColor };
      return {
        category: $t('category-device'),
        categoryColor: categoryConfig.Device.color,
        name: u.deviceId,
        roleLabel: $t(role.label),
        roleColor: role.color,
      };
    }
  }
});

/** A group of role choices under one heading — a "card" in the popover. */
interface KscanCard {
  heading: string;
  subtitle?: string; // kscan kind tag, e.g. "Matrix"
  roles: { label: string; color: BtnColor; onSelect: () => void }[];
}

/** Kscan option cards: existing kscans if any, otherwise new kscan types. */
const kscanCards = computed<KscanCard[]>(() => {
  const pinId = pinMeta.value?.id;
  if (!pinId) return [];

  const ctx = props.context;

  if (ctx.kscans.length > 0) {
    return ctx.kscans.map((kscan) => {
      const name = kscanLabel(ctx.name, ctx.kscans, kscan.id);
      const kindLabel = kscanKindLabels[kscan.kind] ?? kscan.kind;
      const roles = kscanRoles(kscan.kind).map((role) => {
        const cfg = roleConfig[role] ?? { label: role, color: 'neutral' as BtnColor };
        const label = (kscan.kind === 'charlieplex' && role === 'input') ? $t('role-dual') : $t(cfg.label);
        return { label, color: cfg.color, onSelect: () => emit('assignKscan', pinId, kscan.id, role) };
      });
      return { heading: name, subtitle: $t(kindLabel), roles };
    });
  }

  return newTypes.map(({ kind, label: kindLabel }) => {
    const roles = kscanRoles(kind).map((role) => {
      const cfg = roleConfig[role] ?? { label: role, color: 'neutral' as BtnColor };
      const label = (kind === 'charlieplex' && role === 'input') ? $t('role-dual') : $t(cfg.label);
      return { label, color: cfg.color, onSelect: () => emit('newKscan', pinId, kind, role) };
    });
    return { heading: $t(kindLabel), roles };
  });
});

const kscanCardsHeading = computed(() =>
  $t(props.context.kscans.length > 0 ? 'select-kscan' : 'create-new-kscan'),
);

const newTypes: { kind: KscanDriver['kind']; label: string }[] = [
  { kind: 'matrix', label: 'kscan-kind-matrix' },
  { kind: 'direct', label: 'kscan-kind-direct' },
  { kind: 'charlieplex', label: 'kscan-kind-charlieplex' },
];

const kscanKindLabels: Record<KscanDriver['kind'], string> = {
  matrix: 'kscan-kind-matrix',
  direct: 'kscan-kind-direct',
  charlieplex: 'kscan-kind-charlieplex',
};

/** Available roles for a kscan driver kind. */
function kscanRoles(kind: KscanDriver['kind']): readonly KscanPinRole[] {
  if (kind === 'matrix') return ['input', 'output'];
  if (kind === 'direct') return ['input'];
  return ['input']; // charlieplex
}



function onPopoverClick() {
  if (!isGpio.value) return;
  if (props.usage?.usage === 'kscan') {
    // Non-charlieplex non-interrupt unselected: select on click.
    if (!isCharlieplex.value && !isInterrupt.value && !props.selected) {
      const role: 'input' | 'output' = props.usage.role as 'input' | 'output';
      emit('selectPin', { pinId: pinMeta.value!.id, role });
    }
    // Otherwise (charlieplex, interrupt, or already selected): just open popover.
  } else {
    emit('selectPin', null);
  }
}
</script>
<template>
  <UPopover v-model:open="open" :content="{ side: 'bottom', sideOffset: 8 }">
    <UButton :variant="variant" :color="resolvedColor" :label="label" :class="buttonClass" size="sm"
      @click="onPopoverClick" />
    <template #content>
      <div class="p-3 min-w-52 max-w-[20rem] select-none">
        <!-- Pin header -->
        <div v-if="pinMeta" class="mb-3">
          <div class="font-semibold">{{ pinMeta.label }}</div>
          <div v-if="pinMeta.aliases.length" class="text-sm text-toned mt-0.5">
            {{ $t('aka') }} {{ pinMeta.aliases.join(', ') }}
          </div>
        </div>


        <!-- Assigned state -->
        <template v-if="isAssigned && usageInfo">
          <div class="rounded-lg border border-default p-3 mb-3">
            <div class="flex items-center gap-1.5 mb-1.5">
              <UBadge :color="usageInfo.categoryColor" variant="outline">
                {{ usageInfo.category }}
              </UBadge>
              <UBadge :color="usageInfo.roleColor" variant="outline">
                {{ usageInfo.roleLabel }}
              </UBadge>
            </div>
            <div class="font-medium">{{ usageInfo.name }}</div>
          </div>

          <!-- Selection for key wiring (kscan, non-interrupt only) -->
          <template v-if="isSelectable">
            <template v-if="props.selected">
              <UButton :label="$t('deselect')" variant="subtle" color="neutral" class="w-full justify-center mb-3"
                @click="emit('selectPin', null)" />
            </template>
            <template v-else>
              <template v-if="isCharlieplex">
                <div class="text-sm text-toned mb-1">{{ $t('select-pin-as') }}</div>
                <div class="flex gap-1 mb-3">
                  <UButton :label="$t('role-input')" color="kscanin" variant="outline" class="flex-1 justify-center"
                    @click="emit('selectPin', { pinId: pinMeta!.id, role: 'input' }); open = false" />
                  <UButton :label="$t('role-output')" color="kscanout" variant="outline" class="flex-1 justify-center"
                    @click="emit('selectPin', { pinId: pinMeta!.id, role: 'output' }); open = false" />
                </div>
              </template>
              <template v-else>
                <UButton :label="$t('select-for-wiring', { role: usageInfo!.roleLabel })" :color="usageInfo!.roleColor"
                  variant="outline" class="w-full justify-center mb-3"
                  @click="emit('selectPin', { pinId: pinMeta!.id, role: props.usage!.role as 'input' | 'output' }); open = false" />
              </template>
            </template>
          </template>
          <UButton icon="i-lucide-x" color="error" variant="subtle" :label="$t('unassign')" class="w-full justify-center"
            @click="emit('releasePin', pinMeta!.id); open = false" />
        </template>

        <!-- Unassigned: kscan option cards -->
        <template v-else-if="kscanCards.length">
          <div class="text-sm font-medium uppercase tracking-wider text-toned mb-2">
            {{ kscanCardsHeading }}
          </div>

          <div v-for="(card, ci) in kscanCards" :key="ci" class="rounded-lg border border-default p-2.5 mb-2 last:mb-0">
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
</template>

<ftl locale="en">
# Role labels
role-input = Input
role-output = Output
role-interrupt = Interrupt
role-pin-a = Pin A
role-pin-b = Pin B
# Charlieplex pins serve dual input+output role
role-dual = Dual

# Category labels
category-kscan = {-kscan}
category-encoder = {-encoder}
category-bus = Bus
category-device = Device

# Kscan driver kind names
kscan-kind-matrix = Matrix
kscan-kind-direct = Direct
kscan-kind-charlieplex = Charlieplex

# UI text
deselect = Deselect
select-pin-as = Select pin as
select-for-wiring = Select for wiring ({ $role })
unassign = Unassign
select-kscan = Select {-kscan}
create-new-kscan = Create new {-kscan}
aka = a.k.a.
</ftl>

<ftl locale="zh-CN">
role-input = 输入
role-output = 输出
role-interrupt = 中断
role-pin-a = 引脚 A
role-pin-b = 引脚 B
role-dual = 双向

category-kscan = {-kscan}
category-encoder = {-encoder}
category-bus = 总线
category-device = 设备

kscan-kind-matrix = 矩阵
kscan-kind-direct = 直连
kscan-kind-charlieplex = Charlieplex

deselect = 取消选择
select-pin-as = 选择引脚用途
select-for-wiring = 选择用于接线（{ $role }）
unassign = 取消分配
select-kscan = 选择{-kscan}
create-new-kscan = 创建新{-kscan}
aka = 又称
</ftl>

<ftl locale="ja">
role-input = 入力
role-output = 出力
role-interrupt = 割り込み
role-pin-a = ピン A
role-pin-b = ピン B
role-dual = 双方向

category-kscan = {-kscan}
category-encoder = {-encoder}
category-bus = バス
category-device = デバイス

kscan-kind-matrix = Matrix
kscan-kind-direct = Direct
kscan-kind-charlieplex = Charlieplex

deselect = 選択解除
select-pin-as = ピンの役割を選択
select-for-wiring = 配線として選択（{ $role }）
unassign = 割り当て解除
select-kscan = {-kscan}を選択
create-new-kscan = 新しい{-kscan}を作成
aka = 別名
</ftl>
