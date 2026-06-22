<template>
  <UHeader title="Shield Wizard">
    <template #left>
      <KeyboardNameDialog />
    </template>
    <template #default>
      <div class="flex items-center gap-2">
        <span>Shield Wizard for ZMK v0.3</span>
        <UDropdownMenu :items="menuItems">
          <UButton icon="i-lucide-menu" color="neutral" variant="outline" />
          <template #languages>
            <LocaleSelect class="w-full" :locales="locales" v-model="nav.locale" />
          </template>
          <template #themes>
            <UColorModeSelect class="w-full" />
          </template>
        </UDropdownMenu>
      </div>
    </template>
    <template #right>
      <BuildActions />
    </template>
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="text-lg font-bold text-center">
          Shield Wizard for ZMK v0.3
        </div>
        <div class="flex items-center justify-center gap-4">
          <UColorModeSelect />
          <LocaleSelect :locales="locales" v-model="nav.locale" />
        </div>
        <UNavigationMenu :items="navItems" orientation="vertical" class="-mx-2.5" />
      </div>
    </template>
  </UHeader>
  <UMain class="h-[calc(100vh-var(--ui-header-height))] flex flex-col-reverse lg:flex-row">
    <div
      class="h-1/2 lg:h-full w-full lg:w-2/5 shrink-0 flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-r border-default">
      <Editors />
    </div>
    <div class="h-1/2 lg:h-full w-full lg:w-3/5 shrink-0 flex flex-col overflow-hidden">
      <Graphics />
    </div>
  </UMain>
  <UModal v-model:open="debugOpen" :title="$t('debug-title')">
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-sm text-toned">{{ $t('debug-warning') }}</p>
        <UTextarea v-model="debugData" :rows="20" class="w-full font-mono text-sm" />
        <p v-if="debugError" class="text-sm text-error">{{ debugError }}</p>
        <UButton :label="$t('debug-apply')" color="warning" class="w-full justify-center" @click="applyDebugData" />
      </div>
    </template>
  </UModal>
  <FeedbackDialog v-model:open="feedbackOpen" />
</template>

<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui';
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import { version } from 'virtual:version';
import { KeyboardSchema, type ControllerId } from '~/types';

import Editors from './editor/editors.vue';
import Graphics from './graphic/graphics.vue';
import { locales } from './locales';
import { useKeyboardStore, useNavigationStore } from './stores.ts';
import { Controllers } from '~/metadata/controllers';
import FeedbackDialog from './utils/FeedbackDialog.vue';
import LocaleSelect from './utils/LocaleSelect.vue';
import BuildActions from './utils/BuildActions.vue';

const { $t } = useFluent()

const keyboard = useKeyboardStore();
const nav = useNavigationStore();

const versionLabel = `${version.branch || ''}${version.dirty ? ' • dirty' : ''} ${version.short || version.commit || 'unknown'}`.trim();

function copyVersionInfo() {
  const text = `ZMK Shield Wizard - Version
Branch: ${version.branch || ''}${version.dirty ? ' (dirty)' : ''}
Commit: ${version.commit || '(unknown)'}
Tag: ${version.tag || '(none)'}
Generated At: ${version.buildDate || '(unknown)'}
`;
  navigator.clipboard.writeText(text);
}


const debugOpen = ref(false);
const debugData = ref('');
const debugError = ref('');

function openDebugDialog() {
  debugData.value = JSON.stringify(keyboard.$state, null, 2).replace(/(\d,)\n +/g, '$1 ');
  debugError.value = '';
  debugOpen.value = true;
}
const feedbackOpen = ref(false);
function openFeedbackDialog() {
  feedbackOpen.value = true;
}
function applyDebugData() {
  try {
    const result = KeyboardSchema.parse(JSON.parse(debugData.value));
    keyboard.$patch(() => {
      Object.assign(keyboard.$state, result);
      // Seed pins for each part (same logic as changeController)
      for (const part of keyboard.$state.parts) {
        const gpios = Controllers[part.controller]?.gpios;
        if (!gpios) continue;
        for (const pinId of Object.keys(gpios)) {
          if (!(pinId in part.pins)) {
            part.pins[pinId as keyof typeof part.pins] = undefined;
          }
        }
      }
    });
    debugError.value = '';
    debugOpen.value = false;
  } catch (e) {
    debugError.value = (e as Error).message;
  }
}

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      slot: 'languages',
      class: 'block',
      onSelect(e) { e.preventDefault() },
    },
    {
      slot: 'themes',
      class: 'block',
      onSelect(e) { e.preventDefault() },
    },
  ],
  [
    {
      label: $t('menu-zmk-docs'),
      icon: 'i-lucide-book-open',
      children: [
        { label: 'Keymaps & Behaviors', to: 'https://zmk.dev/docs/keymaps', target: '_blank' },
        { label: 'Configuration Overview', to: 'https://zmk.dev/docs/config', target: '_blank' },
        { label: 'Encoders', to: 'https://zmk.dev/docs/features/encoders', target: '_blank' },
        { label: 'ZMK Studio', to: 'https://zmk.dev/docs/features/studio', target: '_blank' },
        { label: 'New Keyboard Shield', to: 'https://zmk.dev/docs/development/hardware-integration/new-shield', target: '_blank' },
      ],
    },
    { label: 'Keymap Layout Helper', icon: 'i-lucide-external-link', to: 'https://nickcoutsos.github.io/keymap-layout-tools/', target: '_blank' },
    { label: 'Keymap Editor', icon: 'i-lucide-external-link', to: 'https://nickcoutsos.github.io/keymap-editor/', target: '_blank' },
  ],
  [
    { label: $t('menu-next-steps'), icon: 'i-lucide-circle-help', to: '/next-steps', target: '_blank' },
    { label: $t('menu-discord'), icon: 'i-lucide-messages-square', to: 'https://zmk.dev/community/discord/invite', target: '_blank' },
    { label: $t('menu-github'), icon: 'i-lucide-github', to: 'https://github.com/Genteure/zmk-wizard', target: '_blank' },
  ],
  [
    {
      label: versionLabel,
      icon: 'i-lucide-git-branch',
      class: 'font-mono text-xs items-center',
      onSelect() { copyVersionInfo() },
    },
    {
      label: $t('menu-feedback'),
      icon: 'i-lucide-message-square-plus',
      onSelect() { openFeedbackDialog() },
    },
    {
      label: $t('menu-debug'),
      icon: 'i-lucide-bug',
      children: [
        { label: $t('menu-debug-data'), onSelect() { openDebugDialog() } },
      ],
    },
  ],
]);

const navItems = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: $t('menu-zmk-docs'),
      icon: 'i-lucide-book-open',
      children: [
        { label: 'Keymaps & Behaviors', href: 'https://zmk.dev/docs/keymaps', target: '_blank' },
        { label: 'Configuration Overview', href: 'https://zmk.dev/docs/config', target: '_blank' },
        { label: 'Encoders', href: 'https://zmk.dev/docs/features/encoders', target: '_blank' },
        { label: 'ZMK Studio', href: 'https://zmk.dev/docs/features/studio', target: '_blank' },
        { label: 'New Keyboard Shield', href: 'https://zmk.dev/docs/development/hardware-integration/new-shield', target: '_blank' },
      ],
    },
    { label: 'Keymap Layout Helper', icon: 'i-lucide-external-link', href: 'https://nickcoutsos.github.io/keymap-layout-tools/', target: '_blank' },
    { label: 'Keymap Editor', icon: 'i-lucide-external-link', href: 'https://nickcoutsos.github.io/keymap-editor/', target: '_blank' },
  ],
  [
    { label: $t('menu-community'), type: 'label' },
    { label: $t('menu-next-steps'), icon: 'i-lucide-circle-help', href: '/next-steps', target: '_blank' },
    { label: $t('menu-discord'), icon: 'i-lucide-messages-square', href: 'https://zmk.dev/community/discord/invite', target: '_blank' },
    { label: $t('menu-github'), icon: 'i-lucide-github', href: 'https://github.com/Genteure/zmk-wizard', target: '_blank' },
  ],
  [
    {
      label: versionLabel,
      icon: 'i-lucide-git-branch',
      class: 'font-mono text-xs',
      onSelect() { copyVersionInfo() },
    },
    {
      label: $t('menu-feedback'),
      icon: 'i-lucide-message-square-plus',
      onSelect() { openFeedbackDialog() },
    },
    {
      label: $t('menu-debug'),
      icon: 'i-lucide-bug',
      children: [
        { label: $t('menu-debug-data'), onSelect() { openDebugDialog() } },
      ],
    },
  ],
]);

</script>

<ftl locale="en">
build = Build

menu-zmk-docs = ZMK Documentation
menu-community = Community
menu-next-steps = What to do after this?
menu-discord = ZMK Community Discord
menu-feedback = Feedback
menu-github = Shield Wizard GitHub
menu-debug = Debug Options
menu-debug-data = Show Internal Data
debug-title = Internal Data
debug-warning = Warning: Debug-only. Applying data will replace the current keyboard configuration and may produce invalid or unsupported state. Use only with trusted data and at your own risk.
debug-apply = Apply Debug Data
</ftl>

<ftl locale="zh-CN">
build = 生成

menu-discord = ZMK 社区 Discord
menu-zmk-docs = ZMK 文档
menu-community = 社区
menu-next-steps = 接下来做什么？
menu-github = Shield Wizard GitHub
menu-feedback = 反馈
menu-debug = 调试选项
menu-debug-data = 查看内部数据
debug-title = 内部数据
debug-warning = 警告：仅供调试。应用数据将替换当前键盘配置，可能产生无效或不支持的状态。仅限受信任的数据，风险自负。
debug-apply = 应用调试数据
</ftl>

<ftl locale="ja">
build = 生成

menu-zmk-docs = ZMK ドキュメント
menu-next-steps = この後どうする？
menu-community = コミュニティ
menu-discord = ZMK コミュニティ Discord
menu-github = Shield Wizard GitHub
menu-feedback = フィードバック
menu-debug = デバッグオプション
menu-debug-data = 内部データを表示
debug-title = 内部データ
debug-warning = 警告：デバッグ専用です。データを適用すると現在のキーボード設定が置き換えられ、無効または未対応の状態が生じる可能性があります。信頼できるデータのみ使用し、自己責任でお願いします。
debug-apply = デバッグデータを適用
</ftl>
