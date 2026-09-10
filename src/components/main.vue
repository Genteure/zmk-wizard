<template>
  <UApp :locale="localeMap[nav.locale]">
    <div class="isolate">
      <div
        v-if="!workflow.initialized"
        class="min-h-screen flex flex-col items-center justify-center gap-3"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-10 text-primary animate-spin"
        />
        <p class="text-sm text-toned">
          {{ $t('loading') }}
        </p>
      </div>

      <StartScreen
        v-else-if="workflow.screen === 'start'"
        @new="startNewFlow"
        @edit="startEditFlow"
      />

      <GitHubSetup
        v-else-if="workflow.screen === 'github'"
        @cancel="workflow.cancelGithub()"
        @loaded="applyLoadedRepository"
      />

      <App
        v-else
        :key="workflow.editorSessionId"
        @new="startNewFlow"
        @edit="startEditFlow"
        @logout="logout"
        @login="startLoginFlow"
      />

      <LayoutImportChoiceModal
        v-model:open="importChoiceOpen"
        :result="pendingImportChoice"
        @select="applyImportChoice"
      />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { actions } from 'astro:actions';
import { useFluent } from 'fluent-vue';
import { onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import type { Key, Keyboard } from '~/types';
import App from './app.vue';
import LayoutImportChoiceModal from './editor/utils/LayoutImportChoiceModal.vue';
import type { ImportedLayout } from './editor/utils/layouthelper';
import { clearLayoutHash, extractLayoutChoiceFromHash } from './editor/utils/urlImport';
import GitHubSetup from './GitHubSetup.vue';
import { useGithubFlow } from './githubFlow';
import StartScreen from './StartScreen.vue';
import { fluent, localeBundleMap, localeMap } from './locales';
import { useHistoryStore } from './history';
import { useKeyboardStore, useNavigationStore, useSelectionStore } from './stores';
import {
  type EditingRepository,
  useWorkflowStore,
} from './workflow';
import { applyWorkflowTab, isInstallCallback, isOAuthCallback, isOAuthErrorCallback, parseWorkflowUrl, stripWorkflowSearch } from './workflowUrl';

const { $t } = useFluent();
const toast = useToast();

const nav = useNavigationStore();
const keyboard = useKeyboardStore();
const history = useHistoryStore();
const workflow = useWorkflowStore();
const flow = useGithubFlow();

const importChoiceOpen = ref(false);
// shallowRef: candidates are only replaced wholesale; deep reactivity would
// wrap the Key arrays in proxies that structuredClone rejects.
const pendingImportChoice = shallowRef<ImportedLayout | null>(null);

function applyImportedKeys(keys: Key[]) {
  keyboard.$patch({ layout: structuredClone(toRaw(keys)) });
  keyboard.sortLayout();
  useSelectionStore().clearSelected();
  nav.$patch({ activeTab: 'layout', activePart: null });
}

function applyImportChoice(choice: 'original' | 'generated') {
  const pending = pendingImportChoice.value;
  if (!pending) return;

  const keys = choice === 'original' ? pending.original : pending.generated;
  if (!keys) return;

  applyImportedKeys(keys);
  importChoiceOpen.value = false;
  pendingImportChoice.value = null;
  clearLayoutHash();
}

function closePendingImport(options: { clearHash?: boolean } = {}): void {
  importChoiceOpen.value = false;
  pendingImportChoice.value = null;
  if (options.clearHash) clearLayoutHash();
}

// ─── Workflow transitions ───────────────────────────────────

function resetEditorState(): void {
  keyboard.$reset();
  history.clear();
  useSelectionStore().clearSelected();
  // Close any pending URL-hash layout import from a previous task. The hash
  // itself is intentionally left alone here: startup imports read it after
  // the editor is initialized, and the choice modal keeps it until confirm.
  closePendingImport();
  nav.$patch({
    activeTab: 'layout',
    activePart: null,
    wiringSelection: null,
    dialog: { info: false },
    build: { repoId: '' },
  });
}

function startNewFlow(): void {
  // If the user starts a new flow while the layout-import choice modal is
  // open, that hash belongs to the previous task and should be discarded.
  // Startup URLs are safe because the modal is not open yet at this point.
  const hadPendingImport = importChoiceOpen.value;
  resetEditorState();
  if (hadPendingImport) clearLayoutHash();
  workflow.enterNewEditor();
  nav.dialog.info = true;
}

function startEditFlow(): void {
  closePendingImport({ clearHash: true });
  workflow.githubReturnScreen = workflow.screen;
  workflow.githubReturnMode = workflow.mode;
  workflow.enterGithub('repositories');
  if (workflow.githubUser && (workflow.githubInstallations?.length ?? 0) === 0) {
    workflow.githubStep = 'install';
  }
}

function applyLoadedRepository(payload: {
  keyboard: Keyboard;
  repository: EditingRepository;
  validationIssues: string[];
  wasLegacy: boolean;
}): void {
  const activeTab = nav.activeTab;
  const activePart = nav.activePart;
  resetEditorState();
  nav.$patch({ activeTab, activePart });
  history.batch(() => {
    keyboard.$patch((state) => {
      Object.assign(state, toRaw(payload.keyboard));
    });
  });
  // The repository load is the new baseline, not an editable undo step.
  // Without this, undoing the initial load returns to the default store
  // state and can leave the editor in an invalid state (e.g. an empty
  // keyboard name).
  history.clear();
  nav.dialog.info = false;
  workflow.enterEditor(payload.repository);

  if (payload.validationIssues.length > 0) {
    toast.add({
      color: 'warning',
      title: $t('loaded-with-issues'),
      description: payload.validationIssues.slice(0, 3).join('\n'),
      duration: 0,
    });
  }
  if (payload.wasLegacy) {
    toast.add({
      color: 'info',
      title: $t('legacy-data'),
      description: $t('legacy-data-desc'),
    });
  }
}

async function startLoginFlow(): Promise<void> {
  closePendingImport({ clearHash: true });
  try {
    const { data, error } = await actions.githubBeginAuth({
      intent: 'login',
      returnScreen: workflow.screen === 'editor' ? 'editor' : 'start',
      returnMode: workflow.mode,
    });
    if (error) {
      toast.add({
        color: 'error',
        title: $t('login-failed'),
        description: error.message,
      });
      return;
    }
    if (data) {
      window.location.assign(data.authorizeUrl);
    }
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: $t('login-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

async function logout(): Promise<void> {
  const result = await flow.signOut();
  if (!result.ok) {
    toast.add({
      color: 'error',
      title: $t('logout-failed'),
      description: result.message,
    });
    return;
  }

  closePendingImport({ clearHash: true });
  workflow.showStart();
  toast.add({
    color: 'neutral',
    title: $t('logged-out'),
  });
}

// ─── OAuth routing ───────────────────────────────────────────

async function handleOAuthCallback(params: ReturnType<typeof parseWorkflowUrl>): Promise<void> {
  if (!params.code || !params.state) return;
  workflow.enterGithub('exchange');

  const { data, error } = await actions.githubCompleteAuth({
    code: params.code,
    state: params.state,
  });

  replaceWorkflowUrl();

  if (error || !data) {
    workflow.setGithubError(error?.message ?? $t('oauth-error'), 'repositories');
    return;
  }

  workflow.setSession(data);

  if (data.intent === 'login') {
    if (data.returnScreen === 'editor') {
      workflow.enterEditor();
      // A page reload during OAuth loses the in-memory repository, so an
      // "edit" return can no longer resolve to one. Fall back to a new
      // shield rather than an edit mode with nothing to save.
      workflow.mode = data.returnMode === 'edit' && workflow.editingRepository ? 'edit' : 'new';
    }
    else {
      workflow.showStart();
    }
    return;
  }

  // `edit` intent: continue in the GitHub setup flow.
  workflow.enterGithub();
  workflow.pendingRepo = data.repo;
  flow.routeAfterSession();
}

async function handleInstallCallback(params: ReturnType<typeof parseWorkflowUrl>): Promise<void> {
  workflow.enterGithub('repositories');

  if (params.setupAction !== 'install' || !params.state) {
    replaceWorkflowUrl();
    workflow.setGithubError($t('oauth-error'), 'repositories');
    return;
  }

  const { data, error } = await actions.githubVerifyInstallState({
    state: params.state,
    setupAction: params.setupAction,
  });
  replaceWorkflowUrl();

  if (error || !data) {
    workflow.setGithubError(error?.message ?? $t('oauth-error'), 'repositories');
    return;
  }

  await flow.refreshSession();
}

function replaceWorkflowUrl(): void {
  try {
    const url = new URL(window.location.href);
    const next = stripWorkflowSearch(url);
    window.history.replaceState(window.history.state, '', next);
  }
  catch (error) {
    console.warn('Failed to clean workflow URL:', error);
  }
}

// ─── URL hash layout import ──────────────────────────────────

function handleLayoutHashImport(): void {
  try {
    const parsed = extractLayoutChoiceFromHash();
    if (!parsed) return;

    // Never let a KLE hash hijack an active GitHub flow.
    if (workflow.screen === 'github') {
      clearLayoutHash();
      return;
    }

    // A bare KLE link behaves like the historical "open the editor"
    // entry point: start a new shield, then import the layout.
    if (workflow.screen === 'start') {
      startNewFlow();
    }

    if (parsed.hasRowCol && parsed.original) {
      pendingImportChoice.value = parsed;
      importChoiceOpen.value = true;
      nav.activeTab = 'layout';
      // Keep the hash until the user confirms a choice, so a refresh
      // while the modal is open does not lose the pending import.
      return;
    }

    applyImportedKeys(parsed.generated);
    clearLayoutHash();
  }
  catch (err) {
    console.error('Failed to import layout from URL hash:', err);
    clearLayoutHash();
  }
}

// ─── Startup ─────────────────────────────────────────────────

async function initializeWorkflow(): Promise<void> {
  const url = new URL(window.location.href);
  const params = parseWorkflowUrl(url);

  if (isOAuthCallback(params)) {
    workflow.initialized = true;
    await handleOAuthCallback(params);
  }
  else if (isOAuthErrorCallback(params)) {
    workflow.initialized = true;
    replaceWorkflowUrl();
    workflow.showStart();
    // The launcher has no place to show a stored error, so surface the
    // denial/failure as a toast instead of leaving the user with no
    // explanation for why they are back at the start screen.
    const reason = params.errorDescription ?? params.error;
    toast.add({
      color: 'error',
      title: $t('oauth-error'),
      ...(reason ? { description: reason } : {}),
    });
  }
  else if (isInstallCallback(params)) {
    workflow.initialized = true;
    await handleInstallCallback(params);
  }
  else if (params.action === 'new') {
    replaceWorkflowUrl();
    workflow.initialized = true;
    startNewFlow();
    applyWorkflowTab(params, (tab, part) => nav.$patch({ activeTab: tab, activePart: part }));
    void flow.refreshSession();
  }
  else if (params.action === 'edit') {
    replaceWorkflowUrl();
    workflow.initialized = true;
    workflow.pendingRepo = params.repo;
    startEditFlow();
    applyWorkflowTab(params, (tab, part) => nav.$patch({ activeTab: tab, activePart: part }));
    await flow.refreshSession();
    flow.routeAfterSession();
  }
  else {
    workflow.initialized = true;
    workflow.showStart();
    await flow.refreshSession();
  }

  handleLayoutHashImport();
}

onMounted(() => {
  void initializeWorkflow();
});

watch(
  () => nav.locale,
  (newLocale) => {
    document.documentElement.setAttribute('lang', newLocale);
    const newBundle = localeBundleMap[newLocale];
    fluent.bundles = [newBundle, localeBundleMap['en']]; // Fallback to English for missing translations
  },
  { immediate: true },
);

// Set initial locale based on browser settings
type SupportedLocale = keyof typeof localeMap;
for (const lang of navigator.languages) {
  if (lang in localeMap) {
    nav.locale = lang as SupportedLocale;
    break;
  }

  let baseLang = lang.split('-')[0];
  if (baseLang === 'zh') {
    baseLang = 'zh-CN';
  }

  if (baseLang in localeMap) {
    nav.locale = baseLang as SupportedLocale;
    break;
  }
}
</script>

<ftl locale="en">
loading = Loading Shield Wizard…
loaded-with-issues = Repository loaded with warnings
legacy-data = Legacy repository data
legacy-data-desc = This repository predates the stable data format. Saving will upgrade it to the versioned format on the server.
login-failed = Failed to start GitHub sign-in
oauth-error = GitHub sign-in could not be completed.
</ftl>

<ftl locale="zh-CN">
loading = 正在加载 Shield Wizard…
loaded-with-issues = 仓库已加载，但有警告
legacy-data = 旧版仓库数据
legacy-data-desc = 这个仓库还是旧版数据格式。保存时服务器会自动升级为带版本号的新格式。
login-failed = 无法开始 GitHub 登录
oauth-error = GitHub 登录未能完成。
</ftl>

<ftl locale="ja">
loading = Shield Wizard を読み込んでいます…
loaded-with-issues = リポジトリを読み込みましたが警告があります
legacy-data = 旧形式のリポジトリデータ
legacy-data-desc = このリポジトリは安定版のデータ形式より前に作られたものです。保存すると、サーバー側で新しい形式にアップグレードされます。
login-failed = GitHub のサインインを開始できませんでした
oauth-error = GitHub のサインインを完了できませんでした。
</ftl>
