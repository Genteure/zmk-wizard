<template>
  <div class="overflow-y-auto p-2 select-none">

    <div class="m-2 flex justify-center items-end gap-4">
      <UFormField :label="$t('part-name')">
        <KeyboardPartName v-model="part.name" :label="$t('part-name')" :placeholder="$t('part-name-placeholder')"
          :description="$t('part-name-desc')" />
      </UFormField>
      <UFormField :label="$t('controller-label')">
        <UFieldGroup>
          <!-- class="flex items-center gap-2 rounded border p-2"> -->
          <UButton :label="controllerMeta.name" color="neutral" variant="outline"
            class="cursor-default select-none pointer-events-none" />
          <UButton :title="$t('select-different-controller')" color="neutral" variant="outline"
            icon="i-lucide-microchip" @click="showControllerModal = true" />
        </UFieldGroup>
      </UFormField>
      <UDropdownMenu :items="copyWiringItems">
        <UButton :title="$t('copy-wiring-title')" color="neutral" variant="outline" icon="i-lucide-copy" />
      </UDropdownMenu>
    </div>
    <div class="flex justify-center mt-4">
      <InputOutputHelp />
    </div>
    <div class="flex justify-center mt-2">
      <div class="border rounded-xl items-center gap-3 flex flex-col p-4">
        <div class="select-none text-lg font-bold text-center">
          {{ controllerMeta.name }}
        </div>
        <div class="flex flex-row flex-nowrap gap-4">
          <div class="flex flex-nowrap flex-col gap-1 pointer-coarse:gap-4">
            <template v-for="(pin, i) in pinVisuals.left" :key="'l-' + i">
              <div class="flex items-center gap-2 pointer-coarse:gap-4">
                <PinButton :pin="pin" :controller-meta="controllerMeta"
                  :usage="pin.kind === 'gpio' ? part.pins[pin.pinId] : undefined" :context="partContext"
                  :selected="pin.kind === 'gpio' && nav.wiringSelection?.pinId === pin.pinId ? nav.wiringSelection.role : false"
                  @assign-kscan="(pid: string, kid: string, role: 'input' | 'output' | 'interrupt') => handleAssignKscan(pid, kid, role)"
                  @new-kscan="(pid: string, kind: 'matrix' | 'direct' | 'charlieplex', role: 'input' | 'output' | 'interrupt') => handleNewKscan(pid, kind, role)"
                  @release-pin="(pid: string) => handleReleasePin(pid)"
                  @select-pin="(payload: { pinId: string; role: 'input' | 'output' } | null) => handleSelectPin(payload)" />
              </div>
            </template>
          </div>
          <div class="flex flex-nowrap flex-col gap-1 pointer-coarse:gap-4">
            <template v-for="(pin, i) in pinVisuals.right" :key="'r-' + i">
              <div class="flex items-center gap-2 pointer-coarse:gap-4">
                <PinButton :pin="pin" :controller-meta="controllerMeta"
                  :usage="pin.kind === 'gpio' ? part.pins[pin.pinId] : undefined" :context="partContext"
                  :selected="pin.kind === 'gpio' && nav.wiringSelection?.pinId === pin.pinId ? nav.wiringSelection.role : false"
                  @assign-kscan="(pid: string, kid: string, role: 'input' | 'output' | 'interrupt') => handleAssignKscan(pid, kid, role)"
                  @new-kscan="(pid: string, kind: 'matrix' | 'direct' | 'charlieplex', role: 'input' | 'output' | 'interrupt') => handleNewKscan(pid, kind, role)"
                  @release-pin="(pid: string) => handleReleasePin(pid)"
                  @select-pin="(payload: { pinId: string; role: 'input' | 'output' } | null) => handleSelectPin(payload)" />
              </div>
            </template>
          </div>
        </div>
        <div>
          <!-- Grid of 2 col on larger screens, 1 col on smaller screens -->
          <div class="flex items-center gap-2">
            <span class="h-4 w-4 rounded bg-amber-600 inline-block"></span>
            <span>Kscan</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="h-4 w-4 rounded bg-blue-600 inline-block"></span>
            <span>{{ $t('encoders') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="h-4 w-4 rounded bg-green-600 inline-block"></span>
            <span>{{ $t('peripheral-devices') }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex justify-center mt-2">
      <UButton :href="controllerMeta.pinref" target="_blank" rel="noopener noreferrer" :label="$t('pinout-reference')"
        icon="i-lucide-external-link" variant="outline" color="neutral" size="sm" />
    </div>

    <ExtPinSection :part="part" @assign-kscan="handleAssignKscan"
      @new-kscan="(pid, kind, role) => handleNewKscan(pid, kind, role)" @release-pin="handleReleasePin"
      @select-pin="handleSelectPin" />

    <KscanPanel :part="part" @add-kscan="keyboard.addKscan(nav.activePart!, $event)"
      @remove-kscan="keyboard.removeKscan(nav.activePart!, $event)"
      @move-kscan="(id, dir) => keyboard.moveKscan(nav.activePart!, id, dir)"
      @patch-kscan="(id, changes) => keyboard.patchKscan(nav.activePart!, id, changes)"
      @assign-pin="keyboard.assignPinToKscan(nav.activePart!, $event.pinId, $event.kscanId, $event.role)"
      @release-pin="keyboard.releasePin(nav.activePart!, $event)" />

    <EncoderPanel :part="part" @add-encoder="keyboard.addEncoder(nav.activePart!)"
      @remove-encoder="keyboard.removeEncoder(nav.activePart!, $event)"
      @move-encoder="(id, dir) => keyboard.moveEncoder(nav.activePart!, id, dir)"
      @set-pin="keyboard.setEncoderPin(nav.activePart!, $event.encoderId, $event.phase, $event.pinId)" />

    <BusDevicePanel :part="part" />
    <ControllerChangeModal v-model="showControllerModal" @confirm="onControllerChange" />
  </div>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import { useKeyboardStore, useNavigationStore } from '~/components/stores.ts';
import type { DropdownMenuItem } from '@nuxt/ui';

import { KeyboardPartSchema, type ControllerId, type KeyboardPart, type PinId } from '~/types';
import { Controllers } from '~/metadata/controllers';
import type { WiringTransform } from '~/lib/wiringMapping';
import { ControllerPinVisuals } from '~/metadata/pins';
import KeyboardPartName from './utils/KeyboardPartName.vue';
import ControllerChangeModal from './utils/ControllerChangeModal.vue';
import PinButton from './utils/PinButton.vue';
import type { PartPinContext } from '~/types/pinContext';
import KscanPanel from './utils/KscanPanel.vue';
import ExtPinSection from './utils/ExtPinSection.vue';
import EncoderPanel from './utils/EncoderPanel.vue';
import BusDevicePanel from './utils/BusDevicePanel.vue';
import InputOutputHelp from './utils/InputOutputHelp.vue';

const { $t } = useFluent();

const nav = useNavigationStore();
const keyboard = useKeyboardStore();

const part = computed<KeyboardPart>(() => {
  if (nav.activePart === null) {
    console.warn('!!! Part editor loaded with no active part.');
    const mockPart = KeyboardPartSchema.parse({
      name: 'My Part',
      controller: 'nice_nano_v2',
    } as Partial<KeyboardPart>);
    return mockPart;
  }
  return keyboard.parts[nav.activePart];
});

const controllerMeta = computed(() => Controllers[part.value.controller]);
const pinVisuals = computed(() => ControllerPinVisuals[part.value.controller]);
const partContext = computed<PartPinContext>(() => ({
  name: part.value.name,
  kscans: part.value.kscans.map((k) => ({ id: k.id, kind: k.kind })),
  encoders: part.value.encoders.map((e) => ({ id: e.id })),
}));
const showControllerModal = ref(false);

function onControllerChange(controllerId: ControllerId) {
  keyboard.changeController(nav.activePart!, controllerId);
}
/** Handle creating a new kscan and assigning a pin to it in one step. */
function handleNewKscan(pinId: string, kind: 'matrix' | 'direct' | 'charlieplex', role: 'input' | 'output' | 'interrupt') {
  if (nav.activePart === null) return;
  keyboard.addKscan(nav.activePart, kind);
  const part = keyboard.parts[nav.activePart];
  const newKscan = part.kscans[part.kscans.length - 1];
  keyboard.assignPinToKscan(nav.activePart, pinId as PinId, newKscan.id, role);
  // Auto-select for key wiring (interrupt and charlieplex pins are not auto-selected).
  if (role !== 'interrupt' && kind !== 'charlieplex') {
    nav.wiringSelection = { pinId: pinId as PinId, role: role as 'input' | 'output' };
  }
}


/** Assign pin to existing kscan and auto-select for key wiring (non-charlieplex only). */
function handleAssignKscan(pinId: string, kscanId: string, role: 'input' | 'output' | 'interrupt') {
  keyboard.assignPinToKscan(nav.activePart!, pinId as PinId, kscanId, role);
  if (role !== 'interrupt') {
    // Only auto-select for non-charlieplex kscans.
    const kscan = keyboard.parts[nav.activePart!].kscans.find((k) => k.id === kscanId);
    if (kscan && kscan.kind !== 'charlieplex') {
      nav.wiringSelection = { pinId: pinId as PinId, role: role as 'input' | 'output' };
    }
  }
}
/** Handle pin selection for key wiring. */
function handleSelectPin(payload: { pinId: string; role: 'input' | 'output' } | null) {
  if (!payload) { nav.wiringSelection = null; return; }

  const usage = part.value.pins[payload.pinId as PinId];
  // Only kscan-assigned, non-interrupt pins are selectable.
  if (usage?.usage !== 'kscan' || usage.role === 'interrupt') {
    nav.wiringSelection = null;
    return;
  }

  nav.wiringSelection = { pinId: payload.pinId as PinId, role: payload.role };
}

/** Release a pin (store watch clears wiring selection automatically). */
function handleReleasePin(pinId: string) {
  keyboard.releasePin(nav.activePart!, pinId as PinId);
}

const copyWiringItems = computed<DropdownMenuItem[][]>(() => {
  if (nav.activePart === null) return [[]];
  const transforms: { label: string; transform: WiringTransform }[] = [
    { label: $t('copy-wiring-direct'), transform: 'none' },
    { label: $t('copy-wiring-mirror-h'), transform: 'flip-horiz' },
    { label: $t('copy-wiring-mirror-v'), transform: 'flip-vert' },
    { label: $t('copy-wiring-mirror-both'), transform: 'flip-both' },
  ];
  const items: DropdownMenuItem[] = [];
  for (let i = 0; i < keyboard.parts.length; i++) {
    if (i === nav.activePart) continue;
    const partName = keyboard.parts[i].name || $t('fallback-part-name', { index: i + 1 });
    items.push({
      label: $t('copy-wiring-from-part', { partName }),
      children: transforms.map(({ label, transform }) => ({
        label,
        onSelect: () => {
          keyboard.copyFromPart(nav.activePart!, i, transform);
        },
      })),
    });
  }
  return [
    [{ type: 'label', label: $t('copy-wiring-from-header') }],
    items,
  ];
});

</script>

<ftl locale="en">
part-name = {-part} Name
part-name-placeholder = Enter part name
part-name-desc = The name of this split keyboard part.
controller-label = {-controller}
select-different-controller = Select a different {-controller}
copy-wiring-title = Copy wiring from another part
copy-wiring-direct = Direct Copy
copy-wiring-mirror-h = Mirrored Horizontally
copy-wiring-mirror-v = Mirrored Vertically
copy-wiring-mirror-both = Mirrored Both
copy-wiring-from-part = From "{ $partName }"
fallback-part-name = {-part} { $index }
copy-wiring-from-header = Copy wiring from ...
pinout-reference = Pinout Reference
encoders = Encoders
peripheral-devices = Peripheral Devices
</ftl>

<ftl locale="zh-CN">
part-name = {-part}名字
part-name-placeholder = 输入分体名字
part-name-desc = 此分体的名称。
controller-label = {-controller}
select-different-controller = 选择其他{-controller}
copy-wiring-title = 从其他分体复制接线
copy-wiring-direct = 直接复制
copy-wiring-mirror-h = 水平镜像
copy-wiring-mirror-v = 垂直镜像
copy-wiring-mirror-both = 双向镜像
copy-wiring-from-part = 从{ $partName }复制
fallback-part-name = {-part} { $index }
copy-wiring-from-header = 从...复制接线
pinout-reference = 引脚参考
encoders = 编码器
peripheral-devices = 外设
</ftl>

<ftl locale="ja">
part-name = {-part}名
part-name-placeholder = パーツ名を入力
part-name-desc = この分割キーボードパーツの名前です。
controller-label = {-controller}
select-different-controller = 別の{-controller}を選択
copy-wiring-title = 他のパーツから配線をコピー
copy-wiring-direct = 直接コピー
copy-wiring-mirror-h = 左右反転
copy-wiring-mirror-v = 上下反転
copy-wiring-mirror-both = 両方向反転
copy-wiring-from-part = { $partName } からコピー
fallback-part-name = {-part} { $index }
copy-wiring-from-header = 配線をコピー...
pinout-reference = ピン配置リファレンス
encoders = エンコーダー
peripheral-devices = 周辺機器
</ftl>
