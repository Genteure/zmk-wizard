// ─────────────────────────────────────────────────────────────
// Workflow URL parsing
//
// The whole app lives on `/`; workflow selection travels in query
// parameters so a refresh or a GitHub redirect can deterministically
// restore one specific screen/step:
//
//   ?action=new                 launcher chose "new shield"
//   ?action=edit                launcher chose "edit existing repo"
//   ?action=edit&repo=o/r       open that repo after auth/install
//   ?code=...&state=...         GitHub OAuth callback
//   ?setup_action=install...    GitHub App installation callback
//   ?tab=layout|keyboard|parts  optional editor tab to restore
//
// Parameters are consumed once and removed from the address bar, so
// refreshing a finished flow lands on the launcher instead of
// re-running a callback.
// ─────────────────────────────────────────────────────────────

export interface WorkflowUrlParams {
  action: 'new' | 'edit' | null;
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
  setupAction: string | null;
  installationId: string | null;
  repo: string | null;
  tab: 'layout' | 'keyboard' | 'parts' | null;
  part: number | null;
}

const WORKFLOW_SEARCH_KEYS = [
  'action',
  'code',
  'state',
  'error',
  'error_description',
  'setup_action',
  'installation_id',
  'repo',
  'tab',
  'part',
] as const;

export function parseWorkflowUrl(url: URL): WorkflowUrlParams {
  const search = url.searchParams;
  const action = search.get('action');
  const tab = search.get('tab');
  const part = Number.parseInt(search.get('part') ?? '', 10);

  return {
    action: action === 'new' || action === 'edit' ? action : null,
    code: search.get('code'),
    state: search.get('state'),
    error: search.get('error'),
    errorDescription: search.get('error_description'),
    setupAction: search.get('setup_action'),
    installationId: search.get('installation_id'),
    repo: search.get('repo'),
    tab: tab === 'layout' || tab === 'keyboard' || tab === 'parts' ? tab : null,
    part: Number.isInteger(part) && part >= 0 ? part : null,
  };
}

export function isOAuthCallback(params: WorkflowUrlParams): boolean {
  return Boolean(params.code && params.state);
}

export function isOAuthErrorCallback(params: WorkflowUrlParams): boolean {
  return Boolean(params.state && params.error);
}

export function isInstallCallback(params: WorkflowUrlParams): boolean {
  return params.setupAction === 'install' && Boolean(params.state);
}

/**
 * Remove the consumed workflow query parameters while preserving the
 * rest of the query and the URL hash (the hash may carry a pending KLE
 * layout import).
 */
export function stripWorkflowSearch(url: URL): string {
  const next = new URL(url);
  for (const key of WORKFLOW_SEARCH_KEYS) {
    next.searchParams.delete(key);
  }
  next.hash = url.hash;
  return next.toString();
}

export function applyWorkflowTab(
  params: WorkflowUrlParams,
  setTab: (tab: 'layout' | 'keyboard' | 'parts', part: number | null) => void,
): void {
  if (params.tab) {
    setTab(params.tab, params.part);
  }
}
