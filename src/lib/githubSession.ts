// ─────────────────────────────────────────────────────────────
// Stateless GitHub session support
//
// The GitHub feature does not keep any per-user state on the server.
// The user-to-server access token returned by GitHub is encrypted with
// AES-GCM (key derived from the `GITHUB_SESSION_SECRET` deployment
// secret) and stored in an HttpOnly cookie. The cookie is opaque to
// the browser and can be decrypted by any request, so there is no KV
// or database session to expire or replicate.
//
// The same secret signs the OAuth `state` parameter (HMAC-SHA-256).
// The state also carries the nonce that is stored in a short-lived
// HttpOnly cookie by the server, so the callback can only complete in
// the same browser that started the flow. The state itself expires in a
// few minutes.
// ─────────────────────────────────────────────────────────────

export const GITHUB_SESSION_COOKIE = 'shield_wizard_github';
export const GITHUB_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // GitHub user tokens live ~8h
export const GITHUB_OAUTH_STATE_COOKIE = 'shield_wizard_oauth_state';
export const GITHUB_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

interface SealedSession {
  /** Version of the cookie payload. */
  v: 1;
  /** The encrypted GitHub user access token. */
  accessToken: string;
  /** Epoch milliseconds when the cookie should no longer be used. */
  expiresAt: number;
}

export interface GithubOAuthStatePayload {
  v: 1;
  /** Why GitHub is being contacted. */
  intent: 'edit' | 'login';
  /** Random per-request value; ties the callback to this redirect. */
  nonce: string;
  /** Epoch milliseconds after which the state is rejected. */
  expiresAt: number;
  /** UI the user came from (used when `intent` is `login`). */
  returnScreen?: 'start' | 'editor';
  /** Workflow the user was in when logging in. */
  returnMode?: 'new' | 'edit' | null;
}

const SESSION_VERSION = 'v1';
const STATE_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Small base64url helpers (bytes ↔ base64url string)
// ─────────────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

// ─────────────────────────────────────────────────────────────
// Key derivation & HMAC
// ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await deriveHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────
// Access-token cookie encryption
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a GitHub access token into the cookie value.
 * Fails loudly when `GITHUB_SESSION_SECRET` is missing so callers can
 * check configuration before attempting OAuth.
 */
export async function sealGithubSession(
  accessToken: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  if (!secret) {
    throw new Error('GITHUB_SESSION_SECRET is not configured');
  }

  const payload: SealedSession = {
    v: 1,
    accessToken,
    expiresAt: now + GITHUB_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as Uint8Array<ArrayBuffer>),
  );

  return `${SESSION_VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

/**
 * Decrypt and validate a cookie produced by `sealGithubSession`.
 * Returns the access token, or `null` for a missing/expired/tampered
 * cookie. Never throws for malformed input.
 */
export async function openGithubSession(
  cookieValue: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!cookieValue || !secret) return null;

  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return null;

    const iv = base64UrlToBytes(parts[1]);
    const ciphertext = base64UrlToBytes(parts[2]);
    if (iv.length !== 12) return null;

    const key = await deriveAesKey(secret);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
        key,
        ciphertext as Uint8Array<ArrayBuffer>,
      ),
    );

    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<SealedSession>;
    if (
      payload.v !== 1
      || typeof payload.accessToken !== 'string'
      || typeof payload.expiresAt !== 'number'
      || payload.expiresAt <= now
    ) {
      return null;
    }

    return payload.accessToken;
  }
  catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// OAuth state signing
// ─────────────────────────────────────────────────────────────

/**
 * Create a signed, URL-safe OAuth state. `body.signature`, where the
 * signature is HMAC-SHA-256 over `body` (hex encoded). Nothing here is
 * secret except the signature; the body is intentionally readable so
 * the callback can restore the intended flow.
 */
export interface CreateGithubOAuthStateOptions {
  /** Optional externally generated nonce. The caller should store it in a short-lived HttpOnly cookie. */
  nonce?: string;
  /** Lifetime of the signed state in milliseconds. */
  ttlMs?: number;
  /** Test seam for the current time. */
  now?: number;
}

export async function createGithubOAuthState(
  secret: string,
  payload: Omit<GithubOAuthStatePayload, 'v' | 'nonce' | 'expiresAt'>,
  options: CreateGithubOAuthStateOptions = {},
): Promise<string> {
  if (!secret) {
    throw new Error('GITHUB_SESSION_SECRET is not configured');
  }

  const nonce = options.nonce ?? (() => {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    return bytesToBase64Url(nonceBytes);
  })();
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? GITHUB_OAUTH_STATE_MAX_AGE_SECONDS * 1000;
  const statePayload: GithubOAuthStatePayload = {
    v: STATE_VERSION,
    intent: payload.intent,
    nonce,
    expiresAt: now + ttlMs,
    ...(payload.returnScreen !== undefined ? { returnScreen: payload.returnScreen } : {}),
    ...(payload.returnMode !== undefined ? { returnMode: payload.returnMode } : {}),
  };
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(statePayload)));
  const signature = await hmacHex(secret, encoded);
  return `${encoded}.${signature}`;
}

/**
 * Verify and decode a state produced by `createGithubOAuthState`.
 * Returns `null` for a missing, malformed, expired-shape, or
 * bad-signature state. This function also accepts the state returned
 * after an app installation (`setup_action=install`) because GitHub
 * round-trips the same state value.
 */
export async function verifyGithubOAuthState(
  secret: string | undefined,
  state: string | undefined,
  now = Date.now(),
): Promise<GithubOAuthStatePayload | null> {
  if (!secret || !state) return null;

  try {
    const dot = state.lastIndexOf('.');
    if (dot <= 0) return null;

    const encoded = state.slice(0, dot);
    const signature = state.slice(dot + 1);
    const expected = await hmacHex(secret, encoded);
    if (signature.length !== expected.length || signature.toLowerCase() !== expected) {
      return null;
    }

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as Partial<GithubOAuthStatePayload>;
    if (
      payload.v !== STATE_VERSION
      || typeof payload.nonce !== 'string'
      || typeof payload.expiresAt !== 'number'
      || payload.expiresAt <= now
      || (payload.intent !== 'edit' && payload.intent !== 'login')
      || (payload.returnScreen !== undefined && payload.returnScreen !== 'start' && payload.returnScreen !== 'editor')
      || (payload.returnMode !== undefined && payload.returnMode !== 'new' && payload.returnMode !== 'edit' && payload.returnMode !== null)
    ) {
      return null;
    }

    return {
      v: STATE_VERSION,
      intent: payload.intent,
      nonce: payload.nonce,
      expiresAt: payload.expiresAt,
      returnScreen: payload.returnScreen,
      returnMode: payload.returnMode,
    };
  }
  catch {
    return null;
  }
}
