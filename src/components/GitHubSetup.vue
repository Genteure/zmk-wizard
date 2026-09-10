<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex items-center justify-between gap-1.5 p-3 sm:gap-2 sm:p-4">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :disabled="isExchanging"
        :aria-label="$t('back')"
        @click="$emit('cancel')"
      >
        <span class="hidden sm:inline">
          {{ $t('back') }}
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
        <!-- Progress through sign-in → install → choose repository -->
        <ol
          v-if="workflow.githubStep !== 'exchange'"
          class="mb-5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-xs"
          :aria-label="$t('steps-label')"
        >
          <li
            v-for="(step, index) in steps"
            :key="step.key"
            class="flex items-center gap-1.5"
          >
            <span
              class="flex items-center gap-1.5 whitespace-nowrap"
              :class="index <= currentStepIndex ? 'text-highlighted' : 'text-dimmed'"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                :class="index < currentStepIndex
                  ? 'bg-primary text-white'
                  : index === currentStepIndex
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                    : 'bg-muted text-dimmed'"
              >
                <UIcon
                  v-if="index < currentStepIndex"
                  name="i-lucide-check"
                  class="size-3"
                />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span :class="index === currentStepIndex ? 'font-medium' : ''">
                {{ step.label }}
              </span>
            </span>
            <UIcon
              v-if="index < steps.length - 1"
              name="i-lucide-chevron-right"
              class="size-3.5 shrink-0 text-dimmed"
            />
          </li>
        </ol>

        <!-- OAuth code exchange in progress -->
        <div
          v-if="workflow.githubStep === 'exchange'"
          class="flex flex-col items-center gap-4 py-10"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-10 text-primary animate-spin"
          />
          <p class="text-sm text-toned">
            {{ $t('exchanging') }}
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
              {{ $t('install-title') }}
            </h1>
            <p class="text-sm text-toned max-w-md">
              {{ $t('install-description') }}
            </p>
          </div>

          <UAlert
            v-if="workflow.githubUser"
            color="info"
            variant="soft"
            icon="i-lucide-user"
            :title="workflow.githubUser.login"
            :description="$t('install-signed-in')"
          />

          <UAlert
            v-if="workflow.githubInstallUrl"
            color="info"
            variant="soft"
            icon="i-lucide-info"
            :title="$t('install-choose-repos-title')"
            :description="$t('install-choose-repos-hint')"
          />

          <template v-if="workflow.githubInstallUrl">
            <UButton
              block
              size="lg"
              color="secondary"
              variant="soft"
              icon="i-lucide-download"
              :label="$t('install-action')"
              :loading="workflow.githubBusy"
              @click="beginInstall"
            />

            <p class="text-center text-xs text-toned">
              {{ $t('install-return-hint') }}
            </p>
          </template>

          <template v-else>
            <UAlert
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :title="$t('install-url-missing')"
            />

            <UButton
              block
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :label="$t('retry')"
              :loading="workflow.githubBusy"
              @click="retryInstallUrl"
            />
          </template>
        </div>

        <!-- Repository selection -->
        <div
          v-else
          class="flex flex-col gap-4"
        >
          <h1 class="text-lg font-bold text-highlighted text-center">
            {{ $t('repos-title') }}
          </h1>

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
                {{ $t('auth-title') }}
              </h2>
              <p class="text-xs text-toned">
                {{ $t('repos-signed-out') }}
              </p>
            </div>

            <UAlert
              v-if="githubDisabled"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :title="$t('not-configured')"
            />

            <UButton
              block
              size="lg"
              color="secondary"
              variant="soft"
              icon="i-lucide-log-in"
              :label="$t('connect')"
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
                    {{ $t('repos-signed-in') }}
                  </div>
                </div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="$t('logout')"
                :loading="loggingOut"
                @click="logout"
              />
            </div>

            <div
              v-if="(workflow.githubInstallations?.length ?? 0) > 1"
              class="flex flex-col gap-1"
            >
              <span class="text-xs font-medium text-toned">
                {{ $t('repos-account') }}
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
                {{ $t('repos-edit-access') }}
              </UButton>
            </div>

            <USeparator />

            <div
              v-if="repoLoading || (workflow.githubBusy && repos.length === 0)"
              class="flex items-center justify-center gap-2 py-8 text-sm text-toned"
              role="status"
              aria-live="polite"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-5 animate-spin"
              />
              {{ $t('repos-loading') }}
            </div>

            <template v-else-if="repos.length > 0">
              <UAlert
                v-if="showManyReposHint"
                color="info"
                variant="soft"
                icon="i-lucide-info"
                :title="$t('repos-many-title')"
                :description="$t('repos-many-hint')"
              />

              <UInput
                v-model="repoQuery"
                class="w-full"
                icon="i-lucide-search"
                :placeholder="$t('repos-search')"
              >
                <template
                  v-if="repoQuery"
                  #trailing
                >
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="link"
                    size="xs"
                    :aria-label="$t('repos-search-clear')"
                    @click="repoQuery = ''"
                  />
                </template>
              </UInput>

              <div class="flex flex-col gap-3 max-h-[50vh] min-h-0 overflow-y-auto overscroll-contain px-1 py-1">
                <div
                  v-if="supportedRepos.length === 0"
                  class="flex flex-col items-center gap-2 py-6 text-sm text-toned"
                  role="status"
                >
                  <UIcon
                    name="i-lucide-folder-search"
                    class="size-8 text-muted"
                  />
                  <p class="text-center max-w-sm">
                    {{ $t('repos-no-supported') }}
                  </p>
                </div>

                <div
                  v-else-if="filteredSupportedRepos.length === 0"
                  class="flex flex-col items-center gap-2 py-6 text-sm text-toned"
                  role="status"
                >
                  <UIcon
                    name="i-lucide-search-x"
                    class="size-8 text-muted"
                  />
                  <p class="text-center max-w-sm">
                    {{ $t('repos-no-match', { query: repoQuery.trim() }) }}
                  </p>
                </div>

                <template v-else>
                  <UCard
                    v-for="repo in filteredSupportedRepos"
                    :key="repo.id"
                    class="cursor-pointer shrink-0 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    :class="{
                      'pointer-events-none': repoLoadingId !== null,
                      'opacity-60': repoLoadingId !== null && repoLoadingId !== repo.id,
                      'ring-2 ring-primary/30 bg-primary/5': repoLoadingId === repo.id,
                    }"
                    role="button"
                    :tabindex="repoLoadingId !== null ? -1 : 0"
                    :aria-disabled="repoLoadingId !== null"
                    :aria-busy="repoLoadingId === repo.id"
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
                        :name="repoLoadingId === repo.id ? 'i-lucide-loader-circle' : 'i-lucide-chevron-right'"
                        class="size-4 shrink-0"
                        :class="repoLoadingId === repo.id ? 'animate-spin text-primary' : 'text-muted'"
                      />
                    </div>
                  </UCard>
                </template>

                <div
                  v-if="filteredUnsupportedRepos.length > 0"
                  class="shrink-0 rounded-xl border border-dashed border-default bg-muted/30"
                >
                  <details class="group">
                    <summary
                      class="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-sm text-toned [&::-webkit-details-marker]:hidden"
                    >
                      <span>
                        {{ $t('repos-unsupported-count', { count: filteredUnsupportedRepos.length }) }}
                      </span>
                      <UIcon
                        name="i-lucide-chevron-down"
                        class="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <ul class="grid gap-1 border-t border-default px-4 py-3">
                      <li
                        v-for="repo in filteredUnsupportedRepos"
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
                  :label="$t('repos-load-more')"
                  :loading="repoLoadingMore"
                  @click="loadMoreRepos"
                />
              </div>
            </template>

            <div
              v-else-if="workflow.githubError && repos.length === 0"
              class="flex flex-col items-center gap-3 py-8 text-sm"
              role="alert"
            >
              <UIcon
                name="i-lucide-alert-circle"
                class="size-10 text-error"
              />
              <p class="text-center max-w-sm font-medium">
                {{ $t('repos-load-failed') }}
              </p>
              <p class="text-center max-w-sm text-error">
                {{ workflow.githubError }}
              </p>
              <UButton
                block
                color="primary"
                variant="soft"
                :label="$t('retry')"
                icon="i-lucide-refresh-cw"
                @click="loadRepos(true)"
              />
            </div>

            <div
              v-else
              class="flex flex-col items-center gap-3 py-8 text-sm text-toned"
              role="status"
            >
              <UIcon
                name="i-lucide-folder-search"
                class="size-10 text-muted"
              />
              <p class="text-center max-w-sm">
                {{ $t('repos-empty') }}
              </p>
              <ULink
                v-if="workflow.githubInstallUrl"
                :href="workflow.githubInstallUrl"
                class="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {{ $t('repos-edit-access') }}
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
          :title="$t('error')"
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
import { useGithubFlow } from './githubFlow';
import {
  type EditingRepository,
  type GithubRepoSummary,
  useWorkflowStore,
} from './workflow';
import { locales } from './locales';
import { compareGithubRepos } from '~/lib/githubRepoOrder';
import { filterReposByQuery } from '~/lib/repoFilter';
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
const flow = useGithubFlow();
const nav = useNavigationStore();

const githubDisabled = computed(() => !githubEnabledAtBuild || workflow.githubConfigured === false);
const isExchanging = computed(() => workflow.githubStep === 'exchange');
const loggingOut = ref(false);

const repos = ref<GithubRepoSummary[]>([]);
const repoLoading = ref(false);
const repoLoadingMore = ref(false);
const reposPage = ref(1);
const reposHasMore = ref(false);
const repoLoadingId = ref<number | null>(null);
const repoQuery = ref('');

/**
 * Monotonic id for repository list requests. A response is only applied
 * when it belongs to the newest request, so switching accounts while a
 * load is in flight cannot show the previous installation's repositories.
 */
let reposRequestId = 0;

const steps = computed(() => [
  { key: 'signin', label: $t('step-signin') },
  { key: 'install', label: $t('step-install') },
  { key: 'repository', label: $t('step-repository') },
]);

/** Index of the step the user is currently on (see the progress list). */
const currentStepIndex = computed(() => {
  if (!workflow.githubUser) return 0;
  return workflow.githubStep === 'install' ? 1 : 2;
});

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

const selectedInstallation = computed(() =>
  (workflow.githubInstallations ?? []).find(
    installation => installation.id === workflow.selectedInstallationId,
  ) ?? null,
);

/**
 * Warn only when the installation can access *all* repositories; a long
 * list of explicitly selected repositories is not "too broad".
 */
const showManyReposHint = computed(() => selectedInstallation.value?.repositorySelection === 'all');

const filteredSupportedRepos = computed(() =>
  filterReposByQuery(supportedRepos.value, repoQuery.value),
);

const filteredUnsupportedRepos = computed(() =>
  filterReposByQuery(unsupportedRepos.value, repoQuery.value),
);

watch(
  () => workflow.selectedInstallationId,
  () => {
    void loadRepos(true);
  },
);

onMounted(async () => {
  if (workflow.githubStep === 'exchange') return;

  if (workflow.githubConfigured && !workflow.githubUser) {
    await flow.refreshSession({ busy: true });
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
    const result = await flow.signOut();
    if (!result.ok) {
      toast.add({
        color: 'error',
        title: $t('logout-failed'),
        description: result.message,
      });
      return;
    }
    workflow.githubStep = 'repositories';
    workflow.githubError = null;
    toast.add({
      color: 'neutral',
      title: $t('logged-out'),
    });
  }
  finally {
    loggingOut.value = false;
  }
}

/**
 * Re-read the session to obtain a fresh app-installation URL. Used by the
 * install screen when the first response did not include one (e.g. a
 * transient GitHub API error), so the step is not a dead end.
 */
async function retryInstallUrl(): Promise<void> {
  await flow.refreshSession({ busy: true });
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
  if (!reset && repoLoadingMore.value) return;

  const requestId = ++reposRequestId;

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
      perPage: 100,
    });
    // A newer request (e.g. the user switched accounts) has superseded
    // this one; drop the response instead of overwriting fresher state.
    if (requestId !== reposRequestId) return;

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
      // A page that came back empty (or short) means the API returned every
      // repository, so there is nothing left to load — even if the reported
      // total count suggests otherwise.
      reposHasMore.value = data.hasMore && data.repos.length > 0;
    }
  }
  catch (error) {
    if (requestId !== reposRequestId) return;
    workflow.setGithubError(error instanceof Error ? error.message : String(error), 'repositories');
  }
  finally {
    if (requestId === reposRequestId) {
      repoLoading.value = false;
      repoLoadingMore.value = false;
    }
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
  if (repoLoadingId.value !== null || workflow.githubBusy) return;

  repoLoadingId.value = repo.id;
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
        title: $t('load-failed'),
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
      title: $t('load-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
  finally {
    repoLoadingId.value = null;
    workflow.githubBusy = false;
  }
}
</script>

<ftl locale="en">
back = Back
exchanging = Finishing GitHub sign-in…
steps-label = Setup progress
step-signin = Sign in
step-install = Install app
step-repository = Choose repository

auth-title = Sign in with GitHub
not-configured = GitHub integration is not configured on this server
connect = Connect to GitHub

install-title = Install the Shield Wizard App
install-description = Choose which repositories the app may access.
install-signed-in = Signed in. Grant the app access to the repositories you want to edit.
install-choose-repos-title = Choose which repositories Shield Wizard can access
install-choose-repos-hint = Choose “Only select repositories” instead of “All repositories”.
install-action = Continue to Install
install-return-hint = GitHub will bring you back here automatically when the installation finishes.
install-url-missing = App installation link unavailable

repos-title = Choose a Repository
repos-signed-in = Signed in to GitHub
repos-signed-out = Not signed in to GitHub
repos-account = GitHub Account
repos-edit-access = Edit Repository Access
repos-loading = Loading repositories…
repos-search = Search repositories…
repos-search-clear = Clear search
repos-no-match = No Shield Wizard repositories match “{ $query }”.
repos-no-supported = No Shield Wizard compatible repositories found. Create one with Shield Wizard first.
repos-unsupported-count = {$count ->
  [1] 1 unsupported repository
  *[other] {$count} unsupported repositories
}
repos-many-title = Repository Access Too Broad
repos-many-hint = In GitHub's app settings, choose “Only select repositories” instead of “All repositories”.
repos-empty = No repositories found. Grant the app access to a repository, or switch accounts.
repos-load-more = Load More
repos-load-failed = Could not load repositories
retry = Try Again

error = Something went wrong
load-failed = Could not open repository
</ftl>

<ftl locale="zh-CN">
back = 返回
exchanging = 正在完成 GitHub 登录…
steps-label = 设置进度
step-signin = 登录
step-install = 安装应用
step-repository = 选择仓库

auth-title = 使用 GitHub 登录
not-configured = 此服务器尚未配置 GitHub 集成
connect = 使用 GitHub 登录

install-title = 安装 Shield Wizard App
install-description = 选择允许应用访问的仓库。
install-signed-in = 已登录。请给应用授予要编辑的仓库的访问权限。
install-choose-repos-title = 选择允许 Shield Wizard 访问的仓库
install-choose-repos-hint = 请在 GitHub 应用设置里把“All repositories”改为“Only select repositories”。
install-action = 继续安装
install-return-hint = 安装完成后会自动回到这里。
install-url-missing = 无法生成应用安装链接

repos-title = 选择仓库
repos-signed-in = 已登录 GitHub
repos-signed-out = 尚未登录 GitHub
repos-account = GitHub 账号
repos-edit-access = 管理仓库访问权限
repos-loading = 正在加载仓库…
repos-search = 搜索仓库…
repos-search-clear = 清除搜索
repos-no-match = 没有匹配“{ $query }”的 Shield Wizard 仓库。
repos-no-supported = 没有找到兼容 Shield Wizard 的仓库。请先用 Shield Wizard 创建一个仓库。
repos-unsupported-count = {$count ->
  [1] 1 个不支持的仓库
  *[other] {$count} 个不支持的仓库
}
repos-many-title = 应用可访问的仓库过多
repos-many-hint = 请在 GitHub 应用设置中选择“Only select repositories”，不要选“All repositories”。
repos-empty = 没有找到仓库。请让应用能访问至少一个仓库，或切换账号。
repos-load-more = 加载更多
repos-load-failed = 无法加载仓库
retry = 重试

error = 出错了
load-failed = 无法打开仓库
</ftl>

<ftl locale="ja">
back = 戻る
exchanging = GitHub のサインインを完了しています…
steps-label = セットアップの進行状況
step-signin = サインイン
step-install = アプリをインストール
step-repository = リポジトリを選択

auth-title = GitHub でサインイン
not-configured = このサーバーでは GitHub 連携が設定されていません
connect = GitHub にサインイン

install-title = Shield Wizard App をインストール
install-description = アプリがアクセスできるリポジトリを選択してください。
install-signed-in = サインイン済みです。編集したいリポジトリへのアクセスをアプリに許可してください。
install-choose-repos-title = Shield Wizard にアクセスさせるリポジトリを選んでください
install-choose-repos-hint = 「All repositories」ではなく「Only select repositories」を選んでください。
install-action = インストールへ進む
install-return-hint = インストールが完了すると、自動的にここに戻ります。
install-url-missing = アプリのインストールリンクを取得できません

repos-title = リポジトリを選択
repos-signed-in = GitHub にサインイン済み
repos-signed-out = GitHub にサインインしていません
repos-account = GitHub アカウント
repos-edit-access = リポジトリのアクセス権を管理
repos-loading = リポジトリを読み込み中…
repos-search = リポジトリを検索…
repos-search-clear = 検索をクリア
repos-no-match = 「{ $query }」に一致する Shield Wizard リポジトリはありません。
repos-no-supported = Shield Wizard に対応したリポジトリが見つかりません。先に Shield Wizard で作成してください。
repos-unsupported-count = {$count ->
  [1] 未対応のリポジトリ 1 件
  *[other] 未対応のリポジトリ {$count} 件
}
repos-many-title = アクセスできるリポジトリが多すぎます
repos-many-hint = GitHub アプリの設定で「All repositories」ではなく「Only select repositories」を選んでください。
repos-empty = リポジトリが見つかりません。アプリにいずれかのリポジトリへのアクセスを許可するか、アカウントを切り替えてください。
repos-load-more = もっと読み込む
repos-load-failed = リポジトリを読み込めませんでした
retry = 再試行

error = エラーが発生しました
load-failed = リポジトリを開けませんでした
</ftl>
