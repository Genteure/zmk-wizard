// ─────────────────────────────────────────────────────────────
// Workflow store
//
// This store describes *what the current tab is doing*:
//
//   screen  start   — launcher: choose New Shield or Edit Repo
//   screen  github  — GitHub auth/install/repo-selection steps
//   screen  editor  — the normal Shield Wizard editor
//
// `mode` keeps the reason the editor is open: `new` (create a shield
// and optionally get an import link) or `edit` (save back to a GitHub
// repository). Exactly one flow is active per tab and the store is a
// plain Pinia store, so different tabs never share flow/UI state.
//
// Authentication state lives in the HttpOnly session cookie, which is
// shared between tabs by design (it is the user's login). A tab only
// notices another tab's logout when it next calls a GitHub action; the
// action returns UNAUTHORIZED and this store is reset locally.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type WorkflowScreen = 'start' | 'github' | 'editor';
export type WorkflowMode = 'new' | 'edit';
export type GithubStep = 'exchange' | 'auth' | 'install' | 'repositories';

export interface GithubUserSummary {
  login: string;
  id: number;
  avatarUrl: string;
  name: string | null;
}

export interface GithubInstallationSummary {
  id: number;
  account: {
    login: string;
    id: number;
    avatarUrl: string;
    type: 'User' | 'Organization';
  };
  repositorySelection: 'all' | 'selected';
  htmlUrl: string;
}

export interface GithubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  pushedAt: string | null;
  updatedAt: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
  hasShieldWizardConfig: boolean;
}

export interface EditingRepository {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  owner: {
    login: string;
    avatarUrl: string;
  };
  dataFileSha: string;
}

export interface GithubSessionSnapshot {
  configured: boolean;
  user: GithubUserSummary | null;
  installations: GithubInstallationSummary[] | null;
  installUrl: string | null;
  githubError: string | null;
}

export const useWorkflowStore = defineStore('workflow', () => {
  const initialized = ref(false);
  const screen = ref<WorkflowScreen>('start');
  const mode = ref<WorkflowMode | null>(null);
  const githubStep = ref<GithubStep>('auth');
  const githubBusy = ref(false);
  const githubError = ref<string | null>(null);
  /** null = backend status has not been fetched yet. */
  const githubConfigured = ref<boolean | null>(null);
  const githubUser = ref<GithubUserSummary | null>(null);
  const githubInstallations = ref<GithubInstallationSummary[] | null>(null);
  const githubInstallUrl = ref<string | null>(null);
  const selectedInstallationId = ref<number | null>(null);
  const editingRepository = ref<EditingRepository | null>(null);
  /** Where the GitHub flow was opened from, so Back can return there. */
  const githubReturnScreen = ref<WorkflowScreen | null>(null);
  /** Workflow to restore when cancelling GitHub flow back to the editor. */
  const githubReturnMode = ref<WorkflowMode | null>(null);
  /** Bumped whenever a new editor session starts. Used as a Vue key so
   *  editor-local UI state (modals, import buffers, commit drafts) cannot
   *  survive from one unrelated task to the next. */
  let nextEditorSessionId = 1;
  const editorSessionId = ref(0);

  const isNew = computed(() => screen.value === 'editor' && mode.value === 'new');
  // Edit mode is only meaningful with a repository to save back to. Keeping
  // the two in lockstep prevents a "Save Changes" action that has nowhere to
  // go (e.g. an OAuth return after the in-memory repository was lost).
  const isEditing = computed(() =>
    screen.value === 'editor' && mode.value === 'edit' && editingRepository.value !== null,
  );

  function showStart() {
    screen.value = 'start';
    mode.value = null;
    githubStep.value = 'auth';
    githubError.value = null;
    editingRepository.value = null;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;
  }

  function enterNewEditor() {
    mode.value = 'new';
    screen.value = 'editor';
    githubStep.value = 'auth';
    githubError.value = null;
    editingRepository.value = null;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;
    editorSessionId.value = nextEditorSessionId++;
  }

  function enterGithub(step: GithubStep = 'auth') {
    mode.value = 'edit';
    screen.value = 'github';
    githubStep.value = step;
    githubError.value = null;
  }

  function enterEditor(repository: EditingRepository | null = null) {
    screen.value = 'editor';
    mode.value = repository ? 'edit' : mode.value ?? 'new';
    editingRepository.value = repository;
    githubError.value = null;
    githubBusy.value = false;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;
    editorSessionId.value = nextEditorSessionId++;
  }

  function cancelGithub() {
    const returnScreen = githubReturnScreen.value;
    const returnMode = githubReturnMode.value;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;

    if (returnScreen === 'editor') {
      screen.value = 'editor';
      mode.value = returnMode;
      githubStep.value = 'auth';
      githubError.value = null;
      githubBusy.value = false;
      return;
    }

    showStart();
  }

  function setSession(session: GithubSessionSnapshot) {
    githubConfigured.value = session.configured;
    githubUser.value = session.user;
    githubInstallations.value = session.installations;
    githubInstallUrl.value = session.installUrl;
    githubError.value = session.githubError;
  }

  function clearSession() {
    githubUser.value = null;
    githubInstallations.value = null;
    githubInstallUrl.value = null;
    githubError.value = null;
    githubConfigured.value = null;
    selectedInstallationId.value = null;
  }

  function setGithubError(message: string, step: GithubStep = githubStep.value) {
    githubError.value = message;
    githubStep.value = step;
  }

  function expireSession() {
    clearSession();
    githubStep.value = 'repositories';
    githubError.value = 'GitHub session expired or was revoked. Please sign in again.';
    if (isEditing.value) {
      screen.value = 'github';
    }
  }

  return {
    initialized,
    screen,
    mode,
    editorSessionId,
    githubStep,
    githubBusy,
    githubError,
    githubConfigured,
    githubUser,
    githubInstallations,
    githubInstallUrl,
    selectedInstallationId,
    editingRepository,
    githubReturnScreen,
    githubReturnMode,
    isNew,
    isEditing,
    showStart,
    enterNewEditor,
    enterGithub,
    enterEditor,
    cancelGithub,
    setSession,
    clearSession,
    setGithubError,
    expireSession,
  };
});
