// ─────────────────────────────────────────────────────────────
// Shared GitHub session flow
//
// The launcher (`main.vue`) and the GitHub setup screen
// (`GitHubSetup.vue`) both need the same three operations:
//
//   refreshSession   read the server-side session and, while the
//                    GitHub screen is open, point it at the right step
//   routeAfterSession decide between "install app" and "choose repo"
//   signOut          clear the server cookie and local session
//
// They previously had near-identical private copies, which is exactly
// how the two screens drift apart. Callers still own navigation:
// signing out from the editor returns to the launcher, signing out
// from the picker stays on the picker.
// ─────────────────────────────────────────────────────────────

import { actions } from 'astro:actions';
import { useWorkflowStore } from './workflow';

export type SignOutResult = { ok: true } | { ok: false; message: string };

export function useGithubFlow() {
  const workflow = useWorkflowStore();

  /**
   * Pick the GitHub step that matches the current session: signed out →
   * sign-in card, signed in without an installation → install screen,
   * otherwise → repository picker.
   */
  function routeAfterSession(): void {
    if (!workflow.githubUser) {
      workflow.githubStep = 'repositories';
      return;
    }

    const installations = workflow.githubInstallations ?? [];
    workflow.githubStep = installations.length > 0 ? 'repositories' : 'install';

    const first = installations[0];
    if (first && workflow.selectedInstallationId === null) {
      workflow.selectedInstallationId = first.id;
    }
  }

  /**
   * Fetch the session from the server. Returns whether a usable session
   * was read. `busy` mirrors the request in `workflow.githubBusy`, which
   * the picker uses for its full-screen loading state.
   */
  async function refreshSession(options: { busy?: boolean } = {}): Promise<boolean> {
    if (options.busy) workflow.githubBusy = true;
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

      const previousUser = workflow.githubUser;
      const previousInstallations = workflow.githubInstallations;
      workflow.setSession(data);
      // A rate-limit response can arrive without a user object even though
      // the token is still valid. Keep the last known identity so the UI does
      // not force the user to sign in again for a transient API error.
      if (data.githubError && previousUser && !data.user) {
        workflow.githubUser = previousUser;
        workflow.githubInstallations = previousInstallations;
      }
      if (workflow.screen === 'github') {
        routeAfterSession();
      }
      return true;
    }
    catch (error) {
      if (workflow.screen === 'github') {
        workflow.setGithubError(error instanceof Error ? error.message : String(error));
      }
      else {
        console.warn('Failed to refresh GitHub session:', error);
      }
      return false;
    }
    finally {
      if (options.busy) workflow.githubBusy = false;
    }
  }

  /** Clear the server cookie and the local session snapshot. */
  async function signOut(): Promise<SignOutResult> {
    try {
      const { error } = await actions.githubLogout();
      if (error) return { ok: false, message: error.message };

      workflow.clearSession();
      // Keep the runtime "configured" flag so the GitHub setup page can
      // distinguish “configured but signed out” from “not configured”.
      workflow.githubConfigured = true;
      return { ok: true };
    }
    catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  return { refreshSession, routeAfterSession, signOut };
}
