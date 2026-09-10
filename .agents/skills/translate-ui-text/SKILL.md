---
name: translate-ui-text
description: "Translate and maintain UI text in this Vue + Astro + fluent-vue project. Use when adding, renaming, or reviewing localized UI strings, FTL keys, and locale parity across en, zh-CN, and ja."
argument-hint: "What UI copy or component should be translated?"
user-invocable: true
disable-model-invocation: false
---

# Translate UI Text

Translate UI strings in this repository using Fluent (`fluent-vue`) while keeping locale keys consistent across `en`, `zh-CN`, and `ja`.

## When to Use

- Add new user-facing text in Vue components.
- Translate existing strings for `zh-CN` and `ja`.
- Rename/remove translation keys.
- Review for missing keys, inconsistent placeholders, or hardcoded UI copy.

## Project Translation Rules

- UI strings should be called via `$t('key-name')` in Vue templates/scripts.
- Translations are defined in `<ftl locale="en">`, `<ftl locale="zh-CN">`, and `<ftl locale="ja">` blocks in SFCs.
- `<ftl locale="..">` blocks are outside the `<script>` or `<template>` sections, placed at the end of the file.
- Keep key names stable and kebab-case-like (for example: `external-modules-title`).
- If a string uses variables, preserve placeholders in every locale (for example: `{ $devices }`).
- Keep non-UI technical tokens unchanged when appropriate (product names, file names, identifiers).
- Prefer one key per complete sentence/intent. Do not split a sentence into many tiny keys unless reuse is required.

## Tone and Language Quality

- Default to a neutral tone in all locales unless a feature explicitly requires a different voice.
  - Do NOT use honorifics in any locale. "您" is explicitly disallowed, use neutral "你" instead.
- Use component and project context to infer intent before translating.
  - Consider where the text appears (button label, warning, helper text, modal, paragraph).
  - Keep wording aligned with ZMK/keyboard domain terminology used elsewhere in the project.
- Translate by meaning, not by word order.
  - Consider full sentences or paragraphs together.
  - Reorder and restructure phrasing so it reads naturally in each target language.
  - Choose natural synonyms that preserve intent, precision, and UX clarity.
  - Consider at least 2, up to 4, candidate phrasings for each locale and pick the best one.
- Avoid literal, word-by-word translation.
  - If a literal rendering sounds awkward, rewrite for natural fluency while preserving meaning.
  - Preserve action clarity for controls and instructions (users should immediately know what happens).

## Fluent Syntax Essentials

- Variables and placeables:
  - Use variables for runtime values: `welcome = Welcome, { $user }!`
  - Keep variable names stable across locales.
- Select expressions (plural/gender/state):
  - Use selector variants for grammar/plurals.
  - Always provide a default variant marked with `*`.
  - Example:
    ```ftl
    unread-emails = { $count ->
      [1] You have one unread email.
     *[other] You have { $count } unread emails.
    }
    ```
- Built-in formatting functions:
  - `NUMBER(...)` for locale-aware number formatting.
  - `DATETIME(...)` for locale-aware date/time formatting.
- Message references:
  - Reuse existing messages for consistency (for example, button labels).
- Attributes:
  - Use message attributes when one UI element needs multiple localized fields such as label, title, and aria-label.
- Terms:
  - Terms start with `-` and are meant for reusable private linguistic units (brand forms, grammar helpers).
- Comments:
  - Add translator comments (`#`) for ambiguous placeholders, domain jargon, or expected tone.

If you need to learn more about Fluent syntax, use Read/Fetch tool to read <https://github.com/fluent-vue/docs/raw/refs/heads/main/src/fluent-syntax.md>.

## Component and Directive Usage

- Use `$t(...)` for normal plain-text bindings.
- Use `$ta(...)` when you need only Fluent message attributes as an object (for example, binding props/attrs for custom components with `v-bind`).
- Use `<i18n>` component when the localized sentence includes links/components/markup that must be reordered per language.
  - Prefer this over splitting a sentence into separate keys.
  - Use scoped slots to inject Vue components and to read message attributes for slot labels.
  - Use `html` only for trusted translations because it can break layout or introduce XSS risk.
- Use `v-t:key="args"` on plain HTML elements when you want to bind both element text and localizable attributes from one key.
  - This is useful for `aria-label`, `title`, `alt`, and similar attributes.
  - Prefer `v-t` over `$ta` for regular HTML elements; use `$ta` mostly for custom component parameters.
  - Use modifiers only when you intentionally need additional bound attributes.

If you need to learn more about Fluent usage in Vue, use Read/Fetch tool to read:

- i18n component allows localizing text that contains HTML elements or Vue.js components: <https://github.com/fluent-vue/docs/raw/refs/heads/main/src/api/i18n-component.md>
- v-t directive: <https://github.com/fluent-vue/docs/raw/refs/heads/main/src/api/v-t-directive.md>
- `$t` and `$ta` functions (Composition API is exactly the same as Options API): <https://github.com/fluent-vue/docs/raw/refs/heads/main/src/api/instance-methods.md>

## Procedure

1. Identify scope and target component(s).
2. Find all affected translation keys and usages.
3. Decide change type:
   - New UI text: add new key usages and add entries for all locales.
   - Existing key text update: update locale values without changing key name unless needed.
   - Key rename/removal: update all `$t(...)` call sites and every locale block in one pass.
4. Edit SFC locale blocks:
   - Add/edit matching keys in all three locale sections.
   - Keep placeholder variable names identical across locales.
   - Preserve select-expression structure and default variants across locales.
   - Preserve translator comments when they explain placeholders or context.
5. Replace hardcoded user-facing copy with `$t(...)` calls when touching that area.
6. For rich sentences that include components/links:
   - Convert to a single key rendered with `<i18n>` and scoped slots.
   - If attributes like `aria-label`/`title` are part of the same message intent, consider `v-t`.
7. For attribute-only localization:
   - If the target is a plain HTML element, prefer `v-t:key="args"`.
   - If the target is a custom component API expecting an attributes object, use `$ta(key, args)`.
8. Review language quality in context:
   - Check neighboring strings in the same component to keep tone and terminology consistent.
   - Ensure wording is natural for native readers and not a literal mirror of source word order.
   - For related messages, review them together (sentence groups, helper text blocks, multi-line explanations).
9. Validate consistency and build checks:
   - Ensure each key exists in `en`, `zh-CN`, and `ja`.
   - Ensure placeholder names and select variant keys are semantically equivalent across locales.
   - Ensure attribute keys expected by `$ta`/`v-t` are present in all locales (for example `.placeholder`, `.aria-label`, `.title`).
   - Ensure any `<i18n html>` usage is justified and safe.
   - Run `pnpm check`.
10. Report outcome:

- Files changed.
- Keys added/updated/removed.
- Any key rewrites done for tone/naturalness (not literal translation).
- Any intentionally deferred translations.

## Decision Points

- Keep key or rename?
  - Keep key when semantics are unchanged and only wording changes.
  - Rename key when meaning changes materially or old key becomes misleading.
- Translate immediately or defer?
  - Add all locales immediately for normal UI work.
  - If translation quality is uncertain, use a clearly marked temporary value and report follow-up.
- Literal or natural rewrite?
  - Prefer natural, idiomatic phrasing in each locale.
  - Rewrite sentence structure when needed to preserve intent and readability.
  - Do not force source-language word order into target languages.
- Reuse existing key or add new?
  - Reuse only when wording and context are truly identical.
  - Add new key when context differs to avoid awkward translations.
- `$t` vs `$ta` vs `<i18n>` vs `v-t`?
  - Use `$t` for plain text.
  - Use `$ta` to retrieve only message attributes as an object.
  - Use `<i18n>` for translatable sentences with embedded components/links and language-dependent order.
  - Use `v-t` for plain HTML element text + localized attributes from one key.

## Completion Checklist

- Every touched key has entries in `en`, `zh-CN`, and `ja`.
- Placeholder variables match exactly across locales.
- Select expressions keep a required default variant (`*`) in each locale.
- No new hardcoded user-facing text remains in modified UI sections.
- Rich localized sentences with links/components use `<i18n>` instead of fragmented keys.
- Tone is neutral and consistent with surrounding component copy.
- Translations are context-aware, natural, and not literal word-by-word renderings.
- `pnpm check` passes.
- Change summary includes translation key changes and follow-ups.

## Useful Search Patterns

- Find translation calls: `$t('`
- Find attribute-only calls: `$ta(`
- Find Fluent blocks: `<ftl locale="`
- Find likely hardcoded copy in templates: text nodes and static `title`/`description` props in touched files

## Example Prompts

- `/translate-ui-text Add translations for the new advanced bus settings section in part editor.`
- `/translate-ui-text Review and fix locale parity in src/components/editor/keyboard.vue.`
- `/translate-ui-text Replace hardcoded text in KeyboardNameDialog with Fluent keys.`
