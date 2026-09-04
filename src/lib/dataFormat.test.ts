import { describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';
import { createZMKConfig } from '~/export';
import type { Key, Keyboard, KeyId } from '~/types';
import {
  cloneEnvelope,
  CURRENT_DATA_FORMAT_VERSION,
  defineFormatMigration,
  isShieldWizardDataEnvelope,
  parseShieldWizardData,
  serializeShieldWizardData,
  SHIELD_WIZARD_DATA_FILE,
  ShieldWizardDataEnvelopeError,
  ShieldWizardDataJsonError,
  ShieldWizardDataValidationError,
  UnmigratableDataFormatVersionError,
  UnsupportedDataFormatVersionError,
  type ShieldWizardRawEnvelope,
} from './dataFormat';

function makeKey(part = 0): Key {
  return {
    id: ulid() as KeyId,
    part,
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    rx: 0,
    ry: 0,
  };
}

function makeKeyboard(overrides: Partial<Keyboard> = {}): Keyboard {
  const key = makeKey(0);
  return {
    name: 'Test Board',
    shield: 'test_board',
    dongle: false,
    modules: [],
    layout: [key],
    parts: [
      {
        name: 'left',
        controller: 'nice_nano_v2',
        pins: {},
        kscans: [],
        keys: {},
        encoders: [],
        buses: {},
      },
    ],
    ...overrides,
  } as Keyboard;
}

function envelope(keyboard: unknown, formatVersion = CURRENT_DATA_FORMAT_VERSION): string {
  return JSON.stringify({ formatVersion, data: keyboard });
}

describe('Shield Wizard stable data format', () => {
  describe('serialize → parse round trip', () => {
    it('produces a versioned envelope and loads it back', () => {
      const keyboard = makeKeyboard();
      const text = serializeShieldWizardData(keyboard);

      expect(text.endsWith('\n')).toBe(true);

      const document = JSON.parse(text);
      expect(document.formatVersion).toBe(CURRENT_DATA_FORMAT_VERSION);
      expect(Object.keys(document)).toEqual(['formatVersion', 'data']);
      expect(Object.keys(document.data)).toEqual(['name', 'shield', 'dongle', 'modules', 'layout', 'parts']);

      const parsed = parseShieldWizardData(text);
      expect(parsed.formatVersion).toBe(CURRENT_DATA_FORMAT_VERSION);
      expect(parsed.originalFormatVersion).toBe(CURRENT_DATA_FORMAT_VERSION);
      expect(parsed.appliedMigrations).toEqual([]);
      expect(parsed.issues).toEqual([]);
      expect(parsed.keyboard).toEqual(keyboard);
    });

    it('applies defaults for missing optional fields', () => {
      const keyboard = makeKeyboard();
      const partial = {
        name: keyboard.name,
        shield: keyboard.shield,
        layout: keyboard.layout,
        parts: keyboard.parts,
        // dongle/modules intentionally missing
      };

      const parsed = parseShieldWizardData(envelope(partial));
      expect(parsed.issues).toEqual([]);
      expect(parsed.keyboard.dongle).toBe(false);
      expect(parsed.keyboard.modules).toEqual([]);
    });
  });

  describe('partial work-in-progress loading', () => {
    it('loads a draft with empty name/shield and no keys by default', () => {
      const parsed = parseShieldWizardData(envelope({
        name: '',
        shield: '',
        layout: [],
        parts: [],
      }));

      expect(parsed.keyboard.name).toBe('');
      expect(parsed.keyboard.shield).toBe('');
      expect(parsed.keyboard.layout).toEqual([]);
      expect(parsed.keyboard.parts).toEqual([]);
      expect(parsed.keyboard.dongle).toBe(false);
      expect(parsed.keyboard.modules).toEqual([]);
      expect(parsed.issues.length).toBeGreaterThan(0);
      expect(parsed.issues.some(issue => issue.path === 'name')).toBe(true);
    });

    it('rejects drafts when allowPartial is false', () => {
      expect(() => parseShieldWizardData(
        envelope({ name: '', shield: '', layout: [], parts: [] }),
        { allowPartial: false },
      )).toThrow(ShieldWizardDataValidationError);
    });

    it('can explicitly save drafts with allowPartial', () => {
      const text = serializeShieldWizardData({
        name: '',
        shield: '',
        layout: [],
        parts: [],
      } as unknown as Keyboard, { allowPartial: true });

      const parsed = parseShieldWizardData(text);
      expect(parsed.keyboard.name).toBe('');
      expect(parsed.issues.length).toBeGreaterThan(0);
    });
  });

  describe('format version gating and migration', () => {
    it('fails closed on a newer format version', () => {
      expect(() => parseShieldWizardData(
        envelope(makeKeyboard(), CURRENT_DATA_FORMAT_VERSION + 1),
      )).toThrow(UnsupportedDataFormatVersionError);
    });

    it('fails when no migration exists for an older version', () => {
      expect(() => parseShieldWizardData(
        envelope(makeKeyboard(), 1),
        { targetVersion: 2, migrations: [] },
      )).toThrow(UnmigratableDataFormatVersionError);
    });

    it('runs a migration chain and reports what was applied', () => {
      const renameMigration = defineFormatMigration(1, 'Rename keyboard for test', (env) => {
        const next = cloneEnvelope(env);
        const data = next.data as { name: string };
        data.name = 'Migrated Board';
        return {
          status: 'migrated',
          envelope: { ...next, formatVersion: 2 },
        };
      });

      const parsed = parseShieldWizardData(
        envelope(makeKeyboard(), 1),
        { targetVersion: 2, migrations: [renameMigration] },
      );

      expect(parsed.originalFormatVersion).toBe(1);
      expect(parsed.formatVersion).toBe(2);
      expect(parsed.appliedMigrations).toEqual([renameMigration]);
      expect(parsed.keyboard.name).toBe('Migrated Board');
    });

    it('surfaces an explicitly unsupported migration without modifying data', () => {
      const unsupportedMigration = defineFormatMigration(1, 'Unsupported test change', () => ({
        status: 'unsupported',
        reason: 'the old format has no equivalent for the new required field',
      }));

      expect(() => parseShieldWizardData(
        envelope(makeKeyboard(), 1),
        { targetVersion: 2, migrations: [unsupportedMigration] },
      )).toThrow(/no equivalent for the new required field/);
    });

    it('keeps migration inputs immutable via cloneEnvelope', () => {
      const raw = JSON.parse(envelope(makeKeyboard())) as ShieldWizardRawEnvelope;
      const clone = cloneEnvelope(raw);
      (clone.data as { name: string }).name = 'Changed';

      expect(raw.data.name).toBe('Test Board');
    });

    it('carries unknown envelope/data keys through a migration', () => {
      const migration = defineFormatMigration(1, 'Rename keyboard for test', (env) => {
        const next = cloneEnvelope(env);
        (next.data as { name: string }).name = 'Migrated Board';
        return {
          status: 'migrated',
          envelope: { ...next, formatVersion: 2 },
        };
      });

      const document = JSON.parse(envelope({
        ...makeKeyboard(),
        futureOptionalField: 'keep me',
      }, 1));
      document.futureEnvelopeField = 42;

      const parsed = parseShieldWizardData(document, {
        targetVersion: 2,
        migrations: [migration],
      });

      expect(parsed.keyboard.name).toBe('Migrated Board');
      expect(parsed.extensions.envelope.futureEnvelopeField).toBe(42);
      expect(parsed.extensions.data.futureOptionalField).toBe('keep me');
    });
  });

  describe('unknown fields', () => {
    it('preserves unknown envelope/data keys across an edit round trip', () => {
      const input = envelope({
        ...makeKeyboard(),
        futureOptionalField: 'keep me',
      });
      const document = JSON.parse(input);
      document.futureEnvelopeField = 42;

      const parsed = parseShieldWizardData(JSON.stringify(document));
      const resaved = serializeShieldWizardData(parsed.keyboard, {
        extensions: parsed.extensions,
      });
      const roundTripped = JSON.parse(resaved);

      expect(roundTripped.futureEnvelopeField).toBe(42);
      expect(roundTripped.data.futureOptionalField).toBe('keep me');
      expect(roundTripped.data.name).toBe('Test Board');
    });

    it('preserves unknown data keys that collide with Object.prototype names', () => {
      const input = envelope({
        ...makeKeyboard(),
        toString: 'keep me',
        constructor: 'keep me too',
      });
      const document = JSON.parse(input);
      document.valueOf = 'keep envelope field';

      const parsed = parseShieldWizardData(JSON.stringify(document));
      const resaved = serializeShieldWizardData(parsed.keyboard, {
        extensions: parsed.extensions,
      });
      const roundTripped = JSON.parse(resaved);

      expect(roundTripped.data.toString).toBe('keep me');
      expect(roundTripped.data.constructor).toBe('keep me too');
      expect(roundTripped.valueOf).toBe('keep envelope field');
    });
  });

  describe('envelope shape detection', () => {
    it('recognizes stable envelopes by own formatVersion property', () => {
      expect(isShieldWizardDataEnvelope(JSON.parse(envelope(makeKeyboard())))).toBe(true);
      expect(isShieldWizardDataEnvelope(makeKeyboard())).toBe(false);
      expect(isShieldWizardDataEnvelope([{ formatVersion: 1 }])).toBe(false);

      const inherited = Object.create({ formatVersion: 1 });
      expect(isShieldWizardDataEnvelope(inherited)).toBe(false);
    });
  });

  describe('validation errors', () => {
    it('rejects invalid JSON with a dedicated error', () => {
      expect(() => parseShieldWizardData('{not json')).toThrow(ShieldWizardDataJsonError);
    });

    it('rejects a non-envelope document', () => {
      expect(() => parseShieldWizardData(JSON.stringify({ version: 1, keyboard: {} })))
        .toThrow(ShieldWizardDataEnvelopeError);
    });

    it('rejects structurally invalid keyboard data', () => {
      expect(() => parseShieldWizardData(
        envelope({ name: 42, shield: 'x', layout: [], parts: [] }),
      )).toThrow(ShieldWizardDataValidationError);
    });

    it('refuses to save incomplete data without allowPartial', () => {
      expect(() => serializeShieldWizardData({
        name: '',
        shield: '',
        layout: [],
        parts: [],
      } as unknown as Keyboard)).toThrow(ShieldWizardDataValidationError);
    });
  });

  describe('canonical file constant', () => {
    it('uses the repository-root dotfile agreed for issue #19/#20', () => {
      expect(SHIELD_WIZARD_DATA_FILE).toBe('.shield-wizard.json');
    });

    it('is committed by createZMKConfig as a strict, parseable document', () => {
      const files = createZMKConfig(makeKeyboard());

      expect(files[SHIELD_WIZARD_DATA_FILE]).toBeDefined();
      const parsed = parseShieldWizardData(files[SHIELD_WIZARD_DATA_FILE], {
        allowPartial: false,
      });
      expect(parsed.issues).toEqual([]);
      expect(parsed.keyboard.name).toBe('Test Board');
    });

    it('points the README at the in-repo data file without embedding the envelope', () => {
      const files = createZMKConfig(makeKeyboard());
      const readme = files['README.md'];

      expect(readme).toContain(`[\`${SHIELD_WIZARD_DATA_FILE}\`](${SHIELD_WIZARD_DATA_FILE})`);
      expect(readme).toContain('Shield Wizard Debug Information');
      expect(readme).toMatch(/Generated by Shield Wizard commit: /);
      expect(readme).not.toContain(files[SHIELD_WIZARD_DATA_FILE].trimEnd());
      expect(readme).not.toContain('"formatVersion"');
    });
  });
});
