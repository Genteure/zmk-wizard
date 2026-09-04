// Shared ordering for the repository picker: editable Shield Wizard
// repositories first, then most recently modified first. `pushedAt` is
// the primary activity signal and falls back to `updatedAt` for empty
// repositories that were never pushed.

export interface GithubRepoOrderFields {
  fullName: string;
  hasShieldWizardConfig: boolean;
  pushedAt: string | null;
  updatedAt: string;
}

export function compareGithubRepos(
  a: GithubRepoOrderFields,
  b: GithubRepoOrderFields,
): number {
  if (a.hasShieldWizardConfig !== b.hasShieldWizardConfig) {
    return a.hasShieldWizardConfig ? -1 : 1;
  }

  const aModified = a.pushedAt ?? a.updatedAt;
  const bModified = b.pushedAt ?? b.updatedAt;
  return bModified.localeCompare(aModified) || a.fullName.localeCompare(b.fullName);
}
