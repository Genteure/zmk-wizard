import { createConfigForNuxt } from '@nuxt/eslint-config';
import eslintPluginAstro from 'eslint-plugin-astro';

export default createConfigForNuxt(
  {},
  ...eslintPluginAstro.configs.recommended,
  {
    name: 'project/offs',
    rules: {
      // Single-word names like `app.vue`/`main.vue` are conventional here.
      'vue/multi-word-component-names': 'off',
      // Naming convention; converting existing props to kebab-case is churn
      // with no functional gain.
      'vue/attribute-hyphenation': 'off',
      // `delete record[key]` on reactive records is the idiomatic Pinia pattern.
      '@typescript-eslint/no-dynamic-delete': 'off',
      // Formatting rules — re-enabled when the formatting pass lands.
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-self-closing': 'off',
    },
  },
);
