<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useFluent } from 'fluent-vue';
import { computed } from 'vue';
import { useKeyboardStore } from '~/components/stores';
import { Controllers } from '~/metadata/controllers';
import { DEVICE_REGISTRY, getDeviceMeta, type DeviceTypeName } from '~/metadata/device';
import type { AnyBusDevice, BusPinRole, KeyboardPart, PinId } from '~/types';
import { useBusAvailability, type BusStatus } from './useBusAvailability';

const { $t } = useFluent();

const props = defineProps<{
  part: KeyboardPart;
}>();

const keyboard = useKeyboardStore();

const controllerMeta = computed(() => Controllers[props.part.controller]);
const partBuses = computed(() => props.part.buses as Record<string, { type: string; devices: AnyBusDevice[] }>);

const { busStatuses, deviceAvailable, canAddToBus } = useBusAvailability(
  () => props.part,
  () => props.part.controller,
  () => keyboard.modules,
);

// ─── Device type buttons → dropdown menu for bus selection ──────

/** Device types that can be used with currently enabled modules. */
const availableDeviceTypes = computed(() =>
  (Object.keys(DEVICE_REGISTRY) as DeviceTypeName[]).filter((dtype) => {
    const meta = getDeviceMeta(dtype);
    // No module requirement → always available
    if (!meta.module) return true;
    // Module required → check it's enabled
    return keyboard.modules.includes(meta.module);
  }),
);

/** Number of device types whose module is not enabled. */
const moduleBlockedCount = computed(() =>
  (Object.keys(DEVICE_REGISTRY) as DeviceTypeName[]).filter((dtype) => {
    const meta = getDeviceMeta(dtype);
    return meta.module && !keyboard.modules.includes(meta.module);
  }).length,
);

/** Build dropdown items for a device type: one per compatible bus. */
function busDropdownItems(deviceType: DeviceTypeName): DropdownMenuItem[] {
  const fullName = getDeviceMeta(deviceType).visual.name;
  const labelItem = { type: 'label' as const, label: fullName };
  const busItems = busStatuses.value
    .filter((b) => canAddToBus(deviceType, b.name))
    .map((bus) => ({
      label: bus.name + ' (' + bus.type.toUpperCase() + ')',
      onSelect: () => onAddDeviceToBus(bus.name, deviceType),
    }));
  return [labelItem, ...busItems];
}

function onAddDeviceToBus(busName: string, deviceType: DeviceTypeName) {
  const partIdx = keyboard.parts.indexOf(props.part);
  if (partIdx < 0) return;
  keyboard.addDevice(partIdx, busName, deviceType);
}

// ─── Pin Helpers ──────────────────────────────────────────────

const NONE_SENTINEL = '__none__';

function pinLabel(pinId: PinId): string {
  return controllerMeta.value.gpios[pinId]?.label ?? pinId;
}

const SPI_MISO_MOSI_PAIR: Record<string, string> = { miso: 'mosi', mosi: 'miso' };

function freePinOptions(currentPin?: string, busName?: string, role?: string) {
  const pairedRole = busName && role ? SPI_MISO_MOSI_PAIR[role] : undefined;
  return Object.entries(props.part.pins)
    .filter(([id, u]) => {
      if (!u || id === currentPin) return true;
      // Allow pin if it's the paired SPI data role on the same bus (miosio sharing)
      if (pairedRole && u.usage === 'bus' && u.bus === busName && u.role === pairedRole) return true;
      return false;
    })
    .map(([id]) => ({ label: pinLabel(id as PinId), value: id }));
}

function pinSelectOptions(currentPin?: string, busName?: string, role?: string) {
  return [{ label: '\u2014 none \u2014', value: NONE_SENTINEL }, ...freePinOptions(currentPin, busName, role)];
}

function busPin(busName: string, role: string): PinId | undefined {
  for (const [pinId, usage] of Object.entries(props.part.pins)) {
    if (usage?.usage !== 'bus' || usage.bus !== busName) continue;
    if (usage.role === role) return pinId as PinId;
    // miosio means miso + mosi on the same pin (half-duplex SPI)
    if (usage.role === 'miosio' && (role === 'miso' || role === 'mosi')) return pinId as PinId;
  }
  return undefined;
}

function devicePin(deviceId: string, role: string): PinId | undefined {
  for (const [pinId, usage] of Object.entries(props.part.pins)) {
    if (usage?.usage === 'device' && usage.deviceId === deviceId && usage.role === role) {
      return pinId as PinId;
    }
  }
  return undefined;
}

function onBusPinChange(busName: string, role: BusPinRole, value: string) {
  const partIdx = keyboard.parts.indexOf(props.part);
  if (partIdx < 0) return;

  const current = busPin(busName, role);
  if (current) {
    const pairedRole = SPI_MISO_MOSI_PAIR[role];
    const currentUsage = props.part.pins[current];
    if (pairedRole && currentUsage?.usage === 'bus' && currentUsage.role === 'miosio') {
      // Pin is shared as miosio. Converting to the other role keeps the pin assigned.
      keyboard.assignBusPin(partIdx, current, busName, pairedRole as BusPinRole);
    } else {
      keyboard.releasePin(partIdx, current);
    }
  }

  if (value === NONE_SENTINEL) return;
  const targetPin = value as PinId;

  // If paired role already uses this pin, merge into miosio.
  const pairedRole = SPI_MISO_MOSI_PAIR[role];
  if (pairedRole && busPin(busName, pairedRole) === targetPin) {
    const existingPin = busPin(busName, pairedRole)!;
    keyboard.assignBusPin(partIdx, existingPin, busName, 'miosio' as BusPinRole);
  } else {
    keyboard.assignBusPin(partIdx, targetPin, busName, role);
  }
}

function onDevicePinChange(deviceId: string, role: string, value: string) {
  const partIdx = keyboard.parts.indexOf(props.part);
  if (partIdx < 0) return;
  const current = devicePin(deviceId, role);
  if (current) keyboard.releasePin(partIdx, current);
  if (value !== NONE_SENTINEL) {
    keyboard.assignDevicePin(partIdx, value as PinId, deviceId, role);
  }
}

// ─── Device Property Editing ──────────────────────────────────

function onDevicePropChange(busName: string, deviceId: string, key: string, value: unknown) {
  const partIdx = keyboard.parts.indexOf(props.part);
  if (partIdx < 0) return;
  keyboard.patchDevice(partIdx, busName, deviceId, { [key]: value });
}

// ─── Device Removal ───────────────────────────────────────────

function onRemoveDevice(busName: string, deviceId: string) {
  const partIdx = keyboard.parts.indexOf(props.part);
  if (partIdx < 0) return;
  keyboard.removeDevice(partIdx, busName, deviceId);
}

// ─── Device Metadata Lookup ───────────────────────────────────

function deviceMetaFor(type: string) {
  return getDeviceMeta(type as DeviceTypeName);
}

// ─── Status Badge Helpers ─────────────────────────────────────

function statusBadgeColor(status: BusStatus) {
  switch (status) {
    case 'active': return 'success' as const;
    case 'inactive': return 'neutral' as const;
    case 'unavailable': return 'warning' as const;
  }
}

</script>

<template>
  <UCard class="mt-4">
    <template #title>
      {{ $t('peripheral-devices') }}
    </template>
    <template #description>
      {{ $t('peripheral-devices-desc') }}
    </template>

    <div class="text-sm font-medium text-base-content/70">{{ $t('add-peripheral-device') }}</div>

    <div class="flex flex-wrap gap-2 mt-2">
      <UDropdownMenu v-for="dtype in availableDeviceTypes" :key="dtype" :items="busDropdownItems(dtype)"
        :disabled="!deviceAvailable(dtype)" :ui="{ itemWrapper: 'items-center' }">
        <UButton :label="deviceMetaFor(dtype).visual.short" variant="subtle" size="sm" color="neutral"
          :disabled="!deviceAvailable(dtype)" />
      </UDropdownMenu>
    </div>

    <div class="text-muted text-xs mt-0.5">
      {{ $t('device-driver-count', { available: availableDeviceTypes.length, blocked: moduleBlockedCount }) }}
    </div>

    <div class="flex flex-col gap-3 mt-4">
      <div v-for="busStatus in busStatuses" :key="busStatus.name" class="rounded-xl p-3 ring ring-default"
        :class="busStatus.status === 'active' ? 'bg-muted' : 'bg-muted/40'">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UBadge variant="outline" size="sm">
              {{ busStatus.type.toUpperCase() }}
            </UBadge>
            <span class="text-base font-medium">{{ busStatus.name }}</span>
          </div>
          <UBadge :color="statusBadgeColor(busStatus.status)" variant="outline" size="sm">
            {{ $t(busStatus.status === 'active' ? 'bus-status-active' : busStatus.status === 'inactive' ? 'bus-status-inactive' : 'bus-status-unavailable') }}
          </UBadge>
        </div>

        <template v-if="busStatus.status === 'active'">
          <div v-if="busStatus.available.length" class="mt-2">
            <span class="text-xs text-base-content/60 font-semibold">{{ $t('bus-pins') }}</span>
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-2 items-end mt-1">
              <UFormField v-for="role in busStatus.available" :key="`${busStatus.name}-${role}`"
                :label="role.toUpperCase()" :required="busStatus.requires.includes(role)" class="min-w-24">
                <USelect :model-value="busPin(busStatus.name, role) ?? NONE_SENTINEL"
                  :items="pinSelectOptions(busPin(busStatus.name, role), busStatus.name, role)" size="sm"
                  class="w-full"
                  @update:model-value="(v: string) => onBusPinChange(busStatus.name, role as BusPinRole, v)" />
              </UFormField>
            </div>
          </div>

          <div class="mt-3 flex flex-col gap-2">
            <div v-for="device in (partBuses[busStatus.name]?.devices ?? [])" :key="device.id"
              class="rounded-lg bg-default ring ring-accented px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-sm">
                  {{ deviceMetaFor(device.type)?.visual.name ?? device.type }}
                </span>
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm"
                  @click.stop="onRemoveDevice(busStatus.name, device.id)" />
              </div>
              <div class="mt-3 space-y-3">
                <div v-if="deviceMetaFor(device.type)?.props">
                  <div class="text-xs text-base-content/60 font-semibold mb-2">{{ $t('device-properties') }}</div>
                  <div class="grid grid-cols-2 lg:grid-cols-3 gap-2 items-end">
                    <template v-for="(propMeta, propKey) in deviceMetaFor(device.type)!.props" :key="propKey">
                      <UFormField v-if="propMeta.widget === 'dec'" :label="propMeta.label ?? propKey" :required="propMeta.required">
                        <UInput type="number" :model-value="Number((device as Record<string, unknown>)[propKey] ?? 0)"
                          :min="propMeta.min" :max="propMeta.max" size="sm" class="w-full"
                          @update:model-value="(v: number) => onDevicePropChange(busStatus.name, device.id, propKey, v)" />
                      </UFormField>

                      <UFormField v-if="propMeta.widget === 'hex'" :label="propMeta.label ?? propKey" :required="propMeta.required">
                        <UInput :model-value="'0x' + (Number((device as Record<string, unknown>)[propKey] ?? 0)).toString(16)"
                          size="sm" class="w-full font-mono"
                          @update:model-value="(v: string) => { const n = parseInt(v, 16); if (!isNaN(n)) onDevicePropChange(busStatus.name, device.id, propKey, n); }" />
                      </UFormField>

                      <UFormField v-if="propMeta.widget === 'numberOptions'" :label="propMeta.label ?? propKey" :required="propMeta.required">
                        <USelect :model-value="Number((device as Record<string, unknown>)[propKey]) || undefined"
                          :items="(propMeta.options ?? []).map(o => ({ label: String(o), value: o as number }))" size="sm"
                          class="w-full"
                          @update:model-value="(v) => onDevicePropChange(busStatus.name, device.id, propKey, Number(v))" />
                      </UFormField>

                      <UFormField v-if="propMeta.widget === 'stringOptions'" :label="propMeta.label ?? propKey" :required="propMeta.required">
                        <USelect :model-value="String((device as Record<string, unknown>)[propKey] ?? '') || undefined"
                          :items="Array.from(propMeta.options ?? []).map(o => ({ label: String(o), value: o as string }))"
                          size="sm" class="w-full"
                          @update:model-value="(v) => onDevicePropChange(busStatus.name, device.id, propKey, String(v))" />
                      </UFormField>
                      <UFormField v-if="propMeta.widget === 'checkbox'" :label="propMeta.label ?? propKey" :required="propMeta.required">
                        <UCheckbox :model-value="Boolean((device as Record<string, unknown>)[propKey])"
                          @update:model-value="(v: boolean | 'indeterminate') => onDevicePropChange(busStatus.name, device.id, propKey, !!v)" />
                      </UFormField>
                    </template>
                  </div>
                </div>

                <div v-if="Object.keys(deviceMetaFor(device.type)?.gpio ?? {}).length">
                  <div class="text-xs text-base-content/60 font-semibold mb-2">{{ $t('device-gpios') }}</div>
                  <div class="grid grid-cols-2 lg:grid-cols-3 gap-2 items-end">
                    <UFormField v-for="(gpioMeta, gpioRole) in deviceMetaFor(device.type)!.gpio" :key="gpioRole"
                      :label="gpioMeta.label" :description="gpioMeta.desc">
                      <USelect :model-value="devicePin(device.id, gpioRole) ?? NONE_SENTINEL"
                        :items="pinSelectOptions(devicePin(device.id, gpioRole))" size="sm" class="w-full"
                        @update:model-value="(v: string) => onDevicePinChange(device.id, gpioRole, v)" />
                    </UFormField>
                  </div>
                </div>

                <div
                  v-if="!Object.keys(deviceMetaFor(device.type)?.props ?? {}).length && !Object.keys(deviceMetaFor(device.type)?.gpio ?? {}).length"
                  class="text-xs text-base-content/40">
                  {{ $t('device-no-config') }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <div v-if="busStatus.status === 'inactive' || busStatus.status === 'unavailable'"
          class="text-xs text-base-content/40 mt-2">
          {{ busStatus.status === 'unavailable' ? $t('bus-unavailable-hint') : $t('bus-inactive-hint') }}
        </div>
      </div>
    </div>
  </UCard>
</template>

<ftl locale="en">
peripheral-devices = Peripheral Devices
peripheral-devices-desc = Accessories on I2C or SPI, e.g. displays, trackballs, etc.
add-peripheral-device = Add Peripheral Device
bus-status-active = Active
bus-status-inactive = Inactive
bus-status-unavailable = Unavailable
bus-pins = Bus Pins:
device-properties = Properties
device-gpios = GPIO Pins
device-no-config = No properties or GPIOs to configure for this device.
bus-unavailable-hint = Bus unavailable due to conflicts.
bus-inactive-hint = No devices on this bus. Add one using the buttons above.
device-driver-count = { $available } { $available ->
  [one] device driver
 *[other] device drivers
} available. { $blocked } more available after enabling external modules.
</ftl>

<ftl locale="zh-CN">
peripheral-devices = 外设
peripheral-devices-desc = I2C 或 SPI 外设，例如显示屏、轨迹球等。
add-peripheral-device = 添加外设
bus-status-active = 使用中
bus-status-inactive = 未使用
bus-status-unavailable = 不可用
bus-pins = 总线引脚：
device-properties = 属性
device-gpios = GPIO 引脚
device-no-config = 此设备无需配置属性或 GPIO。
bus-unavailable-hint = 由于冲突，此总线不可用。
bus-inactive-hint = 此总线上没有设备。请使用上方按钮添加。
device-driver-count = { $available } 个设备驱动可用。另有 { $blocked } 个需要启用外部模块后可用。
</ftl>

<ftl locale="ja">
peripheral-devices = 周辺機器
peripheral-devices-desc = I2CまたはSPI上のアクセサリ（例：ディスプレイ、トラックボールなど）
add-peripheral-device = 周辺機器を追加
bus-status-active = アクティブ
bus-status-inactive = 非アクティブ
bus-status-unavailable = 使用不可
bus-pins = バスピン：
device-properties = プロパティ
device-gpios = GPIOピン
device-no-config = このデバイスに設定するプロパティやGPIOはありません。
bus-unavailable-hint = 競合のため、このバスは使用できません。
bus-inactive-hint = このバスにはデバイスがありません。上のボタンで追加してください。
device-driver-count = { $available } 個のデバイスドライバが利用可能です。外部モジュールを有効にすると、さらに { $blocked } 個利用可能になります。
</ftl>
