// @ts-check
import { defineConfig, envField } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';
import versionPlugin from './scripts/vite-plugin-version.js';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    imageService: 'passthrough',
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

  markdown: {
    rehypePlugins: [
      () => (tree) => {
        /** @param {any} node */
        const setLinkAttrs = (node) => {
          if (node.tagName === 'a') {
            const props = node.properties ?? (node.properties = {});
            props.target = '_blank';

            const existingRel = props.rel;
            const relValues = new Set(
              Array.isArray(existingRel)
                ? existingRel
                : typeof existingRel === 'string'
                  ? existingRel.split(/\s+/)
                  : []
            );

            // relValues.add('noreferrer');
            relValues.add('noopener');

            props.rel = Array.from(relValues);
          }

          if (!node.children) return;

          for (const child of node.children) {
            if (child.type === 'element') {
              setLinkAttrs(child);
            }
          }
        };

        setLinkAttrs(tree);
      },
    ],
  },

  vite: {
    resolve: {
      alias: {
        '~': new URL('./src', import.meta.url).pathname,
      },
    },
    server: {
      watch: {
        ignored: ['**/*.test.*', '**/__tests__/**', '**/*.spec.*']
      }
    },
    plugins: [versionPlugin(), tailwindcss()]
  },

});
