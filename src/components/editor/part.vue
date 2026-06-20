<template>
  <div class="overflow-y-auto p-2 select-none">

    <div class="m-2 flex justify-center items-end gap-4">
      <UFormField label="Part Name">
        <KeyboardPartName v-model="part.name" label="Part Name" placeholder="Enter part name"
          description="The name of this split keyboard part." />
      </UFormField>
      <UFormField label="Controller">
        <UFieldGroup>
          <!-- class="flex items-center gap-2 rounded border p-2"> -->
          <UButton :label="controllerMeta.name" color="neutral" variant="outline"
            class="cursor-default select-none pointer-events-none" />
          <UButton title="Select a different Controller" color="neutral" variant="outline" icon="i-lucide-microchip"
            @click="showControllerModal = true" />
        </UFieldGroup>
      </UFormField>
      <UDropdownMenu :items="copyWiringItems">
        <UButton title="Copy wiring from another part" color="neutral" variant="outline" icon="i-lucide-copy" />
      </UDropdownMenu>
    </div>

    <div class="flex justify-center mt-4">
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
      <UButton :href="controllerMeta.pinref" target="_blank" rel="noopener noreferrer" label="Pinout Reference"
        icon="i-lucide-external-link" variant="outline" color="neutral" size="sm" />
    </div>

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
import EncoderPanel from './utils/EncoderPanel.vue';
import BusDevicePanel from './utils/BusDevicePanel.vue';

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
    { label: 'Direct Copy', transform: 'none' },
    { label: 'Mirrored Horizontally', transform: 'flip-horiz' },
    { label: 'Mirrored Vertically', transform: 'flip-vert' },
    { label: 'Mirrored Both', transform: 'flip-both' },
  ];
  const items: DropdownMenuItem[] = [];
  for (let i = 0; i < keyboard.parts.length; i++) {
    if (i === nav.activePart) continue;
    const partName = keyboard.parts[i].name || `Part ${i + 1}`;
    items.push({
      label: `From "${partName}"`,
      children: transforms.map(({ label, transform }) => ({
        label,
        onSelect: () => {
          keyboard.copyFromPart(nav.activePart!, i, transform);
        },
      })),
    });
  }
  return [
    [{ type: 'label', label: 'Copy wiring from ...' }],
    items,
  ];
});

</script>

<ftl locale="en">
pinout-reference = Pinout Reference

encoders = Encoders
encoders-ec11 = Encoders (EC11)
encoders-desc = EC11-like rotary encoders. Only rotational inputs are configured here, add press-down inputs as direct kscan keys.

peripheral-devices = Peripheral Devices
</ftl>

<ftl locale="zh-CN">
pinout-reference = 引脚参考

encoders = 编码器
encoders-ec11 = 编码器（EC11）

peripheral-devices = 外设
</ftl>

<ftl locale="ja">
pinout-reference = ピン配置リファレンス

encoders = エンコーダー
encoders-ec11 = エンコーダー（EC11）

peripheral-devices = 周辺機器
</ftl>
