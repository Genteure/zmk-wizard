<template>
  <div class="min-h-screen flex flex-col">
    <div class="flex items-center justify-end gap-2 p-4">
      <LocaleSelect
        v-model="nav.locale"
        :locales="locales"
      />
      <UColorModeSelect />
    </div>

    <main class="flex-1 flex items-center justify-center p-4 pb-16">
      <div class="max-w-3xl w-full flex flex-col items-center gap-8">
        <div class="text-center flex flex-col gap-2">
          <h1 class="text-3xl font-bold text-highlighted">
            Shield Wizard for ZMK
          </h1>
          <p class="text-toned">
            {{ $t('start-subtitle') }}
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 w-full">
          <UCard class="flex flex-col gap-3">
            <UIcon
              name="i-lucide-plus"
              class="size-8 text-primary"
            />
            <h2 class="text-lg font-semibold text-highlighted">
              {{ $t('start-new-title') }}
            </h2>
            <p class="text-sm text-toned">
              {{ $t('start-new-description') }}
            </p>
            <UButton
              block
              size="lg"
              color="primary"
              variant="soft"
              :label="$t('start-new-action')"
              icon="i-lucide-pen-line"
              @click="$emit('new')"
            />
          </UCard>

          <UCard class="flex flex-col gap-3">
            <UIcon
              name="i-lucide-folder-git-2"
              class="size-8 text-secondary"
            />
            <h2 class="text-lg font-semibold text-highlighted">
              {{ $t('start-edit-title') }}
            </h2>
            <p class="text-sm text-toned">
              {{ $t('start-edit-description') }}
            </p>
            <UButton
              block
              size="lg"
              color="secondary"
              variant="soft"
              :label="$t('start-edit-action')"
              icon="i-lucide-github"
              @click="$emit('edit')"
            />
          </UCard>
        </div>

        <div class="w-full flex flex-col gap-2 items-center">
          <UAlert
            v-if="!githubEnabledAtBuild"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="$t('start-github-not-configured')"
            :description="$t('start-github-not-configured-desc')"
          />

          <UAlert
            v-else-if="workflow.githubError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="$t('start-session-error')"
            :description="workflow.githubError"
          />

          <UCard
            v-else-if="workflow.githubUser"
            class="w-full max-w-md"
          >
            <div class="flex items-center gap-3">
              <UAvatar
                :src="workflow.githubUser.avatarUrl"
                :alt="workflow.githubUser.login"
                size="md"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">
                  {{ workflow.githubUser.login }}
                </div>
                <div class="text-xs text-toned">
                  {{ $t('start-github-signed-in') }}
                </div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="$t('logout')"
                :loading="loggingOut"
                @click="$emit('logout')"
              />
            </div>
          </UCard>

          <!-- Before the first githubGetSession response arrives, show
               nothing instead of guessing "not configured". -->
          <p
            v-else-if="workflow.githubConfigured !== null"
            class="text-sm text-toned"
          >
            {{ $t('start-github-signed-out') }}
          </p>

          <p class="text-xs text-muted max-w-xl text-center">
            {{ $t('start-preserved-files-note') }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { GITHUB_ENABLED_AT_BUILD as githubEnabledAtBuild } from './githubConfig';
import { locales } from './locales';
import { useNavigationStore } from './stores.ts';
import { useWorkflowStore } from './workflow.ts';
import LocaleSelect from './utils/LocaleSelect.vue';

defineProps<{ loggingOut?: boolean }>();
defineEmits<{
  new: [];
  edit: [];
  logout: [];
}>();

const { $t } = useFluent();
const nav = useNavigationStore();
const workflow = useWorkflowStore();
</script>

<ftl locale="en">
start-subtitle = Design a ZMK keyboard shield graphically, without writing configuration files.

start-new-title = Create a New Shield
start-new-description = Start from an empty configuration, design the physical and keymap layouts, wire the matrix, then export a git repository or ZIP archive.
start-new-action = Start a New Shield

start-edit-title = Edit an Existing Repository
start-edit-description = Sign in with GitHub, pick a repository previously generated by Shield Wizard, change the hardware configuration, and save the generated files back.
start-edit-action = Edit on GitHub

start-github-not-configured = GitHub integration is not configured on this server
start-github-not-configured-desc = Ask the administrator to configure the GitHub App credentials documented in docs/deployment.md. New Shield and ZIP export still work.
start-github-signed-in = Signed in to GitHub
start-github-signed-out = Not signed in to GitHub
start-session-error = GitHub session error
start-preserved-files-note = When editing, Shield Wizard never touches config/ and keeps user-modified README.md, build.yaml, and the build workflow. Untouched generated files are refreshed.
logout = Sign Out
</ftl>

<ftl locale="zh-CN">
start-subtitle = 用图形界面设计 ZMK 键盘 shield，无需手写配置文件。

start-new-title = 新建 Shield
start-new-description = 从空白配置开始，设计物理与键位布局、连接矩阵，然后导出 git 仓库或 ZIP 压缩包。
start-new-action = 开始新建 Shield

start-edit-title = 编辑已有仓库
start-edit-description = 使用 GitHub 登录，选择一个由 Shield Wizard 生成的仓库，修改硬件配置后把服务器生成的文件保存回去。
start-edit-action = 在 GitHub 上编辑

start-github-not-configured = 此服务器尚未配置 GitHub 集成
start-github-not-configured-desc = 请联系管理员按照 docs/deployment.md 配置 GitHub App 凭据。新建 Shield 和 ZIP 导出不受影响。
start-github-signed-in = 已登录 GitHub
start-github-signed-out = 尚未登录 GitHub
start-session-error = GitHub 会话错误
start-preserved-files-note = 编辑时 Shield Wizard 绝不会改动 config/，并保留你修改过的 README.md、build.yaml 和构建工作流；未被修改的生成文件会得到更新。
logout = 退出登录
</ftl>

<ftl locale="ja">
start-subtitle = ZMKキーボードシールドを、設定ファイルを書かずにグラフィカルに設計できます。

start-new-title = 新しいシールドを作成
start-new-description = 空の設定から始めて、物理レイアウトとキーマップレイアウトを設計し、配線してからgitリポジトリまたはZIPアーカイブを出力します。
start-new-action = 新しいシールドを開始

start-edit-title = 既存のリポジトリを編集
start-edit-description = GitHubでサインインし、Shield Wizardが生成したリポジトリを選んで、ハードウェア設定を変更してサーバー生成ファイルを保存し直します。
start-edit-action = GitHubで編集

start-github-not-configured = このサーバーではGitHub連携が未設定です
start-github-not-configured-desc = 管理者に docs/deployment.md に従ってGitHub Appの認証情報を設定するよう依頼してください。新規作成とZIP出力は利用できます。
start-github-signed-in = GitHubにサインイン済み
start-github-signed-out = GitHubにサインインしていません
start-session-error = GitHubセッションエラー
start-preserved-files-note = 編集時、Shield Wizardは config/ を変更せず、ユーザーが変更した README.md・build.yaml・ビルドワークフローを保持します。未変更の生成ファイルは更新されます。
logout = サインアウト
</ftl>
