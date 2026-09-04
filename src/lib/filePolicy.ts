// ─────────────────────────────────────────────────────────────
// File-level change policy
//
// When Shield Wizard writes a generated config back to an existing
// repository, it needs to decide which files it may add, modify, or
// delete. This module is intentionally generic: it only reasons about
// file paths and user modifications, not about GitHub or any transport.
//
// The default rule is "do not touch". Every path must be explicitly
// covered by a rule for Shield Wizard to write, update, or delete it.
// ─────────────────────────────────────────────────────────────

import { SHIELD_WIZARD_DATA_FILE } from './dataFormat';

export interface FilePolicy {
  /** Directories whose generated contents are replaced wholesale. */
  fullSyncDirectories: readonly string[];
  /** Exact generated files that are always replaced with fresh output. */
  alwaysUpdatePaths: ReadonlySet<string>;
  /**
   * Exact generated files that are refreshed only when the user has not
   * modified them. Modified copies are left untouched.
   */
  conditionalUpdatePaths: ReadonlySet<string>;
  /** Exact files that are never added, overwritten, or deleted. */
  neverTouchPaths: ReadonlySet<string>;
}

/**
 * The Shield Wizard repository policy for a given shield name.
 *
 * `boards/shields/<shield>/` (and the generated `snippets/` tree) are
 * treated as fully Shield Wizard-owned directories. Files under `config/`
 * are mostly user-owned; only the generated shield-specific JSON is always
 * refreshed, while the keymap and west manifest are refreshed only when the
 * user has not edited them. `.shield-wizard.json` is always refreshed so
 * the in-repository editor state stays in sync with the generated files.
 */
export function createFilePolicy(shield: string): FilePolicy {
  return {
    fullSyncDirectories: [
      'boards/shields/',
      'snippets/',
    ],
    alwaysUpdatePaths: new Set([
      `config/${shield}.json`,
      '.github/workflows/build.yml',
      '.github/shield-wizard-layout.svg',
      SHIELD_WIZARD_DATA_FILE,
    ]),
    conditionalUpdatePaths: new Set([
      `config/${shield}.keymap`,
      'config/west.yml',
      'zephyr/module.yml',
      'build.yaml',
    ]),
    neverTouchPaths: new Set([
      'README.md',
    ]),
  };
}

/**
 * `true` when the policy allows this exact file to be added, overwritten,
 * or deleted. Directory prefixes in `fullSyncDirectories` end with `/`.
 */
export function shouldTouchPath(
  filePath: string,
  policy: FilePolicy,
  userModifiedPaths: ReadonlySet<string> = new Set(),
): boolean {
  if (policy.neverTouchPaths.has(filePath)) return false;

  if (policy.fullSyncDirectories.some((dir) => {
    return filePath === dir.slice(0, -1) || filePath.startsWith(dir);
  })) {
    return true;
  }

  if (policy.alwaysUpdatePaths.has(filePath)) return true;

  if (policy.conditionalUpdatePaths.has(filePath)) {
    return !userModifiedPaths.has(filePath);
  }

  return false;
}

/**
 * Compute the generated-but-user-editable files that must not be touched.
 * Callers provide a reader so this function can be used both for the
 * batching preview path and for the commit path's direct GitHub reads.
 *
 * A missing file is treated as "not user-modified" so Shield Wizard can
 * recreate it; only an existing copy that differs from the baseline is
 * considered a user modification.
 */
export async function computeUserModifiedPaths(
  baseline: Record<string, string>,
  readFile: (path: string) => Promise<string | null>,
  policy: FilePolicy,
): Promise<Set<string>> {
  const userModified = new Set<string>();

  for (const filePath of policy.conditionalUpdatePaths) {
    const baselineContent = baseline[filePath];
    if (baselineContent === undefined) continue;

    const current = await readFile(filePath);
    if (current !== null && current !== baselineContent) {
      userModified.add(filePath);
    }
  }

  return userModified;
}

/**
 * Split freshly generated files into file additions while filtering out
 * paths the policy says must not be touched.
 */
export function fileAdditions(
  files: Record<string, string>,
  policy: FilePolicy,
  userModifiedPaths: ReadonlySet<string> = new Set(),
): Array<{ path: string; contents: string }> {
  return Object.entries(files)
    .filter(([path]) => shouldTouchPath(path, policy, userModifiedPaths))
    .map(([path, contents]) => ({ path, contents }));
}

/**
 * Compute which files in the current repository tree are stale generated
 * files. Untouchable paths and files that still exist in the new
 * generation are kept.
 */
export function fileDeletions(
  existingPaths: string[],
  newFilePaths: ReadonlySet<string>,
  policy: FilePolicy,
  userModifiedPaths: ReadonlySet<string> = new Set(),
): Array<{ path: string }> {
  return existingPaths
    .filter(path =>
      !newFilePaths.has(path)
      && shouldTouchPath(path, policy, userModifiedPaths),
    )
    .map(path => ({ path }));
}

/**
 * Return the complete add/delete plan for one generation, applying the
 * policy defaults and any user-modified paths. This is the shared plan
 * used by the commit API, the preview diff, and preview fetch planning.
 */
export function planFileChanges(
  files: Record<string, string>,
  existingPaths: string[],
  policy: FilePolicy,
  userModifiedPaths: ReadonlySet<string> = new Set(),
): {
  additions: Array<{ path: string; contents: string }>;
  deletions: Array<{ path: string }>;
} {
  return {
    additions: fileAdditions(files, policy, userModifiedPaths),
    deletions: fileDeletions(
      existingPaths,
      new Set(Object.keys(files)),
      policy,
      userModifiedPaths,
    ),
  };
}
