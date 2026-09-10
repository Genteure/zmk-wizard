import { describe, expect, it } from 'vitest';
import {
  createGithubOAuthState,
  GITHUB_SESSION_MAX_AGE_SECONDS,
  openGithubSession,
  sealGithubSession,
  verifyGithubOAuthState,
} from './githubSession';

const SECRET = 'test-secret-with-enough-entropy';

describe('github session cookie', () => {
  it('round-trips an access token', async () => {
    const cookie = await sealGithubSession('gho_token_value', SECRET);
    expect(cookie.startsWith('v1.')).toBe(true);

    const token = await openGithubSession(cookie, SECRET);
    expect(token).toBe('gho_token_value');
  });

  it('rejects a tampered cookie', async () => {
    const cookie = await sealGithubSession('gho_token_value', SECRET);
    const parts = cookie.split('.');
    const tampered = `${parts[0]}.${parts[1]}.AAAA${parts[2].slice(4)}`;
    await expect(openGithubSession(tampered, SECRET)).resolves.toBeNull();
  });

  it('rejects a cookie encrypted with another secret', async () => {
    const cookie = await sealGithubSession('gho_token_value', SECRET);
    await expect(openGithubSession(cookie, 'other-secret')).resolves.toBeNull();
  });

  it('rejects expired sessions', async () => {
    const now = 1_000_000;
    const cookie = await sealGithubSession('gho_token_value', SECRET, now);
    await expect(openGithubSession(cookie, SECRET, now + 1000)).resolves.toBe('gho_token_value');
    await expect(
      openGithubSession(cookie, SECRET, now + GITHUB_SESSION_MAX_AGE_SECONDS * 1000 + 1),
    ).resolves.toBeNull();
  });

  it('returns null for missing or malformed input', async () => {
    await expect(openGithubSession(undefined, SECRET)).resolves.toBeNull();
    await expect(openGithubSession('not-a-cookie', SECRET)).resolves.toBeNull();
    await expect(openGithubSession('v1.abc', SECRET)).resolves.toBeNull();
  });
});

describe('github oauth state', () => {
  it('round-trips the flow payload and survives URL encoding', async () => {
    const state = await createGithubOAuthState(SECRET, {
      intent: 'edit',
      returnScreen: 'editor',
      returnMode: 'edit',
    });
    expect(state).not.toContain('+');
    expect(state).not.toContain('/');

    const payload = await verifyGithubOAuthState(SECRET, decodeURIComponent(state));
    expect(payload).toMatchObject({
      intent: 'edit',
      returnScreen: 'editor',
      returnMode: 'edit',
    });
  });

  it('rejects expired states', async () => {
    const now = 1_000_000;
    const state = await createGithubOAuthState(SECRET, { intent: 'edit' }, { now, ttlMs: 1000 });
    await expect(verifyGithubOAuthState(SECRET, state, now + 1001)).resolves.toBeNull();
    await expect(verifyGithubOAuthState(SECRET, state, now + 999)).resolves.toMatchObject({ intent: 'edit' });
  });

  it('rejects bad signatures and malformed payloads', async () => {
    const state = await createGithubOAuthState(SECRET, { intent: 'edit' });
    await expect(verifyGithubOAuthState('other-secret', state)).resolves.toBeNull();
    await expect(verifyGithubOAuthState(SECRET, `${state}x`)).resolves.toBeNull();
    await expect(verifyGithubOAuthState(SECRET, 'bad')).resolves.toBeNull();
    await expect(verifyGithubOAuthState(undefined, undefined)).resolves.toBeNull();
  });
});
