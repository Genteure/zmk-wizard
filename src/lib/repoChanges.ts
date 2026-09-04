// ─────────────────────────────────────────────────────────────
// Repository change preview
//
// Computes the exact set of file changes that `githubCommitChanges`
// will write to a repository. It deliberately mirrors the commit
// policy: preserved paths (`config/**` and user-customized generated
// files) are never shown as changed, because the commit action will
// not touch them.
//
// The preview returns old/new text content for each changed file so
// callers can render a line-level diff with the `diff` package. It
// never reads or transfers files that are not part of the commit.
// ─────────────────────────────────────────────────────────────

import { githubFileAdditions, githubFileDeletions } from './githubPolicy';

export type RepositoryFileChangeStatus = 'added' | 'modified' | 'deleted';

export interface RepositoryFileChange {
  path: string;
  status: RepositoryFileChangeStatus;
  /** Previous file contents, or an empty string for newly added files. */
  oldContent: string;
  /** Next file contents, or an empty string for deleted files. */
  newContent: string;
}

export interface ComputeRepositoryFileChangesInput {
  /** All blob paths currently in the repository tree. */
  existingPaths: string[];
  /** The complete freshly generated Shield Wizard file set. */
  newFiles: Record<string, string>;
  /**
   * Paths that the commit policy will not overwrite or delete. Defaults
   * to no extra preserved paths (the built-in `config/**` rule is still
   * applied by `githubFileAdditions`/`githubFileDeletions`).
   */
  preservedPaths?: ReadonlySet<string>;
  /** Reads the current repository content, or `null` when the file is missing. */
  readFile: (path: string) => Promise<string | null>;
}

/**
 * Compute the file changes that a commit would apply.
 *
 * The function is async because callers normally back `readFile` with
 * GitHub API requests. It only calls `readFile` for files that actually
 * have to be compared: generated files that are candidates for update
 * and stale generated files that are candidates for deletion.
 */
export async function computeRepositoryFileChanges(
  input: ComputeRepositoryFileChangesInput,
): Promise<RepositoryFileChange[]> {
  const {
    existingPaths,
    newFiles,
    preservedPaths = new Set<string>(),
    readFile,
  } = input;

  const existingPathSet = new Set(existingPaths);
  const newFilePathSet = new Set(Object.keys(newFiles));
  const changes: RepositoryFileChange[] = [];

  const additions = githubFileAdditions(newFiles, preservedPaths);
  for (const { path } of additions) {
    const newContent = newFiles[path] ?? '';
    const oldContent = existingPathSet.has(path) ? await readFile(path) : null;

    // A path that is not in the tree is a brand-new generated file.
    // A path that exists but has different contents is a modification.
    if (oldContent === null) {
      changes.push({ path, status: 'added', oldContent: '', newContent });
    }
    else if (oldContent !== newContent) {
      changes.push({ path, status: 'modified', oldContent, newContent });
    }
  }

  const deletions = githubFileDeletions(existingPaths, newFilePathSet, preservedPaths);
  for (const { path } of deletions) {
    const oldContent = await readFile(path);
    if (oldContent === null) continue;

    changes.push({ path, status: 'deleted', oldContent, newContent: '' });
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
