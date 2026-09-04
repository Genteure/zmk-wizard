// ─────────────────────────────────────────────────────────────
// Repository change preview
//
// Computes the exact set of file changes that `githubCommitChanges`
// will write to a repository. It deliberately mirrors the file-change
// policy: untouchable paths (`config/**` except the generated JSON,
// README, etc.) and user-customized conditional files are never shown
// as changed, because the commit action will not touch them.
//
// The preview returns old/new text content for each changed file so
// callers can render a line-level diff with the `diff` package. It
// never reads or transfers files that are not part of the commit.
// ─────────────────────────────────────────────────────────────

import { planFileChanges, type FilePolicy } from './filePolicy';

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
  /** The generic file policy controlling which paths may be touched. */
  policy: FilePolicy;
  /**
   * Conditional generated files that the user has modified and must not
   * be overwritten or deleted. Defaults to no user modifications.
   */
  userModifiedPaths?: ReadonlySet<string>;
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
    policy,
    userModifiedPaths = new Set<string>(),
    readFile,
  } = input;

  const existingPathSet = new Set(existingPaths);
  const changes: RepositoryFileChange[] = [];

  const { additions, deletions } = planFileChanges(
    newFiles,
    existingPaths,
    policy,
    userModifiedPaths,
  );
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

  for (const { path } of deletions) {
    const oldContent = await readFile(path);
    if (oldContent === null) continue;

    changes.push({ path, status: 'deleted', oldContent, newContent: '' });
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
