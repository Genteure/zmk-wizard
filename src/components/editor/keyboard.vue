<template>
  <div class="overflow-y-auto p-2">

    <UCard :title="$t('external-modules-title')" :description="$t('external-modules-description')">

      <!-- Enabled Modules -->
      <div class="font-bold text-sm mb-2">{{ $t('external-modules-enabled') }}</div>
      <div class="flex flex-col gap-2">
        <div v-if="keyboard.modules.length === 0"
          class="text-toned text-sm italic p-3 rounded-lg ring ring-default bg-muted/40">
          {{ $t('external-modules-none') }}
        </div>
        <div v-for="modId in keyboard.modules" :key="modId"
          class="flex items-center justify-between gap-3 p-3 rounded-lg ring ring-default bg-muted">
          <div class="min-w-0 flex-1">
            <UButton :href="moduleGitUrl(modId)" target="_blank" variant="link" class="p-0">
              {{ moduleMeta(modId)?.name ?? modId }}
            </UButton>
            <div class="text-xs text-toned mt-0.5">
              {{ $t('external-modules-provides', { devices: getDevicesForModule(modId).join(', ') }) }}
            </div>
          </div>
          <UButton icon="i-lucide-minus" color="error" variant="ghost" size="sm" @click="keyboard.removeModule(modId)">
            {{ $t('external-modules-remove') }}
          </UButton>
        </div>
      </div>

      <hr class="my-4 border-default" />

      <!-- Available Modules -->
      <div class="font-bold text-sm mb-2">{{ $t('external-modules-supported') }}</div>
      <div class="flex flex-col gap-2">
        <div v-if="availableModules.length === 0"
          class="text-toned text-sm italic p-3 rounded-lg ring ring-default bg-muted/40">
          {{ $t('external-modules-all-enabled') }}
        </div>
        <div v-for="[modId, meta] in availableModules" :key="modId"
          class="flex items-center justify-between gap-3 p-3 rounded-lg ring"
          :class="moduleConflicts(modId).length ? 'ring-warning/50 bg-warning/5' : 'ring-default bg-muted/40'">
          <div class="min-w-0 flex-1">
            <UButton :href="moduleGitUrl(modId)" target="_blank" variant="link" class="p-0">
              {{ meta.name }}
            </UButton>
            <div class="text-xs text-toned mt-0.5">
              {{ $t('external-modules-provides', { devices: getDevicesForModule(modId).join(', ') }) }}
            </div>
            <div v-if="moduleConflicts(modId).length" class="flex items-center gap-1 text-xs text-warning mt-1">
              <UIcon name="i-lucide-alert-triangle" class="size-3" />
              {{$t('external-modules-conflict-hint', {
                conflicts: moduleConflicts(modId).map(m => moduleMeta(m)?.name
                  ?? m).join(', ')
              })}}
            </div>
          </div>
          <UButton icon="i-lucide-plus" color="success" variant="ghost" size="sm"
            :disabled="moduleConflicts(modId).length > 0" @click="keyboard.addModule(modId)">
            {{ $t('external-modules-add') }}
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard class="mt-4" :title="$t('dongle-title')" :description="$t('dongle-description')">
      <UCheckbox color="primary" variant="card" class="cursor-pointer" v-model="keyboard.dongle"
        :label="$t('dongle-checkbox-label')" :description="$t('dongle-checkbox-description')" />
      <i18n path="dongle-docs-link" tag="p" class="text-toned text-sm mt-4">
        <template #dongleLink="{ dongleLinkLabel }">
          <ULink to="https://zmk.dev/docs/hardware-integration/dongle" target="_blank">{{ dongleLinkLabel }}</ULink>
        </template>
      </i18n>
      <p class="text-toned text-sm mt-2">{{ $t('dongle-checkbox-explanation') }}</p>
      <i18n path="dongle-build-matrix" tag="p" class="text-toned text-sm mt-2">
        <template #buildFile>
          <code class="font-mono text-xs px-1 py-0.5 rounded border border-default">build.yaml</code>
        </template>
      </i18n>
    </UCard>

    <UCard class="mt-4" :title="$t('keymap-title')" :description="$t('keymap-description')">
      <i18n path="keymap-default-explanation" tag="p" class="text-toned text-sm mb-2">
        <template #codeSample>
          <code class="font-mono text-xs px-1 py-0.5 rounded border border-default">&kp A &kp B &kp C …</code>
        </template>
      </i18n>
      <p class="text-toned text-sm mb-2">{{ $t('keymap-layout-explanation') }}</p>
      <i18n path="keymap-create-instructions" tag="p" class="text-toned text-sm">
        <template #afterEmphasis="{ afterLabel }">
          <em>{{ afterLabel }}</em>
        </template>
        <template #keymapFile>
          <code class="font-mono text-xs px-1 py-0.5 rounded border border-default">{{ keyboard.shield }}.keymap</code>
        </template>
      </i18n>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed } from 'vue';
import type { ModuleId } from '~/types';
import { ZMK_MODULES, modulesConflict } from '~/metadata/modules';
import { DEVICE_REGISTRY } from '~/metadata/device';

import { useKeyboardStore } from '../stores';

const { $t } = useFluent();

const keyboard = useKeyboardStore();

/** All known modules from metadata registry, as stable entries array. */
const allModuleEntries = Object.entries(ZMK_MODULES) as [ModuleId, typeof ZMK_MODULES[ModuleId]][];

/** Modules not yet enabled. */
const availableModules = computed(() =>
  allModuleEntries.filter(([modId]) => !keyboard.modules.includes(modId)),
);

function moduleMeta(modId: string) {
  return ZMK_MODULES[modId as ModuleId];
}

function moduleGitUrl(modId: ModuleId): string {
  return ZMK_MODULES[modId]?.gitUrl ?? '#';
}

/** List of enabled module IDs that conflict with the given module. */
function moduleConflicts(modId: ModuleId): ModuleId[] {
  return keyboard.modules.filter((enabled) => modulesConflict(modId, enabled));
}

/** Device type names that require a specific module. */
function getDevicesForModule(modId: ModuleId): string[] {
  return Object.values(DEVICE_REGISTRY)
    .filter((meta) => meta.module === modId)
    .map((meta) => meta.visual.name);
}
</script>

<ftl locale="en">
external-modules-title = External Modules
external-modules-description = External modules provide drivers for pointing devices and other hardware. Add a module to enable its devices in the device configuration.
external-modules-enabled = Enabled Modules
external-modules-none = No external modules enabled
external-modules-remove = Remove
external-modules-supported = Available Modules
external-modules-all-enabled = All available modules are enabled
external-modules-add = Add
external-modules-provides = Provides: { $devices }
external-modules-conflict-hint = Conflicts with: { $conflicts }

dongle-title = Dongle
dongle-description = Dongle setup provides an alternative topology for ZMK devices.
dongle-checkbox-label = Create Dongle Shield
dongle-checkbox-description = Create a shield definition for dongle.

dongle-docs-link = Please see {$dongleLink} page in ZMK documentation for details and implications of using dongle topology.
  .dongle-link-label = Keyboard Dongle

dongle-checkbox-explanation = If the checkbox is checked, Shield Wizard will generate a shield definition for a dongle. The dongle shield can be compiled with any board capable of BLE and supported by ZMK.

dongle-build-matrix = The default build matrix will not include the dongle. You can enable it by editing the generated {$buildFile} file, after you tested the keyboard works with the default build.

keymap-title = Keymap
keymap-description = Shield Wizard does not support editing keymaps.
keymap-default-explanation = Shield Wizard will generate a default keymap ({$codeSample}, looping after Z) for you to test the keyboard.
keymap-layout-explanation = Keymap bindings follow the same order as the keys, which is determined by the keymap layout. Make sure the keymap layout matches how you think of the keys. The keymap layout does not have to match how the keys are electrically wired.
keymap-create-instructions = Please create your own keymap {$afterEmphasis} creating the repository, either by editing the {$keymapFile} file or by using third-party tools like Keymap Editor.
  .after-label = after
</ftl>

<ftl locale="zh-CN">
external-modules-title = 外部模块
external-modules-description = 外部模块提供光标设备和其他硬件的驱动程序。添加模块以在外设配置中使用。
external-modules-enabled = 已启用的模块
external-modules-none = 尚未启用任何外部模块
external-modules-remove = 移除
external-modules-supported = 可用模块
external-modules-all-enabled = 所有可用模块已启用
external-modules-add = 添加
external-modules-provides = 提供：{ $devices }
external-modules-conflict-hint = 与已启用的模块冲突：{ $conflicts }

dongle-title = 接收器 (Dongle)
dongle-description = Dongle 模式为 ZMK 设备提供了一个另一种的拓扑结构。
dongle-checkbox-label = 生成 Dongle Shield

dongle-docs-link = 请参阅 ZMK 文档中的{$dongleLink}页面，了解使用 dongle 拓扑的详细信息和影响。
  .dongle-link-label = Keyboard Dongle

dongle-checkbox-explanation = 如果勾选该复选框，Shield Wizard 将为 dongle 生成一个 shield 定义。dongle shield 可以与任何支持 BLE 且受 ZMK 支持的 board 一起编译。

dongle-build-matrix = 默认构建矩阵不会包含 dongle。在确认键盘在默认构建下正常工作后，你可以通过编辑生成的{$buildFile}文件来启用它。

keymap-title = 键位映射 (Keymap)
keymap-description = Shield Wizard 不支持编辑键位映射。
keymap-default-explanation = Shield Wizard 将生成一个默认的键位映射（{$codeSample}，循环到 Z 后重复），供你测试键盘。
keymap-layout-explanation = 键位映射的绑定顺序与按键顺序一致，由键位映射布局决定。请确保键位映射布局与你的按键排列方式匹配。键位映射布局不必与按键的电气连接方式一致。
keymap-create-instructions = 请在创建仓库{$afterEmphasis}创建你自己的 keymap，可以通过编辑{$keymapFile}文件或使用 Keymap Editor 等第三方工具来完成。
  .after-label = 之后
dongle-checkbox-description = 为 Dongle 生成一个 Shield 定义。
</ftl>

<ftl locale="ja">
external-modules-title = 外部モジュール
external-modules-description = 外部モジュールは、ポインティングデバイスやその他のハードウェアのドライバーを提供します。モジュールを追加すると、デバイス設定でそのデバイスが有効になります。
external-modules-enabled = 有効なモジュール
external-modules-none = 有効になっている外部モジュールはありません
external-modules-remove = 削除
external-modules-supported = 利用可能なモジュール
external-modules-all-enabled = 利用可能なモジュールはすべて有効です
external-modules-add = 追加
external-modules-provides = 提供: { $devices }
external-modules-conflict-hint = 競合: { $conflicts }

dongle-title = ドングル
dongle-description = ドングル設定は、ZMK デバイスに代替トポロジーを提供します。
dongle-checkbox-label = ドングルシールドを作成
dongle-checkbox-description = ドングル用のシールド定義を作成します。

dongle-docs-link = ドングルトポロジの詳細と影響については、ZMK ドキュメントの{$dongleLink}ページを参照してください。
  .dongle-link-label = Keyboard Dongle

dongle-checkbox-explanation = チェックボックスをオンにすると、Shield Wizard はドングル用のシールド定義を生成します。ドングルシールドは、BLE 対応かつ ZMK がサポートする任意のボードでコンパイルできます。

dongle-build-matrix = デフォルトのビルドマトリックスにはドングルは含まれません。キーボードがデフォルトビルドで動作することを確認した後、生成された{$buildFile}ファイルを編集することで有効にできます。

keymap-title = キーマップ
keymap-description = Shield Wizard はキーマップの編集をサポートしていません。
keymap-default-explanation = Shield Wizard はキーボードをテストするためのデフォルトのキーマップ（{$codeSample}、Z の後はループ）を生成します。
keymap-layout-explanation = キーマップのバインディングはキーの順序に従い、その順序はキーマップレイアウトによって決まります。キーマップレイアウトがキーの並びと一致していることを確認してください。キーマップレイアウトはキーの電気的な配線と一致している必要はありません。
keymap-create-instructions = リポジトリを作成した{$afterEmphasis}、{$keymapFile} ファイルを編集するか、Keymap Editor などのサードパーティツールを使用して、独自のキーマップを作成してください。
  .after-label = 後
</ftl>
