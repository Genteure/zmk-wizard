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
import { lazyComponent, scheduleIdlePreload } from '~/lib/lazyComponent';
import type { Key, Keyboard } from '~/types';
import type { ImportedLayout } from './editor/utils/layouthelper';
import { clearLayoutHash, KLE_HASH_PREFIX } from './editor/utils/layoutHash';
import { loadUrlImport, preloadUrlImport } from './editor/utils/urlImportPreload';
import { clearEditorDraft, loadEditorDraft, saveEditorDraft } from './editorDraft';
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

// Heavy screens are loaded on demand so the initial island bundle only carries
// the start screen and the shared shell, then prefetched once the browser is
// idle so entering them during that visit is instant.
const App = lazyComponent(() => import('./app.vue'));
const GitHubSetup = lazyComponent(() => import('./GitHubSetup.vue'));
const LayoutImportChoiceModal = lazyComponent(() => import('./editor/utils/LayoutImportChoiceModal.vue'));

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

/**
 * Snapshot the editor before an OAuth redirect. The redirect reloads the
 * whole app, so without this the in-memory keyboard (and the commit
 * message) would be lost even though the user is only re-authenticating.
 */
function captureEditorDraft(): void {
  const repository = workflow.editingRepository;
  if (!repository) return;
  saveEditorDraft({
    repository,
    keyboard: toRaw(keyboard.$state),
    commitMessage: workflow.commitMessage,
  });
}

/**
 * Restore a draft captured before the OAuth redirect. Returns false when
 * there is nothing usable, so the caller can fall back to the normal
 * post-login routing.
 */
function restoreEditorDraft(): boolean {
  const draft = loadEditorDraft();
  if (!draft) return false;

  resetEditorState();
  history.batch(() => {
    keyboard.$patch((state) => {
      Object.assign(state, toRaw(draft.keyboard));
    });
  });
  // The restored state is the new baseline, not an undoable step.
  history.clear();
  workflow.enterEditor(draft.repository);
  // enterEditor() clears session-scoped state, so the restored message and
  // the one-shot resume request must be applied after it.
  workflow.commitMessage = draft.commitMessage;
  workflow.resumeCommit = true;
  nav.dialog.info = false;
  clearEditorDraft();

  toast.add({
    color: 'info',
    title: $t('draft-restored'),
    description: $t('draft-restored-desc'),
  });
  return true;
}

function startNewFlow(): void {
  // If the user starts a new flow while the layout-import choice modal is
  // open, that hash belongs to the previous task and should be discarded.
  // Startup URLs are safe because the modal is not open yet at this point.
  const hadPendingImport = importChoiceOpen.value;
  resetEditorState();
  clearEditorDraft();
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
  // A repository loaded from GitHub is authoritative: any snapshot from an
  // interrupted save is superseded.
  clearEditorDraft();
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
  // Signing in leaves the page for GitHub; keep an editing session's work
  // so the callback can restore it.
  if (workflow.isEditing) captureEditorDraft();

  const result = await flow.beginAuth({
    intent: 'login',
    returnScreen: workflow.screen === 'editor' ? 'editor' : 'start',
    returnMode: workflow.mode,
  });
  if (!result.ok) {
    toast.add({
      color: 'error',
      title: $t('login-failed'),
      description: result.message,
    });
    return;
  }
  window.location.assign(result.authorizeUrl);
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
  clearEditorDraft();
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
      // Re-entering an interrupted edit: restore the snapshot captured
      // before the redirect and reopen the save dialog.
      if (restoreEditorDraft()) return;

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

async function handleLayoutHashImport(): Promise<void> {
  // Bail out before loading the KLE parser for the common no-hash visit.
  if (typeof window === 'undefined') return;
  if (!window.location.hash.startsWith(KLE_HASH_PREFIX)) return;

  try {
    const { extractLayoutChoiceFromHash } = await loadUrlImport();
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

/**
 * Warn visitors that they are on a preview deployment rather than the
 * stable host. Runs at page load so the notice is visible before the user
 * picks new/edit and enters the editor.
 */
function showDeploymentNotice(): void {
  const hostname = window.location.hostname;
  if (hostname === 'shield-wizard.genteure.com') {
    return;
  }

  // *.workers.dev
  if (hostname === 'localhost' || hostname.endsWith('.workers.dev')) {
    toast.add({
      color: 'warning',
      title: $t('host-title-preview'),
      description: $t('host-desc-preview'),
      actions: [
        {
          color: 'primary',
          variant: 'outline',
          label: $t('host-action'),
          onClick() {
            window.open('https://shield-wizard.genteure.com', '_blank');
          },
        },
      ],
      duration: 0, // Do not auto-dismiss
    });
    return;
  }

  toast.add({
    color: 'warning',
    title: $t('host-title-unknown'),
    description: $t('host-desc-unknown'),
    actions: [
      {
        color: 'primary',
        variant: 'outline',
        label: $t('host-action'),
        onClick() {
          window.open('https://shield-wizard.genteure.com', '_blank');
        },
      },
    ],
    duration: 30000, // 30 seconds
  });
}

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

  await handleLayoutHashImport();
}

onMounted(() => {
  showDeploymentNotice();
  void initializeWorkflow();

  // Nothing here is needed for the first paint, so warm it up on idle rather
  // than making the user wait for a chunk after they click.
  scheduleIdlePreload(
    App.preload,
    GitHubSetup.preload,
    LayoutImportChoiceModal.preload,
    preloadUrlImport,
  );
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
draft-restored = Unsaved changes restored
draft-restored-desc = Review the changes and save them to GitHub.

host-title-preview = This is a preview deployment
host-title-unknown = Unknown Deployment Mode
-host-desc-stable = Please visit shield-wizard.genteure.com for the latest stable version of Shield Wizard.
host-desc-preview = You are using a preview deployment of Shield Wizard hosted on *.workers.dev domains. {-host-desc-stable}
host-desc-unknown = You are using (presumably) a preview deployment of Shield Wizard. {-host-desc-stable}
host-action = Go to shield-wizard.genteure.com
</ftl>

<ftl locale="zh-CN">
loading = 正在加载 Shield Wizard…
loaded-with-issues = 仓库已加载，但有警告
legacy-data = 旧版仓库数据
legacy-data-desc = 这个仓库还是旧版数据格式。保存时服务器会自动升级为带版本号的新格式。
login-failed = 无法开始 GitHub 登录
oauth-error = GitHub 登录未能完成。
draft-restored = 已恢复未保存的修改
draft-restored-desc = 请检查变更内容，然后保存到 GitHub。

host-title-preview = 当前为预览部署
host-title-unknown = 未知部署模式
-host-desc-stable = 最新稳定版本的 Shield Wizard 位于 shield-wizard.genteure.com。
host-desc-preview = 你正在使用 Shield Wizard 在 *.workers.dev 域名上提供的预览版本。{-host-desc-stable}
host-desc-unknown = 你正在使用（可能是）Shield Wizard 的预览部署。{-host-desc-stable}
host-action = 打开 shield-wizard.genteure.com
</ftl>

<ftl locale="ja">
loading = Shield Wizard を読み込んでいます…
loaded-with-issues = リポジトリを読み込みましたが警告があります
legacy-data = 旧形式のリポジトリデータ
legacy-data-desc = このリポジトリは安定版のデータ形式より前に作られたものです。保存すると、サーバー側で新しい形式にアップグレードされます。
login-failed = GitHub のサインインを開始できませんでした
oauth-error = GitHub のサインインを完了できませんでした。
draft-restored = 未保存の変更を復元しました
draft-restored-desc = 変更内容を確認して GitHub に保存してください。

host-title-preview = これはプレビュー版です
host-title-unknown = デプロイモード不明
-host-desc-stable = 最新版の Shield Wizard は shield-wizard.genteure.com からどうぞ。
host-desc-preview = *.workers.dev ドメインで公開されているプレビュー版の Shield Wizard を利用しています。{-host-desc-stable}
host-desc-unknown = （おそらく）プレビュー版の Shield Wizard を利用しています。{-host-desc-stable}
host-action = shield-wizard.genteure.com へ移動
</ftl>
