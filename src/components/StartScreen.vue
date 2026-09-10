<template>
  <div class="min-h-screen flex flex-col">
    <div class="flex items-center justify-end gap-1.5 p-3 sm:gap-2 sm:p-4">
      <LocaleSelect
        v-model="nav.locale"
        :locales="locales"
      />
      <UColorModeSelect />
    </div>

    <main class="flex-1 flex items-center justify-center p-4 pb-16">
      <div class="max-w-3xl w-full flex flex-col items-center gap-8 sm:gap-10">
        <div class="text-center flex flex-col gap-2">
          <h1 class="text-3xl font-bold text-highlighted">
            Shield Wizard for ZMK
          </h1>
          <p class="text-toned">
            {{ $t('subtitle') }}
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 sm:gap-6 w-full">
          <UButton
            color="neutral"
            variant="outline"
            block
            class="h-full w-full text-left flex flex-col gap-3 p-4 sm:p-5 items-start justify-start"
            @click="$emit('new')"
          >
            <div class="flex items-center gap-2.5">
              <div class="size-8 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon
                  name="i-lucide-plus"
                  class="size-4"
                />
              </div>
              <h2 class="text-lg font-semibold leading-tight text-highlighted">
                {{ $t('new-title') }}
              </h2>
            </div>

            <p class="text-sm leading-relaxed text-toned">
              {{ $t('new-desc') }}
            </p>
          </UButton>

          <UButton
            color="neutral"
            variant="outline"
            block
            class="h-full w-full text-left flex flex-col gap-3 p-4 sm:p-5 items-start justify-start"
            :disabled="!githubEnabled"
            @click="$emit('edit')"
          >
            <div class="flex items-center gap-2.5">
              <div class="size-8 shrink-0 flex items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <UIcon
                  name="i-lucide-folder-git-2"
                  class="size-4"
                />
              </div>
              <h2 class="text-lg font-semibold leading-tight text-highlighted">
                {{ $t('edit-title') }}
              </h2>
            </div>

            <p class="text-sm leading-relaxed text-toned">
              {{ $t('edit-desc') }}
            </p>

            <p
              v-if="!githubEnabled"
              class="text-xs leading-relaxed text-warning"
            >
              {{ $t('edit-unavailable') }}
            </p>
          </UButton>
        </div>

        <ULink
          href="https://github.com/genteure/zmk-wizard"
          class="underline text-xs text-dimmed"
          target="_blank"
        >
          https://github.com/genteure/zmk-wizard
        </ULink>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { GITHUB_ENABLED_AT_BUILD as githubEnabled } from './githubConfig';
import { locales } from './locales';
import { useNavigationStore } from './stores.ts';
import LocaleSelect from './utils/LocaleSelect.vue';

defineEmits<{
  new: [];
  edit: [];
}>();

const { $t } = useFluent();
const nav = useNavigationStore();
</script>

<ftl locale="en">
subtitle = Build ZMK shields for custom keyboards, no code needed.

new-title = Create a New Shield
new-desc = Design a new ZMK keyboard, then get a git import link or download a ZIP archive.

edit-title = Edit a Repository
edit-desc = Sign in with GitHub, pick an existing Shield Wizard repository, update the keyboard, and save the files back.
edit-unavailable = GitHub integration is not configured on this server.
</ftl>

<ftl locale="zh-CN">
subtitle = 为自定义键盘搭建 ZMK shield，无需写代码。

new-title = 新建 Shield
new-desc = 设计一个新的 ZMK 键盘，然后获取 git 导入链接或下载 ZIP 压缩包。

edit-title = 编辑仓库
edit-desc = 用 GitHub 账号登录，选择已有的 Shield Wizard 仓库，改完键盘配置后保存回仓库。
edit-unavailable = 此服务器尚未配置 GitHub 集成。
</ftl>

<ftl locale="ja">
subtitle = カスタムキーボード用の ZMK シールドを、コードを書かずに作成できます。

new-title = 新しいシールドを作成
new-desc = 新しい ZMK キーボードを設計し、git インポートリンクを取得するか ZIP アーカイブをダウンロードします。

edit-title = リポジトリを編集
edit-desc = GitHub アカウントでサインインし、既存の Shield Wizard リポジトリを選んでキーボードを更新し、ファイルを保存し直します。
edit-unavailable = このサーバーでは GitHub 連携が設定されていません。
</ftl>
