// @ts-check
import { defineConfig, envField } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile'
  }),

  integrations: [solidJs()],

  env: {
    schema: {
      PUBLIC_TURNSTILE_SITEKEY: envField.string({
        context: 'client',
        access: 'public',
        default: '3x00000000000000000000FF',
      }),
      TURNSTILE_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
    }
  },

  vite: {
    resolve: {
      alias: {
        '~': new URL('./src', import.meta.url).pathname,
      },
    },
    plugins: [tailwindcss()]
  },

});
