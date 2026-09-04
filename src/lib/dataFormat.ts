// ─────────────────────────────────────────────────────────────
// Shield Wizard Stable Data Format
//
// Canonical on-disk format for Shield Wizard internal data.
//
// Every persisted document is a versioned envelope:
//
//   {
//     "formatVersion": 1,
//     "data": { ...Keyboard... }
//   }
//
// Compatibility and migration rules are documented in
// docs/data-format.md. In short:
//
//   - Optional/additive changes that have a safe default do NOT bump
//     `formatVersion`. Unknown envelope/data keys are preserved on a
//     load → save round trip.
//   - Any change that needs transforming old data (new required field,
//     rename, enum semantic change, ...) MUST bump `formatVersion` and
//     register a migration from `n - 1` to `n`.
//   - If old data cannot be migrated safely, the migration MUST return
//     `{ status: 'unsupported', reason }` instead of guessing.
//   - Readers fail closed on a `formatVersion` greater than the version
//     they understand. They must never rewrite a document they cannot
//     fully understand.
// ─────────────────────────────────────────────────────────────

import { z } from 'astro/zod';
import {
  KeyboardPartSchema,
  KeyboardSchema,
  KeySchema,
  ModuleIdSchema,
  type Keyboard,
} from '~/types';

// ─────────────────────────────────────────────────────────────
// Canonical file location & current version
// ─────────────────────────────────────────────────────────────

/**
 * Canonical location of the internal data file inside a generated
 * ZMK config repository.
 *
 * Kept at the repository root (rather than `.github/...`) because the
 * data describes the whole generated repository and should be easy to
 * find for tooling that is not GitHub-specific (issue #20 reads it
 * back to edit an existing repository).
 */
export const SHIELD_WIZARD_DATA_FILE = '.shield-wizard.json';

/**
 * Current stable data format version.
 *
 * Bump this ONLY for data changes that old readers cannot understand:
 * new required fields without a safe migration default, renames,
 * changed semantics of an existing field, enum additions that can
 * appear in persisted data, etc. Add a migration at the same time.
 */
export const CURRENT_DATA_FORMAT_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Unknown keys found next to the known envelope/data fields.
 * Kept so a load → save round trip through an older reader does not
 * silently drop additive, same-version fields it does not know yet.
 */
export interface ShieldWizardDataExtensions {
  /** Unknown top-level keys from the envelope. */
  envelope: Record<string, unknown>;
  /** Unknown top-level keys from `data`. */
  data: Record<string, unknown>;
}

/** Human-readable validation/migration issue. */
export interface DataIssue {
  /** Dotted path, or `(root)` when the whole document is at fault. */
  path: string;
  message: string;
}

/** The raw JSON shape every document must start with. */
export type ShieldWizardRawEnvelope = {
  formatVersion: number;
  data: Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Result of one `from → to` migration step.
 *
 * Migrations receive the RAW envelope of their source version, not a
 * parsed keyboard. This keeps migrations in charge of both the
 * envelope and the data and lets them carry over unknown keys.
 */
export type FormatMigrationResult
  = { status: 'migrated'; envelope: ShieldWizardRawEnvelope }
    | { status: 'unsupported'; reason: string };

export interface FormatMigration {
  /** Source version. The registry enforces `to === from + 1`. */
  from: number;
  /** Target version. Always `from + 1`. */
  to: number;
  /** Short human-readable summary, e.g. "Add required `parts[].label`". */
  description: string;
  /**
   * Transform one raw envelope from `from` to `to`.
   *
   * Requirements:
   *   - Do not mutate the input envelope (deep-copy what you change).
   *   - Preserve unknown keys unless the migration explicitly owns them.
   *   - Return `unsupported` with a concrete reason instead of dropping
   *     data that cannot be represented in the target version.
   */
  migrate: (envelope: ShieldWizardRawEnvelope) => FormatMigrationResult;
}

export interface ParsedShieldWizardData {
  /** Keyboard data after all migrations and structural validation. */
  keyboard: Keyboard;
  /** Normalized format version (the version this reader supports). */
  formatVersion: number;
  /** Version found in the document before migration. */
  originalFormatVersion: number;
  /** Migrations that were applied, oldest first. */
  appliedMigrations: FormatMigration[];
  /** Unknown envelope/data keys to pass back when re-saving. */
  extensions: ShieldWizardDataExtensions;
  /**
   * Structural issues that were tolerated because `allowPartial` was
   * enabled. Empty for a fully valid keyboard.
   *
   * Note: these are schema-shape warnings only. Full business
   * validation (`ValidatedKeyboardSchema`) is intentionally NOT part
   * of this module and must run before export/build.
   */
  issues: DataIssue[];
}

// ─────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────

export class ShieldWizardDataError extends Error {
  override name = 'ShieldWizardDataError';
}

/** The input is not valid JSON. */
export class ShieldWizardDataJsonError extends ShieldWizardDataError {
  override name = 'ShieldWizardDataJsonError';
}

/** The input does not look like a Shield Wizard envelope. */
export class ShieldWizardDataEnvelopeError extends ShieldWizardDataError {
  override name = 'ShieldWizardDataEnvelopeError';

  constructor(
    message: string,
    public readonly issues: DataIssue[],
  ) {
    super(message);
  }
}

/** The document was written by a newer reader than this build. */
export class UnsupportedDataFormatVersionError extends ShieldWizardDataError {
  override name = 'UnsupportedDataFormatVersionError';

  constructor(
    public readonly foundVersion: number,
    public readonly supportedVersion: number,
  ) {
    super(
      `Shield Wizard data format version ${foundVersion} is newer than this build supports (${supportedVersion}). `
      + 'Update Shield Wizard to open this file; the file was not modified.',
    );
  }
}

/** No safe migration exists (missing or explicitly unsupported step). */
export class UnmigratableDataFormatVersionError extends ShieldWizardDataError {
  override name = 'UnmigratableDataFormatVersionError';

  constructor(
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly reason: string,
  ) {
    super(
      `Cannot migrate Shield Wizard data format version ${fromVersion} to ${toVersion}: ${reason}. `
      + 'The file was not modified.',
    );
  }
}

/** Keyboard data failed structural validation. */
export class ShieldWizardDataValidationError extends ShieldWizardDataError {
  override name = 'ShieldWizardDataValidationError';

  constructor(
    message: string,
    public readonly issues: DataIssue[],
  ) {
    super(message);
  }
}

// ─────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────

const RawEnvelopeSchema = z.looseObject({
  formatVersion: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Cheap shape check for callers that must branch between legacy raw
 * `Keyboard` JSON and the stable envelope (e.g. the debug dialog and
 * smoke fixtures). The property is checked as an own property so an
 * object inheriting `formatVersion` is not misdetected. Full validation
 * still happens in `parseShieldWizardData`.
 */
export function isShieldWizardDataEnvelope(
  value: unknown,
): value is { formatVersion: unknown } & Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.hasOwn(value, 'formatVersion');
}

/**
 * Tolerant schema for work-in-progress documents.
 *
 * `KeyboardSchema` is the persisted *target* shape, but an in-progress
 * document (the thing you would also keep in localStorage) may have an
 * empty name/shield, no keys yet, and rely on defaults for optional
 * fields. This schema accepts exactly that and applies the same
 * defaults as the strict schema.
 */
const DraftKeyboardSchema = z.object({
  name: z.string().refine(
    name => name.length === 0 || new TextEncoder().encode(name).length <= 16,
    'Keyboard name must be empty or at most 16 bytes while work is in progress',
  ),
  shield: z.string().max(32, 'Shield name must be at most 32 characters while work is in progress').refine(
    shield => shield.length === 0 || /^[a-z][a-z0-9_]*$/.test(shield),
    'Shield name must be empty or start with a letter and contain only lowercase letters, numbers, and underscores',
  ),
  dongle: z.boolean().default(false),
  modules: z.array(ModuleIdSchema).default([]),
  layout: z.array(KeySchema).default([]),
  parts: z.array(KeyboardPartSchema).default([]),
});

/**
 * Top-level `data` field names known to this build, derived from
 * `KeyboardSchema` so future optional fields are automatically treated
 * as known (instead of being round-tripped as extensions) once they are
 * added to the schema.
 */
const KNOWN_DATA_FIELD_NAMES = new Set(Object.keys(KeyboardSchema.shape));
const KNOWN_DATA_FIELD_ORDER = [...KNOWN_DATA_FIELD_NAMES] as Array<keyof Keyboard & string>;

const DEFAULT_FORMAT_MIGRATIONS: readonly FormatMigration[] = [
  // ── Migration scaffolding ─────────────────────────────────
  //
  // Add future migrations here, one entry per format version bump:
  //
  // defineFormatMigration(1, 'Describe the change', (envelope) => {
  //   const next = cloneEnvelope(envelope);
  //   const data = next.data;
  //   // ... transform old fields into new fields ...
  //   return { status: 'migrated', envelope: { ...next, formatVersion: 2, data } };
  //   // or, when no safe transformation exists:
  //   // return { status: 'unsupported', reason: '...' };
  // }),
  //
  // See docs/data-format.md for the full checklist.
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function issuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

function toIssues(error: {
  issues: Array<{ path: readonly PropertyKey[]; message: string }>;
}): DataIssue[] {
  return error.issues.map(issue => ({
    path: issuePath(issue.path),
    message: issue.message,
  }));
}

function parseJsonDocument(text: string): unknown {
  try {
    return JSON.parse(text);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ShieldWizardDataJsonError(`Invalid JSON: ${message}`);
  }
}

function collectExtensions(
  envelope: ShieldWizardRawEnvelope,
): ShieldWizardDataExtensions {
  const envelopeExtensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (key !== 'formatVersion' && key !== 'data') {
      envelopeExtensions[key] = value;
    }
  }

  const dataExtensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(envelope.data)) {
    if (!KNOWN_DATA_FIELD_NAMES.has(key)) {
      dataExtensions[key] = value;
    }
  }

  return { envelope: envelopeExtensions, data: dataExtensions };
}

/**
 * Deep-clone helper for migrations. Use it instead of mutating the
 * input envelope (see the migration requirements).
 */
export function cloneEnvelope(
  envelope: ShieldWizardRawEnvelope,
): ShieldWizardRawEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as ShieldWizardRawEnvelope;
}

// ─────────────────────────────────────────────────────────────
// Migration registry & engine
// ─────────────────────────────────────────────────────────────

const MAX_MIGRATION_STEPS = 1000;

function registryIssues(migrations: readonly FormatMigration[]): string[] {
  const issues: string[] = [];
  const seenFrom = new Set<number>();
  const seenTo = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.from) || migration.from < 1) {
      issues.push(`migration from version ${migration.from} is not a positive integer`);
    }
    if (migration.to !== migration.from + 1) {
      issues.push(`migration from version ${migration.from} must target ${migration.from + 1}, got ${migration.to}`);
    }
    if (seenFrom.has(migration.from)) {
      issues.push(`duplicate migration from version ${migration.from}`);
    }
    if (seenTo.has(migration.to)) {
      issues.push(`duplicate migration to version ${migration.to}`);
    }
    seenFrom.add(migration.from);
    seenTo.add(migration.to);
  }
  return issues;
}

/**
 * Create a well-formed migration entry.
 *
 * `from` is the old version; the migration targets `from + 1`.
 */
export function defineFormatMigration(
  from: number,
  description: string,
  migrate: FormatMigration['migrate'],
): FormatMigration {
  return { from, to: from + 1, description, migrate };
}

export interface MigrateEnvelopeOptions {
  /** Target version. Defaults to `CURRENT_DATA_FORMAT_VERSION`. */
  targetVersion?: number;
  /** Migration registry. Defaults to the built-in one (tests may inject). */
  migrations?: readonly FormatMigration[];
}

export interface MigrationReport {
  envelope: ShieldWizardRawEnvelope;
  applied: FormatMigration[];
}

/**
 * Run all pending migrations to bring `envelope` up to `targetVersion`.
 * Throws `UnmigratableDataFormatVersionError` when any step is missing
 * or explicitly unsupported.
 */
export function migrateEnvelope(
  envelope: ShieldWizardRawEnvelope,
  options: MigrateEnvelopeOptions = {},
): MigrationReport {
  const targetVersion = options.targetVersion ?? CURRENT_DATA_FORMAT_VERSION;
  const migrations = options.migrations ?? DEFAULT_FORMAT_MIGRATIONS;

  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    throw new ShieldWizardDataError(`Invalid target format version: ${targetVersion}`);
  }

  const problems = registryIssues(migrations);
  if (problems.length > 0) {
    throw new ShieldWizardDataError(`Invalid migration registry: ${problems.join('; ')}`);
  }

  const parsedEnvelope = RawEnvelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) {
    throw new ShieldWizardDataEnvelopeError(
      'Not a Shield Wizard data envelope',
      toIssues(parsedEnvelope.error),
    );
  }

  const byFrom = new Map(migrations.map(migration => [migration.from, migration]));
  let current = parsedEnvelope.data as unknown as ShieldWizardRawEnvelope;
  const applied: FormatMigration[] = [];

  for (let step = 0; step < MAX_MIGRATION_STEPS; step++) {
    if (current.formatVersion === targetVersion) {
      return { envelope: current, applied };
    }
    if (current.formatVersion > targetVersion) {
      throw new UnsupportedDataFormatVersionError(
        current.formatVersion,
        targetVersion,
      );
    }

    const migration = byFrom.get(current.formatVersion);
    if (!migration) {
      throw new UnmigratableDataFormatVersionError(
        current.formatVersion,
        current.formatVersion + 1,
        `no migration is registered from version ${current.formatVersion}`,
      );
    }

    const result = migration.migrate(current);
    if (result.status === 'unsupported') {
      throw new UnmigratableDataFormatVersionError(
        migration.from,
        migration.to,
        result.reason,
      );
    }

    const next = RawEnvelopeSchema.safeParse(result.envelope);
    if (!next.success) {
      throw new ShieldWizardDataError(
        `Migration from format version ${migration.from} to ${migration.to} produced an invalid envelope: `
        + toIssues(next.error).map(issue => `${issue.path}: ${issue.message}`).join('; '),
      );
    }
    if (next.data.formatVersion !== migration.to) {
      throw new ShieldWizardDataError(
        `Migration from format version ${migration.from} must produce formatVersion ${migration.to}, got ${next.data.formatVersion}`,
      );
    }

    current = next.data as unknown as ShieldWizardRawEnvelope;
    applied.push(migration);
  }

  throw new ShieldWizardDataError(
    `Migration exceeded ${MAX_MIGRATION_STEPS} steps; the registry probably has a cycle`,
  );
}

// ─────────────────────────────────────────────────────────────
// Parse / load
// ─────────────────────────────────────────────────────────────

export interface ParseShieldWizardDataOptions {
  /**
   * Accept structurally incomplete work-in-progress documents.
   *
   * Defaults to `true` (the localStorage-like behaviour): missing
   * optional fields get their defaults and an empty name/shield is
   * tolerated so an unfinished edit can be reopened. Structural
   * problems are returned as `issues` instead of failing the load.
   * Set to `false` when the document is expected to be complete
   * (e.g. a generated repository file).
   */
  allowPartial?: boolean;
  /** Target format version. Defaults to `CURRENT_DATA_FORMAT_VERSION`. */
  targetVersion?: number;
  /** Migration registry. Defaults to the built-in one (tests may inject). */
  migrations?: readonly FormatMigration[];
}

/**
 * Parse a Shield Wizard data document (JSON text or already-parsed
 * JSON value) into editable keyboard state.
 *
 * Validation levels:
 *   1. JSON syntax.
 *   2. Envelope (`formatVersion` + object `data`).
 *   3. Format version gate + migrations.
 *   4. Structural `KeyboardSchema` validation (defaults fill optional
 *      fields; `allowPartial` additionally tolerates drafts).
 *
 * Full business validation (`ValidatedKeyboardSchema`) is deliberately
 * NOT performed here — the point of this module is to be able to open
 * incomplete work.
 */
export function parseShieldWizardData(
  input: string | unknown,
  options: ParseShieldWizardDataOptions = {},
): ParsedShieldWizardData {
  const raw = typeof input === 'string' ? parseJsonDocument(input) : input;
  const allowPartial = options.allowPartial ?? true;
  const targetVersion = options.targetVersion ?? CURRENT_DATA_FORMAT_VERSION;

  const envelopeResult = RawEnvelopeSchema.safeParse(raw);
  if (!envelopeResult.success) {
    throw new ShieldWizardDataEnvelopeError(
      'Not a Shield Wizard data file: expected an object with a positive integer "formatVersion" and an object "data"',
      toIssues(envelopeResult.error),
    );
  }
  const envelope = envelopeResult.data as unknown as ShieldWizardRawEnvelope;

  if (envelope.formatVersion > targetVersion) {
    throw new UnsupportedDataFormatVersionError(envelope.formatVersion, targetVersion);
  }

  const migrationReport = migrateEnvelope(envelope, {
    targetVersion,
    migrations: options.migrations,
  });
  const migrated = migrationReport.envelope;

  const strictResult = KeyboardSchema.safeParse(migrated.data);
  let keyboard: Keyboard;
  let issues: DataIssue[] = [];

  if (strictResult.success) {
    keyboard = strictResult.data;
  }
  else if (allowPartial) {
    const draftResult = DraftKeyboardSchema.safeParse(migrated.data);
    if (!draftResult.success) {
      throw new ShieldWizardDataValidationError(
        'Invalid Shield Wizard keyboard data',
        toIssues(draftResult.error),
      );
    }
    keyboard = draftResult.data as Keyboard;
    issues = toIssues(strictResult.error);
  }
  else {
    throw new ShieldWizardDataValidationError(
      'Invalid Shield Wizard keyboard data',
      toIssues(strictResult.error),
    );
  }

  return {
    keyboard,
    formatVersion: targetVersion,
    originalFormatVersion: envelope.formatVersion,
    appliedMigrations: migrationReport.applied,
    extensions: collectExtensions(migrated),
    issues,
  };
}

// ─────────────────────────────────────────────────────────────
// Serialize / save
// ─────────────────────────────────────────────────────────────

export interface SerializeShieldWizardDataOptions {
  /**
   * Allow a work-in-progress keyboard (empty name/shield, no layout,
   * no parts). Defaults to `false`: canonical files must be complete.
   */
  allowPartial?: boolean;
  /** Indent the JSON. Defaults to `true` for readable repository files. */
  pretty?: boolean;
  /** Unknown keys from a previous `parseShieldWizardData` call to preserve. */
  extensions?: ShieldWizardDataExtensions;
}

/**
 * Serialize keyboard state into the canonical Shield Wizard data
 * document string (with a trailing newline).
 */
export function serializeShieldWizardData(
  keyboard: Keyboard,
  options: SerializeShieldWizardDataOptions = {},
): string {
  const allowPartial = options.allowPartial ?? false;
  const pretty = options.pretty ?? true;

  const schema = allowPartial ? DraftKeyboardSchema : KeyboardSchema;
  const validation = schema.safeParse(keyboard);
  if (!validation.success) {
    throw new ShieldWizardDataValidationError(
      'Cannot save Shield Wizard data',
      toIssues(validation.error),
    );
  }
  const normalized = validation.data as Keyboard;

  // Unknown extension keys go first so a known field always wins on a
  // collision; known fields follow in the order declared by the schema.
  const data: Record<string, unknown> = { ...(options.extensions?.data) };
  for (const field of KNOWN_DATA_FIELD_ORDER) {
    data[field] = normalized[field];
  }

  const envelope: Record<string, unknown> = {
    formatVersion: CURRENT_DATA_FORMAT_VERSION,
    ...(options.extensions?.envelope),
    data,
  };
  // In case `extensions.envelope` carried a stale `formatVersion`, keep
  // the correct value while preserving the key's first position.
  envelope.formatVersion = CURRENT_DATA_FORMAT_VERSION;

  return `${JSON.stringify(envelope, null, pretty ? 2 : 0)}\n`;
}
