import { afterEach, describe, expect, test, vi } from 'vitest';
import LZString from 'lz-string';
import { extractLayoutFromHash, clearLayoutHash } from './urlImport';

/** Set a fake `window` with the given hash for the duration of a test. */
function stubWindow(hash: string) {
  const win = {
    location: { hash, href: `https://shield-wizard.genteure.com/${hash}` },
    document: { title: 'test' },
    history: { replaceState: vi.fn() },
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('history', win.history);
  vi.stubGlobal('document', win.document);
  return win;
}

/** Encode a KLE array the same way kle-ng does. */
function encodeKle(kleArray: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(kleArray));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractLayoutFromHash', () => {
  test('parses a #kle= payload into keys', () => {
    // Two 1u keys side by side.
    const payload = encodeKle([['', '']]);
    stubWindow(`#kle=${payload}`);

    const keys = extractLayoutFromHash();
    expect(keys).not.toBeNull();
    expect(keys!.length).toBe(2);
    expect(keys![0].x).toBe(0);
    expect(keys![1].x).toBe(1);
    expect(keys!.every((k) => k.w === 1 && k.h === 1)).toBe(true);
  });

  test('returns null when there is no #kle= hash', () => {
    stubWindow('#something-else');
    expect(extractLayoutFromHash()).toBeNull();
  });

  test('returns null for an empty payload', () => {
    stubWindow('#kle=');
    expect(extractLayoutFromHash()).toBeNull();
  });

  test('returns null for an undecodable payload', () => {
    stubWindow('#kle=not-valid-lz-data!!!');
    expect(extractLayoutFromHash()).toBeNull();
  });

  test('returns null when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    expect(extractLayoutFromHash()).toBeNull();
  });
});

describe('clearLayoutHash', () => {
  test('strips the #kle= hash via replaceState', () => {
    const win = stubWindow('#kle=abc');
    clearLayoutHash();
    expect(win.history.replaceState).toHaveBeenCalledWith(
      {},
      'test',
      'https://shield-wizard.genteure.com/',
    );
  });

  test('does nothing when there is no #kle= hash', () => {
    const win = stubWindow('#other');
    clearLayoutHash();
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
});
