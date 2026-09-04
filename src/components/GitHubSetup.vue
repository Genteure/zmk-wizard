<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex items-center justify-between gap-1.5 p-3 sm:gap-2 sm:p-4">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :aria-label="$t('gh-back')"
        @click="$emit('cancel')"
      >
        <span class="hidden sm:inline">
          {{ $t('gh-back') }}
        </span>
      </UButton>
      <div class="flex items-center gap-1.5 sm:gap-2">
        <LocaleSelect
          v-model="nav.locale"
          :locales="locales"
        />
        <UColorModeSelect />
      </div>
    </header>

    <main class="flex-1 flex items-center justify-center p-4 pb-16">
      <UCard class="w-full max-w-2xl">
        <!-- OAuth code exchange in progress -->
        <div
          v-if="workflow.githubStep === 'exchange'"
          class="flex flex-col items-center gap-4 py-10"
        >
          <UIcon
            name="i-svg-spinners-90-ring"
            class="size-10 text-primary"
          />
          <p class="text-sm text-toned">
            {{ $t('gh-exchanging') }}
          </p>
        </div>

        <!-- Install the GitHub App -->
        <div
          v-else-if="workflow.githubStep === 'install'"
          class="flex flex-col gap-4"
        >
          <div class="flex flex-col items-center gap-2 text-center">
            <UIcon
              name="i-lucide-puzzle"
              class="size-10 text-secondary"
            />
            <h1 class="text-xl font-bold text-highlighted">
              {{ $t('gh-install-title') }}
            </h1>
            <p class="text-sm text-toned max-w-md">
              {{ $t('gh-install-description') }}
            </p>
          </div>

          <UAlert
            v-if="workflow.githubUser"
            color="info"
            variant="soft"
            icon="i-lucide-user"
            :title="workflow.githubUser.login"
            :description="$t('gh-install-signed-in')"
          />

          <UAlert
            v-if="workflow.githubInstallUrl"
            color="info"
            variant="soft"
            icon="i-lucide-info"
            :title="$t('gh-install-choose-repos-title')"
            :description="$t('gh-install-choose-repos-hint')"
          />

          <UButton
            v-if="workflow.githubInstallUrl"
            block
            size="lg"
            color="secondary"
            variant="soft"
            icon="i-lucide-download"
            :label="$t('gh-install-action')"
            :loading="workflow.githubBusy"
            @click="beginInstall"
          />

          <UAlert
            v-else
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="$t('gh-install-url-missing')"
            :description="$t('gh-install-url-missing-desc')"
          />

          <div class="text-xs text-toned text-center">
            {{ $t('gh-install-return-note') }}
          </div>
        </div>

        <!-- Repository selection -->
        <div
          v-else
          class="flex flex-col gap-4"
        >
          <div>
            <h1 class="text-lg font-bold text-highlighted">
              {{ $t('gh-repos-title') }}
            </h1>
            <p class="text-sm text-toned">
              {{ $t('gh-repos-description') }}
            </p>
          </div>

          <!-- Signed out: keep sign-in on the same repository picker page -->
          <div
            v-if="!workflow.githubUser"
            class="flex flex-col gap-4 rounded-xl border border-default bg-muted/40 p-5 sm:p-6"
          >
            <div class="flex flex-col items-center gap-2 text-center">
              <UIcon
                name="i-lucide-github"
                class="size-10 text-secondary"
              />
              <h2 class="text-lg font-semibold text-highlighted">
                {{ $t('gh-auth-title') }}
              </h2>
              <p class="text-xs text-toned">
                {{ $t('gh-repos-signed-out') }}
              </p>
              <p class="text-sm text-toned max-w-md">
                {{ $t('gh-auth-description') }}
              </p>
            </div>

            <UAlert
              v-if="githubDisabled"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :title="$t('gh-not-configured')"
              :description="$t('gh-not-configured-desc')"
            />

            <UButton
              block
              size="lg"
              color="secondary"
              variant="soft"
              icon="i-lucide-log-in"
              :label="$t('gh-connect')"
              :loading="workflow.githubBusy"
              :disabled="githubDisabled"
              @click="beginAuth"
            />
          </div>

          <template v-else>
            <div class="flex items-center justify-between gap-3 rounded-xl border border-default bg-muted/40 px-4 py-3">
              <div class="flex items-center gap-3 min-w-0">
                <UAvatar
                  :src="workflow.githubUser.avatarUrl"
                  :alt="workflow.githubUser.login"
                  size="md"
                />
                <div class="min-w-0">
                  <div class="font-medium truncate">
                    {{ workflow.githubUser.login }}
                  </div>
                  <div class="text-xs text-toned">
                    {{ $t('gh-repos-signed-in') }}
                  </div>
                </div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="$t('gh-logout')"
                :loading="loggingOut"
                @click="logout"
              />
            </div>

            <div
              v-if="(workflow.githubInstallations?.length ?? 0) > 1"
              class="flex flex-col gap-1"
            >
              <span class="text-xs font-medium text-toned">
                {{ $t('gh-repos-account') }}
              </span>
              <USelect
                :model-value="workflow.selectedInstallationId ?? undefined"
                :items="installationOptions"
                value-key="value"
                @update:model-value="value => workflow.selectedInstallationId = typeof value === 'number' ? value : null"
              />
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                v-if="workflow.githubInstallUrl"
                variant="ghost"
                :href="workflow.githubInstallUrl"
              >
                {{ $t('gh-repos-edit-access') }}
              </UButton>
            </div>

            <UDivider />

            <div
              v-if="repoLoading || (workflow.githubBusy && repos.length === 0)"
              class="flex items-center justify-center gap-2 py-8 text-sm text-toned"
            >
              <UIcon
                name="i-svg-spinners-90-ring"
                class="size-5"
              />
              {{ $t('gh-repos-loading') }}
            </div>

            <template v-else-if="repos.length > 0">
              <div class="flex flex-col gap-3 max-h-[50vh] min-h-0 overflow-y-auto overscroll-contain px-1 py-1">
                <UAlert
                  v-if="showManyReposHint"
                  class="mb-1 shrink-0"
                  color="info"
                  variant="soft"
                  icon="i-lucide-info"
                  :title="$t('gh-repos-many-title')"
                  :description="$t('gh-repos-many-hint')"
                />

                <div
                  v-if="supportedRepos.length === 0"
                  class="flex flex-col items-center gap-2 py-6 text-sm text-toned"
                >
                  <UIcon
                    name="i-lucide-folder-search"
                    class="size-8 text-muted"
                  />
                  <p class="text-center max-w-sm">
                    {{ $t('gh-repos-no-supported') }}
                  </p>
                </div>

                <template v-else>
                  <UCard
                    v-for="repo in supportedRepos"
                    :key="repo.id"
                    class="cursor-pointer shrink-0"
                    role="button"
                    :tabindex="0"
                    :ui="{ body: 'px-3 py-2' }"
                    @click="chooseRepo(repo)"
                    @keydown="onRepoKeydown($event, repo)"
                  >
                    <div class="flex items-center gap-3">
                      <UIcon
                        name="i-lucide-folder-git-2"
                        class="size-6 shrink-0 text-secondary"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="font-medium truncate">
                          {{ repo.fullName }}
                        </div>
                        <div class="text-xs text-toned truncate">
                          {{ repo.description || repo.defaultBranch }}
                        </div>
                      </div>
                      <UIcon
                        name="i-lucide-chevron-right"
                        class="size-4 shrink-0 text-muted"
                      />
                    </div>
                  </UCard>
                </template>

                <div
                  v-if="unsupportedRepos.length > 0"
                  class="shrink-0 rounded-xl border border-dashed border-default bg-muted/30"
                >
                  <details class="group">
                    <summary
                      class="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-sm text-toned [&::-webkit-details-marker]:hidden"
                    >
                      <span>
                        {{ $t('gh-repos-unsupported-count', { count: unsupportedRepos.length }) }}
                      </span>
                      <UIcon
                        name="i-lucide-chevron-down"
                        class="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <ul class="grid gap-1 border-t border-default px-4 py-3">
                      <li
                        v-for="repo in unsupportedRepos"
                        :key="repo.id"
                        class="truncate text-sm text-toned"
                      >
                        {{ repo.fullName }}
                      </li>
                    </ul>
                  </details>
                </div>

                <UButton
                  v-if="reposHasMore"
                  block
                  color="neutral"
                  variant="outline"
                  :label="$t('gh-repos-load-more')"
                  :loading="repoLoadingMore"
                  @click="loadMoreRepos"
                />
              </div>
            </template>

            <div
              v-else-if="workflow.githubError && repos.length === 0"
              class="flex flex-col items-center gap-3 py-8 text-sm"
            >
              <UIcon
                name="i-lucide-alert-circle"
                class="size-10 text-error"
              />
              <p class="text-center max-w-sm font-medium">
                {{ $t('gh-repos-load-failed') }}
              </p>
              <p class="text-center max-w-sm text-error">
                {{ workflow.githubError }}
              </p>
              <UButton
                block
                color="primary"
                variant="soft"
                :label="$t('gh-retry')"
                icon="i-lucide-refresh-cw"
                @click="loadRepos(true)"
              />
            </div>

            <div
              v-else
              class="flex flex-col items-center gap-3 py-8 text-sm text-toned"
            >
              <UIcon
                name="i-lucide-folder-search"
                class="size-10 text-muted"
              />
              <p class="text-center max-w-sm">
                {{ $t('gh-repos-empty') }}
              </p>
              <UButton
                v-if="reposHasMore"
                block
                color="neutral"
                variant="outline"
                :label="$t('gh-repos-load-more')"
                :loading="repoLoadingMore"
                @click="loadMoreRepos"
              />
              <ULink
                v-if="workflow.githubInstallUrl"
                :href="workflow.githubInstallUrl"
                class="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {{ $t('gh-repos-edit-access') }}
              </ULink>
            </div>
          </template>
        </div>

        <UAlert
          v-if="workflow.githubError && !(workflow.githubStep === 'repositories' && workflow.githubUser && repos.length === 0)"
          class="mt-4"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="$t('gh-error')"
          :description="workflow.githubError"
        />
      </UCard>
    </main>
  </div>
</template>

<script setup lang="ts">
import { actions } from 'astro:actions';
import { useFluent } from 'fluent-vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { Keyboard } from '~/types';
import { GITHUB_ENABLED_AT_BUILD as githubEnabledAtBuild } from './githubConfig';
import {
  type EditingRepository,
  type GithubRepoSummary,
  useWorkflowStore,
} from './workflow';
import { locales } from './locales';
import { compareGithubRepos } from '~/lib/githubRepoOrder';
import { useNavigationStore } from './stores.ts';
import LocaleSelect from './utils/LocaleSelect.vue';

const emit = defineEmits<{
  cancel: [];
  loaded: [payload: {
    keyboard: Keyboard;
    repository: EditingRepository;
    validationIssues: string[];
    wasLegacy: boolean;
  }];
}>();

interface LoadedRepositoryData {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  private: boolean;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

function toEditingRepository(
  repository: LoadedRepositoryData,
  dataFileSha: string,
): EditingRepository {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.fullName,
    htmlUrl: repository.htmlUrl,
    defaultBranch: repository.defaultBranch,
    isPrivate: repository.private,
    owner: repository.owner,
    dataFileSha,
  };
}

const { $t } = useFluent();
const toast = useToast();
const workflow = useWorkflowStore();
const nav = useNavigationStore();

const githubDisabled = computed(() => !githubEnabledAtBuild || workflow.githubConfigured === false);
const loggingOut = ref(false);

const repos = ref<GithubRepoSummary[]>([]);
const repoLoading = ref(false);
const repoLoadingMore = ref(false);
const reposPage = ref(1);
const reposHasMore = ref(false);

const installationOptions = computed(() =>
  (workflow.githubInstallations ?? []).map(installation => ({
    label: `${installation.account.login} (${installation.account.type})`,
    value: installation.id,
  })),
);

const supportedRepos = computed(() =>
  repos.value
    .filter(repo => repo.hasShieldWizardConfig)
    .sort(compareGithubRepos),
);

const unsupportedRepos = computed(() =>
  repos.value
    .filter(repo => !repo.hasShieldWizardConfig)
    .sort(compareGithubRepos),
);

const showManyReposHint = computed(() => repos.value.length > 10 || reposHasMore.value);

watch(
  () => workflow.selectedInstallationId,
  () => {
    void loadRepos(true);
  },
);

onMounted(async () => {
  if (workflow.githubStep === 'exchange') return;

  if (workflow.githubConfigured && !workflow.githubUser) {
    await refreshSession();
  }

  if (workflow.githubStep !== 'repositories') return;

  if (workflow.pendingRepo && workflow.githubUser) {
    const opened = await tryOpenPendingRepo();
    if (opened) return;
  }

  if (workflow.githubInstallations?.length) {
    if (workflow.selectedInstallationId === null) {
      workflow.selectedInstallationId = workflow.githubInstallations[0].id;
    }
    else {
      await loadRepos(true);
    }
  }
});

async function refreshSession(): Promise<void> {
  workflow.githubBusy = true;
  try {
    const { data, error } = await actions.githubGetSession();
    if (error) {
      workflow.setGithubError(error.message);
      return;
    }
    if (data) {
      const previousUser = workflow.githubUser;
      const previousInstallations = workflow.githubInstallations;
      workflow.setSession(data);
      if (data.githubError && previousUser && !data.user) {
        workflow.githubUser = previousUser;
        workflow.githubInstallations = previousInstallations;
      }
      routeAfterSession(workflow.githubInstallations ?? []);
    }
  }
  catch (error) {
    workflow.setGithubError(error instanceof Error ? error.message : String(error));
  }
  finally {
    workflow.githubBusy = false;
  }
}

function routeAfterSession(installations: unknown[]): void {
  if (!workflow.githubUser) {
    workflow.githubStep = 'repositories';
    return;
  }
  workflow.githubStep = installations.length > 0 ? 'repositories' : 'install';
  if (installations.length > 0 && workflow.selectedInstallationId === null) {
    const first = workflow.githubInstallations?.[0];
    if (first) workflow.selectedInstallationId = first.id;
  }
}

async function beginAuth(): Promise<void> {
  if (!githubEnabledAtBuild) return;
  workflow.githubBusy = true;
  workflow.githubError = null;
  try {
    const { data, error } = await actions.githubBeginAuth({
      intent: 'edit',
      repo: workflow.pendingRepo ?? undefined,
    });
    if (error) {
      workflow.setGithubError(error.message);
      return;
    }
    if (data) {
      window.location.assign(data.authorizeUrl);
    }
  }
  catch (error) {
    workflow.setGithubError(error instanceof Error ? error.message : String(error));
  }
  finally {
    workflow.githubBusy = false;
  }
}

function beginInstall(): void {
  if (!workflow.githubInstallUrl) return;
  workflow.githubError = null;
  window.location.assign(workflow.githubInstallUrl);
}

async function logout(): Promise<void> {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    const { error } = await actions.githubLogout();
    if (error) {
      toast.add({
        color: 'error',
        title: $t('gh-logout-failed'),
        description: error.message,
      });
      return;
    }
    workflow.clearSession();
    workflow.githubConfigured = true;
    workflow.githubStep = 'repositories';
    workflow.githubError = null;
    workflow.pendingRepo = null;
    toast.add({
      color: 'neutral',
      title: $t('gh-signed-out'),
    });
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: $t('gh-logout-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
  finally {
    loggingOut.value = false;
  }
}

async function tryOpenPendingRepo(): Promise<boolean> {
  const pending = workflow.pendingRepo;
  if (!pending) return false;
  const [owner, repo] = pending.split('/', 2);
  if (!owner || !repo) return false;

  workflow.githubBusy = true;
  try {
    const { data, error } = await actions.githubLoadRepository({ owner, repo });
    if (error) {
      if (error.code === 'UNAUTHORIZED') {
        workflow.expireSession();
        return true;
      }
      workflow.githubError = error.message;
      workflow.githubStep = 'repositories';
      return false;
    }
    if (data) {
      workflow.pendingRepo = null;
      emit('loaded', {
        keyboard: data.keyboard,
        repository: toEditingRepository(data.repository, data.dataFileSha),
        validationIssues: data.validationIssues,
        wasLegacy: data.wasLegacy,
      });
      return true;
    }
    return false;
  }
  catch (error) {
    workflow.githubError = error instanceof Error ? error.message : String(error);
    return false;
  }
  finally {
    workflow.githubBusy = false;
  }
}

async function loadRepos(reset: boolean): Promise<void> {
  const installationId = workflow.selectedInstallationId;
  if (installationId === null) return;

  if (reset) {
    repos.value = [];
    reposPage.value = 1;
    reposHasMore.value = false;
    repoLoading.value = true;
  }
  else {
    repoLoadingMore.value = true;
  }
  workflow.githubError = null;

  try {
    const { data, error } = await actions.githubListRepositories({
      installationId,
      page: reset ? 1 : reposPage.value + 1,
      perPage: 30,
    });
    if (error) {
      if (error.code === 'UNAUTHORIZED') {
        workflow.expireSession();
        return;
      }
      workflow.setGithubError(error.message, 'repositories');
      return;
    }
    if (data) {
      repos.value = reset ? data.repos : [...repos.value, ...data.repos];
      reposPage.value = reset ? 1 : reposPage.value + 1;
      reposHasMore.value = data.hasMore;
    }
  }
  catch (error) {
    workflow.setGithubError(error instanceof Error ? error.message : String(error), 'repositories');
  }
  finally {
    repoLoading.value = false;
    repoLoadingMore.value = false;
  }
}

function loadMoreRepos(): void {
  void loadRepos(false);
}

function onRepoKeydown(event: KeyboardEvent, repo: GithubRepoSummary): void {
  if (!repo.hasShieldWizardConfig) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void chooseRepo(repo);
  }
}

async function chooseRepo(repo: GithubRepoSummary): Promise<void> {
  if (!repo.hasShieldWizardConfig) return;

  workflow.githubBusy = true;
  workflow.githubError = null;
  try {
    const { data, error } = await actions.githubLoadRepository({
      owner: repo.owner.login,
      repo: repo.name,
    });
    if (error) {
      if (error.code === 'UNAUTHORIZED') {
        workflow.expireSession();
        return;
      }
      toast.add({
        color: 'error',
        title: $t('gh-load-failed'),
        description: error.message,
      });
      return;
    }
    if (data) {
      workflow.pendingRepo = null;
      emit('loaded', {
        keyboard: data.keyboard,
        repository: toEditingRepository(data.repository, data.dataFileSha),
        validationIssues: data.validationIssues,
        wasLegacy: data.wasLegacy,
      });
    }
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: $t('gh-load-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
  finally {
    workflow.githubBusy = false;
  }
}
</script>

<ftl locale="en">
gh-back = Back
gh-exchanging = Finishing GitHub sign-in…

gh-auth-title = Sign in with GitHub
gh-auth-description = Shield Wizard uses a GitHub App to read and update only the repositories you grant it access to. Your token stays encrypted in a server-side session cookie.
gh-not-configured = GitHub integration is not configured on this server
gh-not-configured-desc = Ask the administrator to complete the setup in docs/deployment.md.
gh-connect = Connect to GitHub

gh-install-title = Install the Shield Wizard App
gh-install-description = Choose which repositories the app may access. GitHub will bring you right back to this step when the installation is done.
gh-install-signed-in = Signed in — now grant the app access to a repository.
gh-install-choose-repos-title = Choose only the repositories you want Shield Wizard to access
gh-install-choose-repos-hint = Please use "Only select repositories" under "Repository access" instead of "All repositories" in GitHub application settings.
gh-install-action = Continue to Install
gh-install-url-missing = App installation link unavailable
gh-install-url-missing-desc = PUBLIC_GITHUB_APP_SLUG or GITHUB_SESSION_SECRET is not configured. Set the app slug and configure the session secret.
gh-install-return-note = You will be redirected back here automatically after GitHub finishes the installation.

gh-repos-title = Choose a Repository
gh-repos-description = Shield Wizard-compatible repositories can be opened. Unsupported repositories are listed separately for context only.
gh-repos-signed-in = Signed in to GitHub
gh-repos-signed-out = Not signed in to GitHub
gh-logout = Sign Out
gh-signed-out = Signed out of GitHub
gh-logout-failed = Failed to sign out
gh-repos-account = GitHub Account
gh-repos-edit-access = Edit Repository Access
gh-repos-loading = Loading repositories…
gh-repos-no-supported = No Shield Wizard-compatible repositories found. Create one with Shield Wizard first.
gh-repos-unsupported-count = {$count ->
  [1] 1 unsupported repository
  *[other] {$count} unsupported repositories
}
gh-repos-many-title = Tip: narrow your repository access
gh-repos-many-hint = Please use "Only select repositories" under "Repository access" instead of "All repositories" in GitHub application settings.
gh-repos-empty = No repositories found for this installation. Grant the app access to a repository, or switch accounts.
gh-repos-load-more = Load More
gh-repos-load-failed = Could not load repositories
gh-retry = Retry

gh-error = Something went wrong
gh-load-failed = Failed to open repository
</ftl>

<ftl locale="zh-CN">
gh-back = 返回
gh-exchanging = 正在完成 GitHub 登录…

gh-auth-title = 使用 GitHub 登录
gh-auth-description = Shield Wizard 通过 GitHub App 只读写你授权的仓库。访问令牌会加密保存在服务器会话 cookie 中。
gh-not-configured = 此服务器尚未配置 GitHub 集成
gh-not-configured-desc = 请联系管理员按照 docs/deployment.md 完成配置。
gh-connect = 连接到 GitHub

gh-install-title = 安装 Shield Wizard App
gh-install-description = 选择允许应用访问的仓库。安装完成后 GitHub 会自动带你回到这一步。
gh-install-signed-in = 已登录——现在请为应用授予仓库访问权限。
gh-install-choose-repos-title = 只选择希望 Shield Wizard 访问的仓库
gh-install-choose-repos-hint = 请在 GitHub 应用设置的“Repository access”中选择“Only select repositories”，而不是“All repositories”。
gh-install-action = 继续安装
gh-install-url-missing = 无法生成应用安装链接
gh-install-url-missing-desc = PUBLIC_GITHUB_APP_SLUG 或 GITHUB_SESSION_SECRET 未配置。请设置应用 slug 并配置会话密钥。
gh-install-return-note = GitHub 完成安装后会自动返回此页面。

gh-repos-title = 选择仓库
gh-repos-description = 可打开与 Shield Wizard 兼容的仓库。不支持的仓库会单独列出，仅供了解。
gh-repos-signed-in = 已登录 GitHub
gh-repos-signed-out = 尚未登录 GitHub
gh-logout = 退出登录
gh-signed-out = 已退出 GitHub 登录
gh-logout-failed = 退出登录失败
gh-repos-account = GitHub 账号
gh-repos-edit-access = 编辑仓库访问权限
gh-repos-loading = 正在加载仓库…
gh-repos-no-supported = 没有找到与 Shield Wizard 兼容的仓库。请先用 Shield Wizard 创建一个。
gh-repos-unsupported-count = {$count ->
  [1] 1 个不支持的仓库
  *[other] {$count} 个不支持的仓库
}
gh-repos-many-title = 小提示：限制仓库访问范围
gh-repos-many-hint = 请在 GitHub 应用设置的“Repository access”中选择“Only select repositories”，而不是“All repositories”。
gh-repos-empty = 此安装下没有找到仓库。请为应用授予仓库访问权限，或切换账号。
gh-repos-load-more = 加载更多
gh-repos-load-failed = 无法加载仓库
gh-retry = 重试

gh-error = 出错了
gh-load-failed = 无法打开仓库
</ftl>

<ftl locale="ja">
gh-back = 戻る
gh-exchanging = GitHubサインインを完了しています…

gh-auth-title = GitHubでサインイン
gh-auth-description = Shield WizardはGitHub Appを使い、あなたが許可したリポジトリのみを読み書きします。トークンはサーバー側セッションCookieに暗号化して保存されます。
gh-not-configured = このサーバーではGitHub連携が未設定です
gh-not-configured-desc = 管理者に docs/deployment.md の手順で設定してもらってください。
gh-connect = GitHubに接続

gh-install-title = Shield Wizard Appをインストール
gh-install-description = アプリがアクセスできるリポジトリを選択してください。インストール完了後、GitHubがこの画面に戻します。
gh-install-signed-in = サインイン済みです。アプリにリポジトリアクセスを許可してください。
gh-install-choose-repos-title = Shield Wizardがアクセスするリポジトリを選択してください
gh-install-choose-repos-hint = GitHubアプリの設定で「Repository access」の「All repositories」ではなく「Only select repositories」を選択してください。
gh-install-action = 続けてインストール
gh-install-url-missing = アプリインストールリンクを生成できません
gh-install-url-missing-desc = PUBLIC_GITHUB_APP_SLUG または GITHUB_SESSION_SECRET が未設定です。アプリスラッグを設定し、セッションシークレットを構成してください。
gh-install-return-note = GitHubでのインストール完了後、自動的にこのページへ戻ります。

gh-repos-title = リポジトリを選択
gh-repos-description = Shield Wizardと互換性のあるリポジトリは開ける。サポートされていないリポジトリは参考として別途表示されます。
gh-repos-signed-in = GitHubにサインイン済み
gh-repos-signed-out = GitHubにサインインしていません
gh-logout = サインアウト
gh-signed-out = GitHubからサインアウトしました
gh-logout-failed = サインアウトに失敗しました
gh-repos-account = GitHubアカウント
gh-repos-edit-access = リポジトリアクセスを編集
gh-repos-loading = リポジトリを読み込み中…
gh-repos-no-supported = Shield Wizardと互換性のあるリポジトリが見つかりません。先にShield Wizardで作成してください。
gh-repos-unsupported-count = {$count ->
  [1] サポートされていないリポジトリ 1 件
  *[other] サポートされていないリポジトリ {$count} 件
}
gh-repos-many-title = ヒント：リポジトリアクセスを絞り込みましょう
gh-repos-many-hint = GitHubアプリの設定で「Repository access」の「All repositories」ではなく「Only select repositories」を選択してください。
gh-repos-empty = このインストールにはリポジトリがありません。アプリにアクセスを許可するか、アカウントを切り替えてください。
gh-repos-load-more = さらに読み込む
gh-repos-load-failed = リポジトリを読み込めませんでした
gh-retry = 再試行

gh-error = エラーが発生しました
gh-load-failed = リポジトリを開けませんでした
</ftl>
