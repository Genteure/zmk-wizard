// @ts-check
import { defineConfig, envField } from 'astro/config';

import starlight from '@astrojs/starlight';
import versionPlugin from './scripts/vite-plugin-version.js';

import vue from '@astrojs/vue';
import ui from '@nuxt/ui/vite';
import tailwindcss from '@tailwindcss/vite';
import {
  SFCFluentPlugin,
} from 'unplugin-fluent-vue/vite';

import cloudflare from '@astrojs/cloudflare';

import path from 'path';
import { fileURLToPath } from 'url';

// https://astro.build/config
export default defineConfig({
  site: 'https://shield-wizard.genteure.com',
  // TODO Removs once cloudflare/workers-sdk#14218 is released.
  output: process.env.VITEST ? 'server' : undefined,

  env: {
    schema: {
      TURNSTILE_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_TURNSTILE_SITEKEY: envField.string({ context: "client", access: "public" }),
      FEEDBACK_WEBHOOK_URL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  integrations: [
    vue({
      appEntrypoint: '/src/_entrypoint.ts',
    }),
    starlight({
      title: 'Shield Wizard',
      editLink: {
        baseUrl:
          process.env.NODE_ENV === 'development'
            ? `vscode://file/${path.dirname(fileURLToPath(import.meta.url))}`
            : 'https://github.com/genteure/zmk-wizard/blob/main',
      },
    }),
  ],

  vite: {
    plugins: [
      ui({
        router: false,
        theme: {
          colors:
            [
              'primary',
              'secondary',
              'success',
              'info',
              'warning',
              'error',
              'kscanin',
              'kscanout',
              'part0',
              'part1',
              'part2',
              'part3',
              'part4',
            ],
        },
        ui: {
          colors: {
            primary: 'indigo',
            secondary: 'teal',
            neutral: 'mist',

            kscanin: 'emerald',
            kscanout: 'rose',
            part0: 'orange',
            part1: 'sky',
            part2: 'pink',
            part3: 'violet',
            part4: 'cyan',
          },
        },
      }),
      tailwindcss(),
      SFCFluentPlugin({
        blockType: 'ftl',
        checkSyntax: true,
        parseFtl: true,
      }),
      versionPlugin(),
      // TODO: Remove once cloudflare/workers-sdk#14218 is released.
      // The Cloudflare Vite plugin rejects `resolve.external` in SSR environments,
      // causing errors when running vitest.
      {
        name: 'remove-ssr-external',
        configResolved(config) {
          config.environments.ssr.resolve.external = [];
        },
      },
    ]
  },

  // TODO: Remove once cloudflare/workers-sdk#14218 is released.
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({
      imageService: {
        build: 'compile',
        runtime: 'passthrough',
      }
    }),
});
