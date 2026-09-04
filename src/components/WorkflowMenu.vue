<template>
  <UDropdownMenu
    :items="menuItems"
    :content="{ align: 'end', sideOffset: 8 }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="max-w-44"
    >
      <UIcon
        :name="workflow.isEditing ? 'i-lucide-folder-git-2' : 'i-lucide-pen-line'"
        class="size-4 shrink-0"
      />
      <span class="truncate">
        {{ modeLabel }}
      </span>
      <UAvatar
        v-if="workflow.githubUser"
        :src="workflow.githubUser.avatarUrl"
        :alt="workflow.githubUser.login"
        size="2xs"
      />
    </UButton>
  </UDropdownMenu>

  <UModal
    v-model:open="confirmOpen"
    :title="confirmTitle"
    :description="confirmDescription"
  >
    <template #body>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="$t('wf-cancel')"
          @click="confirmOpen = false"
        />
        <UButton
          :color="confirmColor"
          :label="$t('wf-confirm-action')"
          @click="confirmPendingAction"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import { useWorkflowStore } from './workflow';

type PendingAction = 'new' | 'edit' | 'logout' | 'login' | null;

const emit = defineEmits<{
  new: [];
  edit: [];
  logout: [];
  login: [];
}>();

const { $t } = useFluent();
const workflow = useWorkflowStore();

const confirmOpen = ref(false);
const pendingAction = ref<PendingAction>(null);

const modeLabel = computed(() => {
  if (workflow.isEditing && workflow.editingRepository) {
    return workflow.editingRepository.fullName;
  }
  if (workflow.githubUser) {
    return workflow.githubUser.login;
  }
  return $t('wf-new-shield');
});

const confirmTitle = computed(() => {
  switch (pendingAction.value) {
    case 'new': return $t('wf-confirm-new-title');
    case 'edit': return $t('wf-confirm-edit-title');
    case 'logout': return $t('wf-confirm-logout-title');
    case 'login': return $t('wf-confirm-login-title');
    default: return $t('wf-confirm-title');
  }
});

const confirmDescription = computed(() => {
  if (workflow.isEditing && pendingAction.value !== null) {
    return $t('wf-leave-edit-warning');
  }
  switch (pendingAction.value) {
    case 'new': return $t('wf-confirm-new-description');
    case 'edit': return $t('wf-confirm-edit-description');
    case 'logout': return $t('wf-confirm-logout-description');
    case 'login': return $t('wf-confirm-login-description');
    default: return $t('wf-confirm-description');
  }
});

const confirmColor = computed(() => (pendingAction.value === 'logout' ? 'error' : 'primary'));

function requestAction(action: NonNullable<PendingAction>): void {
  pendingAction.value = action;
  confirmOpen.value = true;
}

function confirmPendingAction(): void {
  const action = pendingAction.value;
  pendingAction.value = null;
  confirmOpen.value = false;
  if (action === 'new') emit('new');
  if (action === 'edit') emit('edit');
  if (action === 'logout') emit('logout');
  if (action === 'login') emit('login');
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[][] = [];

  if (workflow.isEditing) {
    items.push([
      {
        label: $t('wf-view-repo'),
        icon: 'i-lucide-external-link',
        to: workflow.editingRepository?.htmlUrl ?? 'https://github.com',
        target: '_blank',
      },
      {
        label: $t('wf-edit-other'),
        icon: 'i-lucide-folder-search',
        onSelect() { requestAction('edit'); },
      },
    ]);
  }

  items.push([
    {
      label: $t('wf-new-shield'),
      icon: 'i-lucide-pen-line',
      color: workflow.isNew ? 'primary' : 'neutral',
      onSelect() { requestAction('new'); },
    },
    {
      label: $t('wf-edit-repo'),
      icon: 'i-lucide-github',
      color: workflow.isEditing ? 'primary' : 'neutral',
      onSelect() { requestAction('edit'); },
    },
  ]);

  if (workflow.githubUser) {
    items.push([
      {
        label: `${$t('wf-signed-in-as')} ${workflow.githubUser.login}`,
        avatar: { src: workflow.githubUser.avatarUrl, alt: workflow.githubUser.login },
        onSelect(e) { e.preventDefault(); },
      },
      {
        label: $t('logout'),
        icon: 'i-lucide-log-out',
        color: 'error',
        onSelect() { requestAction('logout'); },
      },
    ]);
  }
  else {
    items.push([
      { type: 'separator' },
      {
        label: $t('wf-connect-github'),
        icon: 'i-lucide-log-in',
        onSelect() { requestAction('login'); },
      },
    ]);
  }

  return items;
});
</script>

<ftl locale="en">
wf-new-shield = New Shield
wf-edit-repo = Edit Existing Repository
wf-edit-other = Edit a Different Repository
wf-view-repo = View Repository on GitHub
wf-signed-in-as = Signed in as
wf-connect-github = Connect to GitHub
wf-confirm-title = Switch Workflow?
wf-confirm-description = Switch to this workflow?
wf-confirm-new-title = Start a New Shield?
wf-confirm-new-description = Start a new Shield and discard the current configuration?
wf-confirm-edit-title = Edit Existing Repository?
wf-confirm-edit-description = Open the GitHub repository picker?
wf-confirm-logout-title = Sign Out?
wf-confirm-logout-description = Sign out of GitHub?
wf-confirm-login-title = Connect to GitHub?
wf-confirm-login-description = Sign in to GitHub so you can edit existing repositories.
wf-leave-edit-warning = Your unsaved edits in this tab will be discarded. Save to GitHub first if you want to keep them.
wf-confirm-action = Continue
wf-cancel = Cancel
</ftl>

<ftl locale="zh-CN">
wf-new-shield = 新建 Shield
wf-edit-repo = 编辑已有仓库
wf-edit-other = 编辑其他仓库
wf-view-repo = 在 GitHub 上查看仓库
wf-signed-in-as = 已登录为
wf-connect-github = 连接到 GitHub
wf-confirm-title = 切换工作流？
wf-confirm-description = 切换到该工作流？
wf-confirm-new-title = 开始新建 Shield？
wf-confirm-new-description = 开始新建 Shield 并丢弃当前配置？
wf-confirm-edit-title = 编辑已有仓库？
wf-confirm-edit-description = 打开 GitHub 仓库选择器？
wf-confirm-logout-title = 退出登录？
wf-confirm-logout-description = 退出 GitHub 登录？
wf-confirm-login-title = 连接到 GitHub？
wf-confirm-login-description = 登录 GitHub 以编辑已有仓库。
wf-leave-edit-warning = 当前标签页中未保存的修改将被丢弃。如需保留，请先保存到 GitHub。
wf-confirm-action = 继续
wf-cancel = 取消
</ftl>

<ftl locale="ja">
wf-new-shield = 新しいシールド
wf-edit-repo = 既存のリポジトリを編集
wf-edit-other = 別のリポジトリを編集
wf-view-repo = GitHubでリポジトリを表示
wf-signed-in-as = サインイン中:
wf-connect-github = GitHubに接続
wf-confirm-title = ワークフローを切り替えますか？
wf-confirm-description = このワークフローに切り替えますか？
wf-confirm-new-title = 新しいシールドを開始しますか？
wf-confirm-new-description = 新しいシールドを開始し、現在の設定を破棄しますか？
wf-confirm-edit-title = 既存のリポジトリを編集しますか？
wf-confirm-edit-description = GitHubのリポジトリ選択を開きますか？
wf-confirm-logout-title = サインアウトしますか？
wf-confirm-logout-description = GitHubからサインアウトしますか？
wf-confirm-login-title = GitHubに接続しますか？
wf-confirm-login-description = GitHubにサインインして既存のリポジトリを編集できるようにします。
wf-leave-edit-warning = このタブの未保存の編集は破棄されます。保持するには先にGitHubへ保存してください。
wf-confirm-action = 続行
wf-cancel = キャンセル
</ftl>
