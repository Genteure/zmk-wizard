# Shield Wizard for ZMK

## Overview

- Purpose: a Vue + Astro web app that generates a ZMK keyboard user config git repository (packed as a tar.gz) and stores it in a Cloudflare Workers KV binding for later download.

- About ZMK: ZMK Firmware is a modern, open source keyboard firmware powered by Zephyr RTOS.

- About Shield: In Zephyr terminology, a "shield" is a hardware board that connects to a main controller board to provide additional keys, encoders, or other input devices. In simple terms, a shield is basically the keyboard without the main controller.

- Intended audience: Users who want to create custom keyboard layouts and configurations for ZMK-powered keyboards without manually writing configuration files.

- High-level architecture (what to read first):
  - `src/types/` — schema and type definitions: `keyboard.ts` (keyboard model: Keyboard, Key, KeyboardPart, KscanDriver, PinUsage, Encoder, etc), `devices.ts` (I2C/SPI bus devices), `geometry.ts`, `git.ts`, `pinContext.ts`, `tools.ts`, `utils.ts` (ULID validation), and `index.ts`.
  - `src/components/app.vue` — shell layout: UHeader + UMain split between Editors and Graphics panels.
  - `src/components/editor/` — tabbed editors: `layout.vue`, `keyboard.vue`, `part.vue`.
  - `src/components/graphic/` — physical/keymap layout visualization (WIP).
  - `src/components/utils/KeyboardNameDialog.vue` — initial modal for keyboard name, shield name, split config.
  - `src/_entrypoint.ts` — Vue app bootstrap: registers Nuxt UI plugin, Pinia, Fluent i18n.
  - `src/pages/index.astro` — Astro entry page; mounts `<Main client:only='vue'>`.

- For frontend/UI libraries:
  - Vue 3: https://vuejs.org/ — we use `<script setup>` SFCs.
  - Nuxt UI v4: https://ui.nuxt.com/ — used standalone (without Nuxt). Provides UApp, UHeader, UTable, UModal, UButton, USelect, etc. See component docs for props/slots. Raw markdown and MCP is available, prefer those instead of fetching HTML from the docs site.
  - TailwindCSS v4: https://tailwindcss.com/
  - Pinia: https://pinia.vuejs.org/ — state management via `defineStore`.
  - Fluent (fluent-vue): https://fluent-vue.demivan.me/ — i18n; locale bundles in `src/components/locales.ts`, inline `<ftl>` blocks in SFCs.

## Development notes

### Tools and commands

- Use `pnpm` for package management. Never use `npm` or `yarn` commands in this repo.
- For global npm tools, DO NOT USE `npx`. Use `pnpm dlx` instead. For local tools use `pnpm <tool>` (e.g. `pnpm vitest`).
- Dev server: `pnpm dev`; Build: `pnpm build`
- Syntax validation: `pnpm check`. Do NOT use `tsc` or other tsc-like commands directly, as they may not use the correct config or paths.
- Tests: `pnpm test` (vitest), add `--reporter=agent` for LLM-friendly test results; `pnpm test:e2e` (playwright).
- Layout generation: `pnpm layouts <path-to-zmk>` (invokes `scripts/updatePhysicalLayouts.ts`)

### Vue reactivity

- Vue 3 uses a proxy-based reactivity system. State is managed with `ref()`, `reactive()`, and `computed()`.
- Use `<script setup>` for all components — it is the standard syntax. TypeScript is expected (`<script setup lang="ts">`).
- Prefer composables (functions starting with `use*`) for reusable logic. Pinia stores are the primary way to share state across components.
- Do NOT use Options API. All components use Composition API with `<script setup>`.

### Styling

- The default sizing should never be `xs`, they're way way way too small. At very minimum, use `sm` for badges, buttons, and form controls. `md` should be the default for most things.
