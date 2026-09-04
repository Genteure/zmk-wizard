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
            {{ $t('start-subtitle') }}
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 sm:gap-6 w-full">
          <UCard
            class="group h-full transition-colors hover:border-primary/40"
            :ui="{ body: 'flex flex-col gap-4 p-5 sm:p-6' }"
          >
            <div class="flex items-center gap-2.5">
              <div class="size-8 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon
                  name="i-lucide-plus"
                  class="size-4"
                />
              </div>
              <h2 class="text-lg font-semibold leading-tight text-highlighted">
                {{ $t('start-new-title') }}
              </h2>
            </div>

            <p class="text-sm leading-relaxed text-toned">
              {{ $t('start-new-description') }}
            </p>

            <div class="mt-auto pt-1">
              <UButton
                block
                size="md"
                color="primary"
                variant="soft"
                :label="$t('start-new-action')"
                icon="i-lucide-pen-line"
                @click="$emit('new')"
              />
            </div>
          </UCard>

          <UCard
            class="group h-full transition-colors hover:border-secondary/40"
            :ui="{ body: 'flex flex-col gap-4 p-5 sm:p-6' }"
          >
            <div class="flex items-center gap-2.5">
              <div class="size-8 shrink-0 flex items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <UIcon
                  name="i-lucide-folder-git-2"
                  class="size-4"
                />
              </div>
              <h2 class="text-lg font-semibold leading-tight text-highlighted">
                {{ $t('start-edit-title') }}
              </h2>
            </div>

            <p class="text-sm leading-relaxed text-toned">
              {{ $t('start-edit-description') }}
            </p>

            <div class="mt-auto pt-1">
              <UButton
                block
                size="md"
                color="secondary"
                variant="soft"
                :label="$t('start-edit-action')"
                icon="i-lucide-github"
                @click="$emit('edit')"
              />
            </div>
          </UCard>
        </div>

        <ULink
          href="https://github.com/genteure/zmk-wizard"
          class="underline text-sm text-muted"
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
start-subtitle = Design a ZMK keyboard shield graphically, without writing configuration files.

start-new-title = Create a New Shield
start-new-description = Start from a blank configuration, design the layout, then export it as a git repository or ZIP archive.
start-new-action = Start a New Shield

start-edit-title = Edit an Existing Repository
start-edit-description = Sign in, choose a Shield Wizard repository, update the hardware configuration, and save the files back.
start-edit-action = Edit on GitHub
</ftl>

<ftl locale="zh-CN">
start-subtitle = 用图形界面设计 ZMK 键盘 shield，无需手写配置文件。

start-new-title = 新建 Shield
start-new-description = 从空白配置开始设计布局，然后导出为 git 仓库或 ZIP 压缩包。
start-new-action = 开始新建 Shield

start-edit-title = 编辑已有仓库
start-edit-description = 登录并选择一个 Shield Wizard 仓库，更新硬件配置后保存回去。
start-edit-action = 在 GitHub 上编辑
</ftl>

<ftl locale="ja">
start-subtitle = ZMKキーボードシールドを、設定ファイルを書かずにグラフィカルに設計できます。

start-new-title = 新しいシールドを作成
start-new-description = 空の設定からレイアウトを設計し、gitリポジトリまたはZIPアーカイブとして出力します。
start-new-action = 新しいシールドを開始

start-edit-title = 既存のリポジトリを編集
start-edit-description = サインインしてShield Wizardリポジトリを選び、ハードウェア設定を更新して保存し直します。
start-edit-action = GitHubで編集
</ftl>
