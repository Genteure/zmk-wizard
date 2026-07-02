---
name: generate-and-troubleshoot-config
description: "Generate and troubleshoot ZMK config output from fixture JSON files. Use when you need to reproduce a config issue, inspect generated files, validate a keyboard fixture, or debug templating and build matrix problems with pnpm run smoke generate."
argument-hint: "Which fixture or config issue should be reproduced?"
user-invocable: true
disable-model-invocation: false
---

# Generate and Troubleshoot Config

Use this skill to reproduce a config-generation issue from a fixture JSON, inspect the generated repository, and narrow failures to fixture validation, templating, or build-matrix generation.

## When to Use

- Reproduce a bad config output from a keyboard fixture.
- Inspect the files created by ZMK config generation.
- Debug fixture schema errors or validation failures.
- Debug missing or incorrect files in generated output.
- Debug `build.yaml` or build matrix generation issues.

## Core Workflow

1. Identify the smallest fixture JSON that reproduces the issue.
2. Generate output into a temporary directory.
3. Inspect the generated files and compare them with the expected repository layout.
4. Classify the failure:
   - Schema error: the fixture does not match `KeyboardSchema`.
   - Validation error: the fixture passes schema but fails project validation rules.
   - Templating error: generated files are structurally wrong or missing content.
   - Matrix error: `build.yaml` does not produce the expected build matrix.
5. Fix the source of truth, not the generated output.
6. Regenerate in a fresh temp directory and confirm the issue is gone.

## Command Pattern

Use the smoke generator to materialize a config repo from a fixture:

```bash
pnpm run smoke generate <fixture>.json /tmp/<some-temp-dir>
```

Use an absolute fixture path when the repro comes from outside `examples/json`, and always point the destination at an empty temporary directory so stale files do not hide regressions.

## Troubleshooting Guide

### 1. Fixture read or parse failures

- Confirm the JSON file exists and is valid JSON.
- Re-run with the exact fixture path the user reported.
- If the command cannot open the file, fix the path before inspecting the template logic.

### 2. `KeyboardSchema` or validation failures

- Treat these as fixture problems unless the validation rule is clearly wrong.
- Check whether the issue is missing required fields, wrong pin usage, invalid controller data, or a cross-field constraint.
- Prefer correcting the fixture or the validation rule at the owning type/schema.

### 3. Generated file mismatches

- Inspect the generated repository under the temporary directory.
- Compare the expected file with the source data in the fixture and the templating code that produces it.
- Trace the failure back to the owning generator in `src/export/` or the relevant metadata/type definition.

### 4. Build matrix problems

- Open the generated `build.yaml` and verify the matrix content.
- Make sure optional sample builds and commented sections are handled the same way as the smoke script.
- If the matrix is wrong, inspect `scripts/smoke.ts` and the `build.yaml` template together.

## Decision Points

- Repro from fixture or from generated output?
  - Use the generated repo to inspect the symptom.
  - The fixture is usually large and complex, consider using eval script to understand the input if necessary.
- Template bug or bad fixture data?
  - If the same fixture always generates the same wrong output, inspect the template.
  - If the output changes after correcting the fixture, the fixture was the root cause.

## Completion Checklist

- The fixture reproduces the problem before the fix.
- The generated repo lands in a clean temporary directory.
- The failure is classified as schema, validation, templating, or matrix generation.
- The owning source is updated instead of editing generated files by hand.
- Regenerating into a fresh temp directory confirms the fix.

## References

- How smoke test works `<project_root>/scripts/smoke.md`
- Smoke test generator `<project_root>/scripts/smoke.ts`
