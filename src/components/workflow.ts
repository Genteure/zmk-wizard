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
  /** Set when a GitHub action failed because the session expired. Unlike a
   *  plain error, the editor stays open (with the unsaved work) and offers
   *  to sign in again instead of dropping the user at the picker. */
  const sessionExpired = ref(false);
  /** Commit message for the current save. Kept in the store so it survives
   *  the editor remount that follows a re-authentication. */
  const commitMessage = ref('');
  /** One-shot request to reopen the commit modal once a restored draft is
   *  back in the editor. */
  const resumeCommit = ref(false);
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
    sessionExpired.value = false;
    commitMessage.value = '';
    resumeCommit.value = false;
  }

  function enterNewEditor() {
    mode.value = 'new';
    screen.value = 'editor';
    githubStep.value = 'auth';
    githubError.value = null;
    editingRepository.value = null;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;
    sessionExpired.value = false;
    commitMessage.value = '';
    resumeCommit.value = false;
    editorSessionId.value = nextEditorSessionId++;
  }

  function enterGithub(step: GithubStep = 'auth') {
    mode.value = 'edit';
    screen.value = 'github';
    githubStep.value = step;
    githubError.value = null;
    // Leaving the editor ends the reconnect offer; the picker has its own
    // sign-in path.
    sessionExpired.value = false;
  }

  function enterEditor(repository: EditingRepository | null = null) {
    screen.value = 'editor';
    mode.value = repository ? 'edit' : mode.value ?? 'new';
    editingRepository.value = repository;
    githubError.value = null;
    githubBusy.value = false;
    githubReturnScreen.value = null;
    githubReturnMode.value = null;
    sessionExpired.value = false;
    commitMessage.value = '';
    resumeCommit.value = false;
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
    // A fresh session means the expiry is over.
    if (session.user) sessionExpired.value = false;
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

  /**
   * Record that the GitHub session expired or was revoked.
   *
   * This intentionally does NOT navigate away from the editor: the unsaved
   * keyboard state only exists in memory, so dropping the user at the picker
   * (and then reloading the repository after re-auth) would silently throw
   * the work away. The caller is responsible for snapshotting a draft and
   * offering a re-authentication action; `message` is only used by screens
   * that render the error themselves (the repository picker).
   */
  function expireSession(message?: string) {
    clearSession();
    githubStep.value = 'repositories';
    githubError.value = message ?? null;
    sessionExpired.value = true;
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
    sessionExpired,
    commitMessage,
    resumeCommit,
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
