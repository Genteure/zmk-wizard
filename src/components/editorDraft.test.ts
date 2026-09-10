import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';
import type { Key, Keyboard, KeyId } from '~/types';
import type { EditingRepository } from './workflow';
import {
  clearEditorDraft,
  EDITOR_DRAFT_STORAGE_KEY,
  loadEditorDraft,
  saveEditorDraft,
} from './editorDraft';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  } as Storage;
}

function makeKeyboard(): Keyboard {
  const key: Key = {
    id: ulid() as KeyId,
    part: 0,
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    rx: 0,
    ry: 0,
  };
  return {
    name: 'Test Board',
    shield: 'test_board',
    dongle: false,
    modules: [],
    layout: [key],
    parts: [
      {
        name: 'left',
        controller: 'nice_nano_v2',
        pins: {},
        kscans: [],
        keys: {},
        encoders: [],
        buses: {},
      },
    ],
  } as Keyboard;
}

function makeRepository(): EditingRepository {
  return {
    id: 42,
    name: 'zmk-config',
    fullName: 'octocat/zmk-config',
    htmlUrl: 'https://github.com/octocat/zmk-config',
    defaultBranch: 'main',
    isPrivate: false,
    owner: { login: 'octocat', avatarUrl: 'https://example.com/a.png' },
    dataFileSha: 'abc123',
  };
}

describe('editor draft', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('round-trips a draft through sessionStorage', () => {
    const repository = makeRepository();
    saveEditorDraft({
      repository,
      keyboard: makeKeyboard(),
      commitMessage: 'Update keyboard configuration via Shield Wizard',
    });

    const draft = loadEditorDraft();
    expect(draft).not.toBeNull();
    expect(draft?.repository).toEqual(repository);
    expect(draft?.commitMessage).toBe('Update keyboard configuration via Shield Wizard');
    expect(draft?.keyboard.name).toBe('Test Board');
    expect(draft?.keyboard.shield).toBe('test_board');
    expect(draft?.keyboard.layout).toHaveLength(1);
  });

  it('returns null when no draft is stored', () => {
    expect(loadEditorDraft()).toBeNull();
  });

  it('discards a corrupt entry', () => {
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, '{not json');
    expect(loadEditorDraft()).toBeNull();
    expect(sessionStorage.getItem(EDITOR_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('discards a draft written by another version', () => {
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 999,
      format: 'raw',
      repository: makeRepository(),
      keyboard: makeKeyboard(),
      commitMessage: 'x',
      createdAt: Date.now(),
    }));
    expect(loadEditorDraft()).toBeNull();
    expect(sessionStorage.getItem(EDITOR_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('discards a draft with an unusable repository', () => {
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      format: 'raw',
      repository: { name: 'zmk-config' },
      keyboard: makeKeyboard(),
      commitMessage: 'x',
      createdAt: Date.now(),
    }));
    expect(loadEditorDraft()).toBeNull();
  });

  it('loads a raw-format draft structurally', () => {
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      format: 'raw',
      repository: makeRepository(),
      keyboard: makeKeyboard(),
      commitMessage: 'raw fallback',
      createdAt: Date.now(),
    }));

    const draft = loadEditorDraft();
    expect(draft?.commitMessage).toBe('raw fallback');
    expect(draft?.keyboard.shield).toBe('test_board');
  });

  it('rejects a raw draft without parts or layout', () => {
    sessionStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      format: 'raw',
      repository: makeRepository(),
      keyboard: { name: 'broken' },
      commitMessage: 'x',
      createdAt: Date.now(),
    }));
    expect(loadEditorDraft()).toBeNull();
  });

  it('is a no-op without sessionStorage', () => {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    expect(() => saveEditorDraft({
      repository: makeRepository(),
      keyboard: makeKeyboard(),
      commitMessage: 'x',
    })).not.toThrow();
    expect(loadEditorDraft()).toBeNull();
    expect(() => clearEditorDraft()).not.toThrow();
  });

  it('clears a stored draft', () => {
    saveEditorDraft({
      repository: makeRepository(),
      keyboard: makeKeyboard(),
      commitMessage: 'x',
    });
    expect(sessionStorage.getItem(EDITOR_DRAFT_STORAGE_KEY)).not.toBeNull();
    clearEditorDraft();
    expect(sessionStorage.getItem(EDITOR_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
