// ─────────────────────────────────────────────────────────────
// Editor draft (sessionStorage)
//
// GitHub sign-in is a full-page redirect, so every store (including the
// keyboard being edited) is torn down while the user is away at GitHub.
// Without a snapshot, a session that expires mid-save silently discards
// unsaved work: the user re-authenticates, re-picks the repository, and
// the editor reloads the last committed state from GitHub.
//
// Before sending the user through OAuth the editor snapshots itself here,
// and the OAuth return restores it. `sessionStorage` (not localStorage)
// is deliberate: a draft belongs to one tab and one task, must not leak
// into other tabs, and should die with the tab.
//
// The draft is encoded with the stable data format so a restore gets the
// same validation and migrations a repository file would. A raw Keyboard
// JSON fallback keeps the draft usable if the stable schema ever rejects
// the in-memory state.
// ─────────────────────────────────────────────────────────────

import { parseShieldWizardData, serializeShieldWizardData } from '~/lib/dataFormat';
import type { Keyboard } from '~/types';
import type { EditingRepository } from './workflow';

export const EDITOR_DRAFT_STORAGE_KEY = 'shield-wizard:editor-draft';

const DRAFT_VERSION = 1;

export interface EditorDraftInput {
  repository: EditingRepository;
  keyboard: Keyboard;
  commitMessage: string;
}

/** Decoded draft, ready to apply to the editor. */
export interface EditorDraft {
  version: number;
  /** How `keyboard` was encoded: canonical envelope or raw Keyboard JSON. */
  format: 'stable' | 'raw';
  repository: EditingRepository;
  keyboard: Keyboard;
  commitMessage: string;
  createdAt: number;
}

/** On-disk shape: `keyboard` is still encoded and not yet validated. */
interface StoredEditorDraft extends Omit<EditorDraft, 'keyboard'> {
  keyboard: unknown;
}

function draftStorage(): Storage | null {
  try {
    // Accessing sessionStorage can throw in private modes or sandboxed
    // frames, and it does not exist at all under the node test runner.
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  }
  catch {
    return null;
  }
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function encodeKeyboard(keyboard: Keyboard): Pick<StoredEditorDraft, 'format' | 'keyboard'> {
  try {
    return {
      format: 'stable',
      keyboard: JSON.parse(serializeShieldWizardData(keyboard, { allowPartial: true })) as unknown,
    };
  }
  catch {
    // Same fallback as the debug dialog: keep the draft usable even when
    // the stable schema rejects the state.
    return { format: 'raw', keyboard: plainClone(keyboard) };
  }
}

function isEditingRepository(value: unknown): value is EditingRepository {
  if (typeof value !== 'object' || value === null) return false;
  const repository = value as Partial<EditingRepository>;
  const owner = repository.owner as { login?: unknown } | undefined;
  return typeof repository.name === 'string'
    && typeof repository.fullName === 'string'
    && typeof repository.defaultBranch === 'string'
    && typeof owner === 'object' && owner !== null
    && typeof owner.login === 'string';
}

function decodeKeyboard(draft: Partial<StoredEditorDraft>): Keyboard | null {
  try {
    if (draft.format === 'stable') {
      return parseShieldWizardData(draft.keyboard, { allowPartial: true }).keyboard;
    }
    // Raw fallback: the state was already business-validated before the
    // draft was written, so accept it structurally instead of discarding
    // work the stable schema could not round-trip.
    const keyboard = draft.keyboard as Partial<Keyboard> | null;
    if (typeof keyboard !== 'object' || keyboard === null) return null;
    if (!Array.isArray(keyboard.parts) || !Array.isArray(keyboard.layout)) return null;
    return keyboard as Keyboard;
  }
  catch {
    return null;
  }
}

/**
 * Snapshot the current editor state. Best-effort: storage failures (quota,
 * private mode) must never break the save flow that triggered the snapshot.
 */
export function saveEditorDraft(input: EditorDraftInput): void {
  const storage = draftStorage();
  if (!storage) return;

  try {
    const draft: StoredEditorDraft = {
      version: DRAFT_VERSION,
      ...encodeKeyboard(input.keyboard),
      repository: plainClone(input.repository),
      commitMessage: input.commitMessage,
      createdAt: Date.now(),
    };
    storage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }
  catch {
    // Ignore: the draft is a safety net, not a requirement.
  }
}

/**
 * Read and validate the stored draft. Returns `null` for a missing,
 * corrupt, or incompatible draft; invalid entries are removed.
 */
export function loadEditorDraft(): EditorDraft | null {
  const storage = draftStorage();
  if (!storage) return null;

  let parsed: unknown;
  try {
    const raw = storage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  }
  catch {
    clearEditorDraft();
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    clearEditorDraft();
    return null;
  }

  const draft = parsed as Partial<StoredEditorDraft>;
  const compatible = draft.version === DRAFT_VERSION
    && (draft.format === 'stable' || draft.format === 'raw')
    && isEditingRepository(draft.repository)
    && typeof draft.commitMessage === 'string';
  if (!compatible) {
    clearEditorDraft();
    return null;
  }

  const keyboard = decodeKeyboard(draft);
  if (!keyboard) {
    clearEditorDraft();
    return null;
  }

  return {
    version: DRAFT_VERSION,
    format: draft.format as EditorDraft['format'],
    repository: draft.repository as EditingRepository,
    keyboard,
    commitMessage: draft.commitMessage as string,
    createdAt: typeof draft.createdAt === 'number' ? draft.createdAt : Date.now(),
  };
}

export function clearEditorDraft(): void {
  const storage = draftStorage();
  if (!storage) return;
  try {
    storage.removeItem(EDITOR_DRAFT_STORAGE_KEY);
  }
  catch {
    // Ignore.
  }
}
