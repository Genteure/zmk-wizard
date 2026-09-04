<template>
  <UApp :locale="localeMap[nav.locale]">
    <div class="isolate">
      <div
        v-if="!workflow.initialized"
        class="min-h-screen flex flex-col items-center justify-center gap-3"
      >
        <UIcon
          name="i-svg-spinners-90-ring"
          class="size-10 text-primary"
        />
        <p class="text-sm text-toned">
          Loading Shield Wizard…
        </p>
      </div>

      <StartScreen
        v-else-if="workflow.screen === 'start'"
        @new="startNewFlow"
        @edit="startEditFlow"
        @logout="logout"
      />

      <GitHubSetup
        v-else-if="workflow.screen === 'github'"
        @cancel="workflow.showStart()"
        @loaded="applyLoadedRepository"
      />

      <App
        v-else
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
import StartScreen from './StartScreen.vue';
import { fluent, localeBundleMap, localeMap } from './locales';
import { useHistoryStore } from './history';
import { useKeyboardStore, useNavigationStore, useSelectionStore } from './stores';
import {
  type EditingRepository,
  useWorkflowStore,
} from './workflow';
import { applyWorkflowTab, isInstallCallback, isOAuthCallback, parseWorkflowUrl, stripWorkflowSearch } from './workflowUrl';

const { $t } = useFluent();
const toast = useToast();

const nav = useNavigationStore();
const keyboard = useKeyboardStore();
const history = useHistoryStore();
const workflow = useWorkflowStore();

const importChoiceOpen = ref(false);
// shallowRef: candidates are only replaced wholesale; deep reactivity would
// wrap the Key arrays in proxies that structuredClone rejects.
const pendingImportChoice = shallowRef<ImportedLayout | null>(null);

function applyImportedKeys(keys: Key[]) {
  keyboard.$patch({ layout: structuredClone(toRaw(keys)) });
  keyboard.sortLayout();
  nav.activeTab = 'layout';
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

// ─── Workflow transitions ───────────────────────────────────

function resetEditorState(): void {
  keyboard.$reset();
  history.clear();
  useSelectionStore().clearSelected();
  nav.$patch({
    activeTab: 'layout',
    activePart: null,
    dialog: { info: false },
    build: { repoId: '' },
  });
}

function startNewFlow(): void {
  resetEditorState();
  workflow.enterNewEditor();
  nav.dialog.info = true;
}

function startEditFlow(): void {
  workflow.enterGithub();
  if (workflow.githubUser) {
    workflow.githubStep = (workflow.githubInstallations?.length ?? 0) > 0
      ? 'repositories'
      : 'install';
  }
}

function applyLoadedRepository(payload: {
  keyboard: Keyboard;
  repository: EditingRepository;
  validationIssues: string[];
  wasLegacy: boolean;
}): void {
  resetEditorState();
  history.batch(() => {
    keyboard.$patch((state) => {
      Object.assign(state, toRaw(payload.keyboard));
    });
  });
  nav.dialog.info = false;
  workflow.enterEditor(payload.repository);

  if (payload.validationIssues.length > 0) {
    toast.add({
      color: 'warning',
      title: $t('workflow-loaded-with-issues'),
      description: payload.validationIssues.slice(0, 3).join('\n'),
      duration: 0,
    });
  }
  if (payload.wasLegacy) {
    toast.add({
      color: 'info',
      title: $t('workflow-legacy-data'),
      description: $t('workflow-legacy-data-desc'),
    });
  }
}

async function startLoginFlow(): Promise<void> {
  try {
    const { data, error } = await actions.githubBeginAuth({
      intent: 'login',
      returnScreen: workflow.screen === 'editor' ? 'editor' : 'start',
      returnMode: workflow.mode,
    });
    if (error) {
      toast.add({
        color: 'error',
        title: $t('workflow-login-failed'),
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
      title: $t('workflow-login-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

async function logout(): Promise<void> {
  try {
    const { error } = await actions.githubLogout();
    if (!error) {
      workflow.clearSession();
      workflow.showStart();
      toast.add({
        color: 'neutral',
        title: $t('workflow-logged-out'),
      });
    }
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: $t('workflow-logout-failed'),
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Session refresh / OAuth routing ─────────────────────────

async function refreshSession(): Promise<boolean> {
  try {
    const { data, error } = await actions.githubGetSession();
    if (error) {
      // Keep the last known session shape so a transient GitHub API error
      // (e.g. rate limit) is not misreported as "GitHub not configured".
      if (workflow.screen === 'github') {
        workflow.setGithubError(error.message, workflow.githubStep);
      }
      return false;
    }
    if (!data) return false;

    workflow.setSession(data);
    if (workflow.screen === 'github') {
      routeEditSession();
    }
    return true;
  }
  catch (error) {
    console.warn('Failed to refresh GitHub session:', error);
    return false;
  }
}

function routeEditSession(): void {
  if (!workflow.githubUser) {
    workflow.githubStep = 'auth';
    return;
  }
  workflow.githubStep = (workflow.githubInstallations?.length ?? 0) > 0
    ? 'repositories'
    : 'install';
  const first = workflow.githubInstallations?.[0];
  if (first && workflow.selectedInstallationId === null) {
    workflow.selectedInstallationId = first.id;
  }
}

async function handleOAuthCallback(params: ReturnType<typeof parseWorkflowUrl>): Promise<void> {
  if (!params.code || !params.state) return;
  workflow.enterGithub('exchange');

  const { data, error } = await actions.githubCompleteAuth({
    code: params.code,
    state: params.state,
  });

  replaceWorkflowUrl();

  if (error || !data) {
    workflow.setGithubError(error?.message ?? 'OAuth callback failed', 'auth');
    return;
  }

  workflow.setSession(data);

  if (data.intent === 'login') {
    if (data.returnScreen === 'editor') {
      workflow.enterEditor();
      workflow.mode = data.returnMode ?? 'new';
    }
    else {
      workflow.showStart();
    }
    return;
  }

  // `edit` intent: continue in the GitHub setup flow.
  workflow.enterGithub();
  workflow.pendingRepo = data.repo;
  routeEditSession();
}

async function handleInstallCallback(): Promise<void> {
  workflow.enterGithub('repositories');
  replaceWorkflowUrl();
  await refreshSession();
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
  else if (isInstallCallback(params)) {
    workflow.initialized = true;
    await handleInstallCallback();
  }
  else if (params.action === 'new') {
    replaceWorkflowUrl();
    workflow.initialized = true;
    startNewFlow();
    applyWorkflowTab(params, (tab, part) => nav.$patch({ activeTab: tab, activePart: part }));
    void refreshSession();
  }
  else if (params.action === 'edit') {
    replaceWorkflowUrl();
    workflow.initialized = true;
    workflow.pendingRepo = params.repo;
    startEditFlow();
    applyWorkflowTab(params, (tab, part) => nav.$patch({ activeTab: tab, activePart: part }));
    await refreshSession();
    routeEditSession();
  }
  else {
    workflow.initialized = true;
    workflow.showStart();
    await refreshSession();
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
workflow-loaded-with-issues = Loaded with validation warnings
workflow-legacy-data = Legacy repository data
workflow-legacy-data-desc = This repository predates the stable data format. Saving will upgrade it to the versioned format on the server.
workflow-logged-out = Signed out of GitHub
workflow-logout-failed = Failed to sign out
workflow-login-failed = Failed to start GitHub sign-in
</ftl>

<ftl locale="zh-CN">
workflow-loaded-with-issues = 已加载，但存在验证警告
workflow-legacy-data = 旧版仓库数据
workflow-legacy-data-desc = 此仓库生成于稳定数据格式之前。保存时服务器会把它升级为带版本号的格式。
workflow-logged-out = 已退出 GitHub 登录
workflow-logout-failed = 退出登录失败
workflow-login-failed = 无法开始 GitHub 登录
</ftl>

<ftl locale="ja">
workflow-loaded-with-issues = 検証警告付きで読み込みました
workflow-legacy-data = 旧形式のリポジトリデータ
workflow-legacy-data-desc = このリポジトリは安定データ形式より前の形式です。保存時にサーバー側でバージョン付き形式へアップグレードされます。
workflow-logged-out = GitHubからサインアウトしました
workflow-logout-failed = サインアウトに失敗しました
workflow-login-failed = GitHubサインインを開始できませんでした
</ftl>
