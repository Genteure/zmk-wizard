// Repository picker search.
//
// The picker loads repositories a page at a time, so the filter only
// narrows the repositories that have already been fetched. Matching is
// case-insensitive and covers the `owner/name` slug plus the optional
// description shown on each card.

export interface RepoSearchFields {
  fullName: string;
  description: string | null;
}

/** Normalize a user-entered query for comparison. */
export function normalizeRepoQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Whether a repository matches an already-normalized query. */
export function matchesRepoQuery(repo: RepoSearchFields, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return repo.fullName.toLowerCase().includes(normalizedQuery)
    || (repo.description ?? '').toLowerCase().includes(normalizedQuery);
}

/**
 * Filter repositories by a raw query, preserving the input order.
 * An empty (or whitespace-only) query returns a copy of the input.
 */
export function filterReposByQuery<T extends RepoSearchFields>(
  repos: readonly T[],
  query: string,
): T[] {
  const normalized = normalizeRepoQuery(query);
  return normalized ? repos.filter(repo => matchesRepoQuery(repo, normalized)) : [...repos];
}
