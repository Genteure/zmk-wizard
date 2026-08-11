/**
 * Vue SFC template validator.
 *
 * WHY THIS EXISTS
 * ---------------
 * `vue-tsc --noEmit` does not report Vue template *syntax* errors as CLI
 * diagnostics, even though Volar's language server shows the same errors in
 * the editor. The CLI only surfaces diagnostics that cascade into TypeScript
 * errors, so template parse failures that don't produce type errors are
 * dropped silently.
 *
 * Empirically verified against vue-tsc 3.3.8 / @vue/compiler-sfc 3.5.40 with
 * one probe file per error class:
 *   - Completely invisible to `vue-tsc` (exit 0):
 *       mismatched tags     `<div><span></div></span>`
 *       unclosed element    `<div>` without `</div>`
 *       unclosed quote      `v-if="open>` in an attribute
 *       bad interpolation   `{{ 1 + }}`
 *   - Reported only as misleading downstream type errors:
 *       invalid v-for       `v-for="item in"`  -> `Property 'item' does not exist`
 *       duplicate attribute `id="a" id="b"`    -> `TS1117` duplicate object key
 * This script closes that gap so `pnpm check` fails on broken templates;
 * `check` runs it before `vue-tsc` so syntax errors fail fast with a readable
 * message instead of a confusing cascade (or silence).
 *
 * BEHAVIOR
 * --------
 * Walks every `*.vue` file under `src/` and runs the Vue SFC compiler
 * directly:
 *   - `parse()`: structural errors (malformed blocks, unclosed tags,
 *     duplicate attributes, invalid interpolation expressions).
 *   - `compileTemplate()`: template-only compile errors that `parse()` misses
 *     (e.g. `v-for` with an invalid expression).
 * Both passes are required — neither alone covers all error classes. The two
 * passes often report the same issue for one broken template; a per-file Set
 * dedupes identical messages.
 *
 * Compiler locations are relative to the source passed in: `parse()` errors
 * are already file-relative, but `compileTemplate()` errors are relative to
 * the template block content, NOT the file — with a long `<script>` block
 * before `<template>`, every reported line is wrong. `toFileError()` maps
 * them back to file coordinates via `template.loc.end`, which points at the
 * `<` of `</template>` (not past its `>`): `contentStart = loc.end.offset -
 * content.length`. Do not "simplify" this: the obvious
 * `- '</template>'.length` variant was off by one line.
 *
 * Errors print with the offending source line and a caret. Exit code is 1 if
 * any file fails, 0 otherwise. Runtime is well under a second for this
 * codebase.
 *
 * MAINTENANCE
 * -----------
 * Before removing this script, re-verify that `vue-tsc --noEmit` reports
 * template syntax errors: create a fixture with an unclosed tag plus a bad
 * `v-for` and confirm both surface as CLI diagnostics (they did not with
 * vue-tsc 3.3.8), and re-check the location mapping with a template that
 * follows a 20-line `<script>` block.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { compileTemplate, parse } from 'vue/compiler-sfc';
import type { SFCTemplateBlock } from 'vue/compiler-sfc';

type CompilerError = {
  message?: string;
  loc?: {
    start?: {
      line?: number;
      column?: number;
      offset?: number;
    };
  };
  line?: number;
  column?: number;
};

type FileError = {
  message: string;
  line?: number;
  column?: number;
};

async function listVueFiles(directory: string, files: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await listVueFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.vue')) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Convert a character offset into 1-based `{ line, column }` for `source`. */
function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }

  return { line, column: offset - lineStart + 1 };
}

/**
 * Errors from `compileTemplate` are located relative to the template block
 * content, not the file. Map them back to file coordinates: the template's
 * content starts right after the opening `<template>` tag, whose offset is
 * derived from the block's end offset and content length.
 */
function toFileError(error: unknown, source: string, template: SFCTemplateBlock | null): FileError {
  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    const compilerError = error as CompilerError;
    const message = compilerError.message ?? 'Unknown Vue compiler error';
    const loc = compilerError.loc?.start;
    const line = loc?.line ?? compilerError.line;
    const column = loc?.column ?? compilerError.column;

    if (line == null || column == null) {
      return { message };
    }

    if (template && loc?.offset != null) {
      // `template.loc.end` points at the `<` of `</template>`, so the content
      // spans `[end.offset - content.length, end.offset)` in file coordinates.
      const contentStart = template.loc.end.offset - template.content.length;
      const position = offsetToPosition(source, contentStart + loc.offset);

      return { message, line: position.line, column: position.column };
    }

    return { message, line, column };
  }

  return { message: String(error) };
}

function renderError(source: string, error: FileError): string {
  const { message, line, column } = error;
  const location = line != null && column != null ? ` (${line}:${column})` : '';
  const header = `  error: ${message}${location}`;

  if (line == null || column == null || line > source.split('\n').length) {
    return header;
  }

  const sourceLine = source.split('\n')[line - 1];
  // EOF-style errors point one past the last line; clamp the caret.
  const caretColumn = Math.max(1, Math.min(column, sourceLine.length + 1));
  const gutter = String(line).length;

  return [
    header,
    `  ${' '.repeat(gutter)} | ${sourceLine}`,
    `  ${String(line).padStart(gutter)} | ${' '.repeat(caretColumn - 1)}^`,
  ].join('\n');
}

const sourceRoot = join(process.cwd(), 'src');
const vueFiles = await listVueFiles(sourceRoot);
const failures: Array<{ path: string; errors: string[] }> = [];

for (const file of vueFiles) {
  const source = await readFile(file, 'utf8');
  const parsed = parse(source, { filename: file });
  const template = parsed.descriptor.template ?? null;
  const fileErrors = new Set<string>();

  for (const error of parsed.errors) {
    fileErrors.add(renderError(source, toFileError(error, source, null)));
  }

  if (template) {
    const templateResult = compileTemplate({
      source: template.content,
      filename: file,
      id: file,
    });

    for (const error of templateResult.errors ?? []) {
      fileErrors.add(renderError(source, toFileError(error, source, template)));
    }
  }

  if (fileErrors.size > 0) {
    failures.push({ path: relative(process.cwd(), file), errors: Array.from(fileErrors) });
  }
}

if (failures.length > 0) {
  console.error(`Vue SFC validation failed: ${failures.length} of ${vueFiles.length} files have errors.\n`);

  for (const failure of failures) {
    console.error(failure.path);

    for (const error of failure.errors) {
      console.error(error);
    }

    console.error('');
  }

  process.exit(1);
}

console.log(`Vue SFC validation passed: ${vueFiles.length} files checked, no syntax errors.`);
