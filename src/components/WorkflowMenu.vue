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
          :label="$t('cancel')"
          @click="confirmOpen = false"
        />
        <UButton
          :color="confirmColor"
          :label="$t('confirm-action')"
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
  return $t('new-shield');
});

const confirmTitle = computed(() => {
  switch (pendingAction.value) {
    case 'new': return $t('confirm-new-title');
    case 'edit': return $t('confirm-edit-title');
    case 'logout': return $t('confirm-logout-title');
    case 'login': return $t('confirm-login-title');
    default: return $t('confirm-title');
  }
});

const confirmDescription = computed(() => {
  if (workflow.isEditing && pendingAction.value !== null) {
    return $t('leave-edit-warning');
  }
  switch (pendingAction.value) {
    case 'new': return $t('confirm-new-description');
    case 'edit': return $t('confirm-edit-description');
    case 'logout': return $t('confirm-logout-description');
    case 'login': return $t('confirm-login-description');
    default: return $t('confirm-description');
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
        label: $t('view-repo'),
        icon: 'i-lucide-external-link',
        to: workflow.editingRepository?.htmlUrl ?? 'https://github.com',
        target: '_blank',
      },
      {
        label: $t('edit-other'),
        icon: 'i-lucide-folder-search',
        onSelect() { requestAction('edit'); },
      },
    ]);
  }

  items.push([
    {
      label: $t('new-shield'),
      icon: 'i-lucide-pen-line',
      color: workflow.isNew ? 'primary' : 'neutral',
      onSelect() { requestAction('new'); },
    },
    {
      label: $t('edit-repo'),
      icon: 'i-lucide-github',
      color: workflow.isEditing ? 'primary' : 'neutral',
      onSelect() { requestAction('edit'); },
    },
  ]);

  if (workflow.githubUser) {
    items.push([
      {
        label: workflow.githubUser.login,
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
        label: $t('connect-github'),
        icon: 'i-lucide-log-in',
        onSelect() { requestAction('login'); },
      },
    ]);
  }

  return items;
});
</script>

<ftl locale="en">
new-shield = New Shield
edit-repo = Edit Existing Repository
edit-other = Edit a Different Repository
view-repo = View Repository on GitHub
signed-in-as = Signed in as
connect-github = Connect to GitHub
confirm-title = Switch Workflow?
confirm-description = Switch to this workflow?
confirm-new-title = Start a New Shield?
confirm-new-description = Start a new Shield and discard the current configuration?
confirm-edit-title = Edit Existing Repository?
confirm-edit-description = Open the GitHub repository picker?
logout = Sign Out
confirm-logout-title = Sign Out?
confirm-logout-description = Sign out of GitHub?
confirm-login-title = Connect to GitHub?
confirm-login-description = Sign in to GitHub so you can edit existing repositories.
leave-edit-warning = Your unsaved edits in this tab will be discarded. Save to GitHub first if you want to keep them.
confirm-action = Continue
</ftl>

<ftl locale="zh-CN">
new-shield = 新建 Shield
edit-repo = 编辑已有仓库
edit-other = 编辑其他仓库
view-repo = 在 GitHub 上查看仓库
signed-in-as = 已登录为
connect-github = 连接到 GitHub
confirm-title = 切换工作流？
confirm-description = 切换到该工作流？
confirm-new-title = 开始新建 Shield？
confirm-new-description = 开始新建 Shield 并丢弃当前配置？
confirm-edit-title = 编辑已有仓库？
confirm-edit-description = 打开 GitHub 仓库选择器？
logout = 退出登录
confirm-logout-title = 退出登录？
confirm-logout-description = 退出 GitHub 登录？
confirm-login-title = 连接到 GitHub？
confirm-login-description = 登录 GitHub 以编辑已有仓库。
leave-edit-warning = 当前标签页中未保存的修改将被丢弃。如需保留，请先保存到 GitHub。
confirm-action = 继续
</ftl>

<ftl locale="ja">
new-shield = 新しいシールド
edit-repo = 既存のリポジトリを編集
edit-other = 別のリポジトリを編集
view-repo = GitHubでリポジトリを表示
signed-in-as = サインイン中:
connect-github = GitHubに接続
confirm-title = ワークフローを切り替えますか？
confirm-description = このワークフローに切り替えますか？
confirm-new-title = 新しいシールドを開始しますか？
confirm-new-description = 新しいシールドを開始し、現在の設定を破棄しますか？
confirm-edit-title = 既存のリポジトリを編集しますか？
confirm-edit-description = GitHubのリポジトリ選択を開きますか？
logout = サインアウト
confirm-logout-title = サインアウトしますか？
confirm-logout-description = GitHubからサインアウトしますか？
confirm-login-title = GitHubに接続しますか？
confirm-login-description = GitHubにサインインして既存のリポジトリを編集できるようにします。
leave-edit-warning = このタブの未保存の編集は破棄されます。保持するには先にGitHubへ保存してください。
confirm-action = 続行
</ftl>
