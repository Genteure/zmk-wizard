/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';
import { configDefaults } from 'vitest/config';

export default getViteConfig({
  test: {
    environment: 'node',
    exclude: [
      ...configDefaults.exclude,
      '**/e2e/**'
    ],
  },
});
