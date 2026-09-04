// @ts-check
import { defineConfig, envField, sessionDrivers } from 'astro/config';
import path from 'node:path';

import starlight from '@astrojs/starlight';
import versionPlugin from './scripts/vite-plugin-version.js';

import vue from '@astrojs/vue';
import ui from '@nuxt/ui/vite';
import tailwindcss from '@tailwindcss/vite';
import {
  SFCFluentPlugin,
} from 'unplugin-fluent-vue/vite';

import cloudflare from '@astrojs/cloudflare';

import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  site: 'https://shield-wizard.genteure.com',
  // TODO Removs once cloudflare/workers-sdk#14218 is released.
  output: process.env.VITEST ? 'server' : undefined,

  env: {
    schema: {
      TURNSTILE_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Defaults to Cloudflare's documented "always pass" Turnstile test
      // sitekey so `astro dev`/`astro build` work without a `.env`. Override
      // with a real sitekey (and set TURNSTILE_SECRET) in deployments that
      // enforce captcha.
      PUBLIC_TURNSTILE_SITEKEY: envField.string({ context: 'client', access: 'public', optional: true, default: '1x00000000000000000000AA' }),
      FEEDBACK_WEBHOOK_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // GitHub App credentials for the edit-existing-repository flow.
      // `PUBLIC_GITHUB_CLIENT_ID` is the App's Client ID (NOT the App ID).
      PUBLIC_GITHUB_CLIENT_ID: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      // URL slug of the GitHub App (used for the installation deep link).
      PUBLIC_GITHUB_APP_SLUG: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      GITHUB_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Random secret used to encrypt the GitHub access token inside the
      // stateless HttpOnly session cookie and to sign OAuth state values.
      GITHUB_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Optional HTTP CONNECT proxy for local development only, e.g.
      // http://proxy:20171. Ignored in production builds.
      GITHUB_HTTP_PROXY: envField.string({ context: 'server', access: 'public', optional: true, default: '' }),
    },
  },

  // Shield Wizard is stateless on purpose: GitHub auth lives in an
  // encrypted HttpOnly cookie, not in Astro's session storage. Force an
  // in-memory driver so the Cloudflare adapter does not require a SESSION
  // KV namespace.
  session: {
    driver: sessionDrivers.lruCache(),
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
      sidebar: [
        {
          label: 'Shield Wizard Docs',
          items: [
            { autogenerate: { directory: 'docs' } },
          ],
        },
      ],
    }),
  ],

  redirects: {
    '/next-steps': '/docs/next-steps',
    '/docs/layout-edit': '/docs/layouts',
  },

  vite: {
    server: {
      allowedHosts: ['shield-wizard.genteure.workers.dev'],
    },
    optimizeDeps: {
      exclude: ['tunnelfetch'],
    },
    ssr: {
      optimizeDeps: {
        exclude: ['tunnelfetch'],
      },
    },
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
    ],
  },

  // TODO: Remove once cloudflare/workers-sdk#14218 is released.
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({
        imageService: {
          build: 'compile',
          runtime: 'passthrough',
        },
      }),
});
