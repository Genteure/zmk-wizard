// ─────────────────────────────────────────────────────────────
// GitHub repository update policy
//
// When Shield Wizard writes an edit back to an existing repository it
// generates the complete file set on the server and then splits it
// into additions and deletions.
//
//   config/**      ALWAYS preserved — keymap, .conf options, west.yml
//                  are the user's files, full stop.
//
// A small set of generated-but-user-editable files (README.md,
// build.yaml, .github/workflows/build.yml) is preserved only when the
// repository copy differs from Shield Wizard's own baseline. That
// comparison happens server-side in the commit action and is passed in
// as `extraPreservedPaths`.
// ─────────────────────────────────────────────────────────────

export const GITHUB_PRESERVED_PATHS = [
  'config/',
] as const;

/**
 * `true` when a generated file must NOT overwrite or delete a file in
 * the user's repository. Directory prefixes end with `/`.
 */
export function shouldPreserveGithubPath(
  filePath: string,
  extraPreservedPaths: ReadonlySet<string> = new Set(),
): boolean {
  return GITHUB_PRESERVED_PATHS.some((preserved) => {
    if (preserved.endsWith('/')) {
      return filePath === preserved.slice(0, -1) || filePath.startsWith(preserved);
    }
    return filePath === preserved;
  }) || extraPreservedPaths.has(filePath);
}

/**
 * Split freshly generated files into GitHub GraphQL file additions
 * while filtering out every preserved path.
 */
export function githubFileAdditions(
  files: Record<string, string>,
  extraPreservedPaths: ReadonlySet<string> = new Set(),
): Array<{ path: string; contents: string }> {
  return Object.entries(files)
    .filter(([path]) => !shouldPreserveGithubPath(path, extraPreservedPaths))
    .map(([path, contents]) => ({ path, contents }));
}

/**
 * Compute which files in the current repository tree are stale
 * generated files. Preserved paths and files that still exist in the
 * new generation are kept.
 */
export function githubFileDeletions(
  existingPaths: string[],
  newFilePaths: ReadonlySet<string>,
  extraPreservedPaths: ReadonlySet<string> = new Set(),
): Array<{ path: string }> {
  return existingPaths
    .filter(path =>
      !newFilePaths.has(path)
      && !shouldPreserveGithubPath(path, extraPreservedPaths),
    )
    .map(path => ({ path }));
}
