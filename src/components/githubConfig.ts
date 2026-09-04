import { PUBLIC_GITHUB_APP_SLUG, PUBLIC_GITHUB_CLIENT_ID } from 'astro:env/client';

/**
 * Compile-time switch for the GitHub edit feature.
 *
 * PUBLIC_* variables are inlined by Astro at build time, so this is known
 * before any server round trip. The UI uses this for the "GitHub is not
 * configured" warning instead of guessing from a runtime session response
 * that may not have arrived yet.
 */
export const GITHUB_ENABLED_AT_BUILD = Boolean(
  PUBLIC_GITHUB_CLIENT_ID
  && PUBLIC_GITHUB_APP_SLUG,
);
