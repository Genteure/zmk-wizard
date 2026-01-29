# Shield Wizard for ZMK

## Overview

- Purpose: a Solid + Astro web app that generates a ZMK keyboard user config git repository (packed as a tar.gz) and stores it in a Cloudflare Workers KV binding for later download.

- About ZMK: ZMK Firmware is a modern, open source keyboard firmware powered by Zephyr RTOS.

- About Shield: In Zephyr terminology, a "shield" is a hardware board that connects to a main controller board to provide additional keys, encoders, or other input devices. In simple terms, a shield is basically the keyboard without the main controller.

- Intended audience: Users who want to create custom keyboard layouts and configurations for ZMK-powered keyboards without manually writing configuration files.

- High-level architecture (what to read first):

  - `src/typedef.ts` — shared types/interfaces for keyboard model.
  - `src/components/context.ts` — SolidJS context provider for UI state management.
  - `src/components/*` — UI built with SolidJS components (entry point: `src/components/main.tsx`).
  - `src/pages/*.astro` — Astro pages; `src/pages/index.astro` mounts the client `Main` component.
  - `src/actions/index.ts` — server-side Astro Actions; `buildRepository` validates captcha, creates ZMK files, packages a git repo and writes a tar.gz to KV via `getRepoKV`.
  - `src/lib/gitrepo.ts` — builds a virtual git repo (objects, commit, tree) in-memory and returns a map of paths→Uint8Array. Key: `createGitRepository(files)`.
  - `src/lib/templating/*` — creates ZMK config files from the keyboard model (see `src/lib/templating/index.ts`).
  - `src/lib/kv.ts` and `wrangler.jsonc` — Cloudflare Workers KV integration (`GIT_REPOS` binding). Actions use `getRepoKV(locals)` to get getData/setData wrappers.
  - `scripts/updatePhysicalLayouts.ts` → generates `src/lib/physicalLayouts.json` from a local ZMK repo; invoked via `pnpm layouts <path-to-zmk>`.

- Important workflows / commands:

  - Install: `pnpm i` (this repo uses pnpm)
  - Dev server: `pnpm dev`
  - Build: `pnpm build`
  - Astro static checks: `pnpm astro check` (for Astro/TypeScript issues)
  - Tests (non-interactive, node, for `lib`): `pnpm test run`
  - Tests (non-interactive, playwright, for UI components): `pnpm test e2e --reporter=line`

- For frontend/UI libraries:
  - SolidJS: https://www.solidjs.com/, NOT React. The syntax is similar but there are important differences. We are NOT using React. All JSX/TSX files are Solid components.
  - TailwindCSS: https://tailwindcss.com/
  - daisyUI: https://daisyui.com/ (TailwindCSS component library, for styles). See https://daisyui.com/components/
  - Kobalte: https://kobalte.dev/ (SolidJS component library, unstyled). Commonly used components are:
    - Dialog: https://kobalte.dev/docs/core/components/dialog
    - Popover: https://kobalte.dev/docs/core/components/popover

## Development notes

### Solid.js reactivity

- SolidJS uses fine-grained reactivity based on signals. Unlike React, components do not re-render when state changes; instead, only the parts of the DOM that depend on changed signals are updated.
- SolidJS uses JSX syntax similar to React, but with key differences in how state and effects are managed. Make sure we are not using React patterns.
- State management is typically done using `createSignal`, `createEffect`, and `createMemo` from `solid-js`.
- Signals are created with `createSignal(initialValue)`, which returns a getter and setter function. Always evoke the getter function to access the value. Do not destructure signals. Do not access signals prematurely outside of reactive contexts.
- Do not destructure props in SolidJS components, as this breaks reactivity. Always access props directly via `props.propName`.
- Use `createMemo` for derived/computed values that depend on other signals. Simple multi-stage data access can be done without `createMemo`, for example: `const value = () => props.obj().nested.value`.
- Use `createEffect` for side effects that should run when signals change. Avoid putting non-side-effect code inside `createEffect`.
- Use SolidJS built-in control flow components like `<For>`, `<Show>`, and `<Switch>` for conditional rendering and lists, instead of JavaScript control flow.
- Do not destructure stores created with `createStore`. Always access store properties directly via `store.propName` to maintain reactivity.
- Use `mergeProps` from `solid-js` to provide default prop values in components. Use `splitProps` to separate props into local and passthrough groups when needed.
- There's no `useCallback` in SolidJS.
