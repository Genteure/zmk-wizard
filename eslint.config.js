import { createConfigForNuxt } from '@nuxt/eslint-config';
import eslintPluginAstro from 'eslint-plugin-astro';

export default createConfigForNuxt(
  {
    features: {
      // Formatting via the Nuxt preset (@stylistic for JS/TS + vue formatting
      // rules). Set to `false` for lint-only mode.
      stylistic: {
        indent: 2,
        semi: true, // explicit semicolons preferred
        commaDangle: 'always-multiline',
      },
    },
  },
  ...eslintPluginAstro.configs.recommended,
  {
    name: 'project/rules',
    rules: {
      // Single-word names like `app.vue`/`main.vue` are conventional here.
      'vue/multi-word-component-names': 'off',
      // Naming convention; converting existing props to kebab-case is churn
      // with no functional gain.
      'vue/attribute-hyphenation': 'off',
      // `delete record[key]` on reactive records is the idiomatic Pinia pattern.
      '@typescript-eslint/no-dynamic-delete': 'off',
      // The codebase intentionally uses compact one-line statements in tests
      // and type-guard helpers; the rule has no autofix and fights that style.
      '@stylistic/max-statements-per-line': 'off',
    },
  },
);
