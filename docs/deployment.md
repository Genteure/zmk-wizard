# Deployment

How the site gets built and deployed, and how to operate the deployment.

## Architecture

The site is a single Cloudflare Worker named `shield-wizard` on account
configured by the `CLOUDFLARE_ACCOUNT_ID` secret (subdomain
`genteure.workers.dev`).

- **Framework**: Astro SSR with the `@astrojs/cloudflare` adapter (v14).
- **Runtime config**: everything lives in `wrangler.jsonc` (bindings, assets,
  preview URLs, required secrets, account ID). There is no Cloudflare dashboard
  build configuration — the repository is deployed from GitHub Actions.
- **Static assets**: `@astrojs/cloudflare` with the Workers static assets
  feature. The adapter builds the Worker bundle into `dist/server/` and the
  public site into `dist/client/`; the `ASSETS` binding serves the client.
- **KV**: `GIT_REPOS` (generated git repos, 24h TTL) and `SESSION` (Astro
  session driver binding, injected by the adapter).
- **Secrets**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `TURNSTILE_SECRET`, and `FEEDBACK_WEBHOOK_URL` (see [Secrets](#secrets)).
- **Custom domain**: `shield-wizard.genteure.com`. `src/middleware.ts`
  301-redirects the bare workers.dev host to it. Preview hosts
  (`<alias>-shield-wizard.genteure.workers.dev`) are not matched and pass
  through.

## Build → deploy config handoff

`pnpm build` runs `wrangler types && astro check && astro build`. The build:

1. Bundles the server into `dist/server/entry.mjs` and writes
   `dist/server/wrangler.json` — the **deploy configuration** (effective
   `wrangler.jsonc` with `main: entry.mjs` and `assets.directory: ../client`).
2. The Cloudflare Vite plugin writes `.wrangler/deploy/config.json` pointing at
   that file.

When `wrangler deploy` / `wrangler versions upload` run afterwards from the repo
root, wrangler detects `.wrangler/deploy/config.json` and uses the **redirected
configuration** (`dist/server/wrangler.json`) instead of `wrangler.jsonc`. You
will see:

```
Using redirected Wrangler configuration.
 - Configuration being used: "dist/server/wrangler.json"
```

Both files are regenerated on every build, so a fresh checkout works without
extra steps. Do not commit `dist/` or `.wrangler/` (both gitignored).

Because the deploy uses the redirected config, **config changes must be made in
`wrangler.jsonc`** — that is the single source of truth. New keys propagate to
`dist/server/wrangler.json` on the next build.

## GitHub Actions workflows

Two workflows replace the Cloudflare dashboard build entirely, and a shared
composite action does the heavy lifting:

- `.github/actions/deploy-worker/action.yml` — installs dependencies, builds
  the site, uploads a Worker **version** via `wrangler versions upload`
  (optionally with `--preview-alias`), and outputs the versioned preview URL
  and (when requested) the stable alias URL.
- `.github/workflows/deploy.yml` — production and same-repository PR/branch
  previews.
- `.github/workflows/preview-external-pr.yml` — external/fork-PR previews
  (persistent label or one-shot approval).

Local actions are referenced with the `$/` self-repository syntax, so they
resolve to the exact commit being run (no hardcoded versions, no extra
checkout). The `deploy-worker` action assumes the caller has already checked
out the code and does **not** run `actions/checkout` itself — this keeps the
caller's checked-out ref intact (important for fork PRs, which check out
`refs/pull/<n>/merge`). Composite actions cannot read the `secrets` context, so
the action receives `CLOUDFLARE_API_TOKEN` and `PUBLIC_TURNSTILE_SITEKEY` as
inputs; the workflows resolve them from `secrets`/`vars` at the call site.

Every deploy path runs `pnpm install --frozen-lockfile` + `pnpm build`, then
uses `cloudflare/wrangler-action` with the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. The
versioned preview URL comes from wrangler-action's `deployment-url` output
(parsed from wrangler's JSON output artifact); the alias URL is parsed from the
command output because wrangler-action exposes no alias-url output.

### Production

Triggered by pushes to `main` (or `workflow_dispatch`, which deploys the
selected branch):

```
pnpm build
wrangler deploy
```

`wrangler deploy` promotes the new version to 100% of production traffic.

### Branch previews

Triggered by pushes to non-`main` branches:

```
wrangler versions upload --preview-alias <sanitized-branch>-<branch-hash>
```

`versions upload` creates a Worker **version** without touching production
traffic. Every version gets a versioned preview URL; with `--preview-alias` it
also gets a stable aliased URL:

- Branches: `<sanitized-branch>-<branch-hash>-shield-wizard.genteure.workers.dev`

The workflow sanitizes the git branch name (lowercase, alphanumeric + dashes,
truncated to 40 chars; a `b-` prefix is added if the sanitized name would start
with a digit), then appends an 8-character hash of the original branch name.
This keeps the alias stable across pushes while distinguishing names that
sanitize to the same value.

### Same-repository pull request previews

Triggered by `pull_request` events (`opened`, `synchronize`, `reopened`).
**Same-repository PRs never need approval** — every update deploys a preview:

```
wrangler versions upload --preview-alias pr-<number>
```

and a sticky comment on the PR carries the preview URL. On later updates the
comment is updated; on failure the same comment is replaced with a failure
message and a link to the workflow run.

Fork PRs are **not** handled by this workflow: GitHub does not pass secrets to
`pull_request` workflows from forks. They are handled by
`preview-external-pr.yml`.

### External pull request previews (persistent label or one-shot approval)

`.github/workflows/preview-external-pr.yml` uses `pull_request_target` so it
runs with repository secrets, but it never checks out a fork-provided clone
URL — it always checks out the server-side `refs/pull/<n>/merge` ref.

There are exactly two ways an external PR gets a preview:

1. **Persistent approval — the `preview-approved` label.** This is intended for
   trusted contributors. While the label is present, every push deploys
   automatically with alias `pr-<number>` and comments the result. Removing the
   label stops future auto-deploys (it does not undeploy an existing preview).
2. **One-shot approval — check the "Approve preview" box in the PR comment.**
   This deploys exactly once for the current head SHA. New commits reset the
   approval comment to the unchecked state, so the preview goes stale and the
   maintainer must approve again to redeploy.

`opened`, `reopened`, `labeled`, and `synchronize` events on the label-less
external PR refresh the approval comment. The workflow file is always the base
branch's, and the deploy job is gated on the label or the explicit maintainer
comment, so external PR code is only built after approval.

### Concurrency

`deploy.yml` runs are keyed on the PR number (for `pull_request` events), the
branch name (for non-main pushes), or `production` (for `main` pushes), with
`cancel-in-progress: true`, so a stale build never clobbers a newer one and an
alias is never raced. A branch push and its PR deploy different aliases
(`<branch>-<branch-hash>` vs `pr-<n>`), so they deliberately do not share a
group.
`preview-external-pr.yml` keys its deploy job on the PR number too. The
approval-comment refresh job shares the same deploy concurrency group with
`cancel-in-progress: false`, so comment refreshes never cancel an in-flight
preview deploy and comment writes cannot race the one-shot deploy.

## GitHub configuration

### Repository secrets

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with `Workers Scripts: Edit`
  permission.
- `PUBLIC_TURNSTILE_SITEKEY` — the production Turnstile site key. It is inlined
  into the client bundle at build time. If you prefer to store it as a plain
  repository variable instead, set `PUBLIC_TURNSTILE_SITEKEY` under
  Settings → Secrets and variables → Actions → Variables; the workflows accept
  either the secret or the variable. If neither is configured, the workflows
  fall back to Cloudflare's always-pass test key (`1x00000000000000000000AA`),
  which is acceptable for local/dev but should not be used for production.

### Repository variables

There is currently one optional repository variable:

- `PUBLIC_TURNSTILE_SITEKEY` — the production Turnstile site key, if you prefer
  to store it as a repository variable rather than a secret. The workflows
  accept either the secret or the variable.

The toolchain needs no variables: pnpm and Node are set up with the same
`pnpm/setup` step the rest of the repo's CI uses (pnpm comes from
`package.json`'s `packageManager` field, `11.20.0`; Node from
`devEngines.runtime`, `24.18.0`), and `CXXFLAGS` is pinned to `-std=c++20`
directly in the workflows and the shared `deploy-worker` action.

### Worker secrets (set once, not needed in GitHub Actions)

Runtime secrets live on the Worker and survive all redeploys:

```bash
wrangler secret put TURNSTILE_SECRET
wrangler secret put FEEDBACK_WEBHOOK_URL
```

`FEEDBACK_WEBHOOK_URL` and `TURNSTILE_SECRET` are **not** GitHub Actions
secrets; they are read from the Worker at runtime. Do not add them to GitHub
unless you have a separate workflow that needs them.

## Config keys (`wrangler.jsonc`)

| Key | Why it's there |
| --- | -------------- |
| `workers_dev` / `preview_urls` | **Preview URLs default to off in wrangler ≥ 4.34**. Without `preview_urls: true`, `versions upload` produces no preview URLs. Keep both explicitly `true`. |
| `assets.binding` / `assets.directory` | Static assets; `directory` is rewritten to `../client` in the deploy config. |
| `secrets.required` | Declares `TURNSTILE_SECRET` / `FEEDBACK_WEBHOOK_URL`; makes `wrangler types` surface them and enables local dev validation. Values are never stored here. |
| `compatibility_date` | Currently `2026-06-08` — the date this repository's pinned wrangler supports. Raise it together with a wrangler upgrade if needed. |
| `observability.enabled` | Structured logs in the Workers dashboard. |

## Operations

```bash
# Manual production deploy (from a clean tree; set CLOUDFLARE_ACCOUNT_ID in the environment)
pnpm install --frozen-lockfile && pnpm build
wrangler deploy

# Validate without deploying
wrangler deploy --dry-run

# Roll back to a previous version
wrangler versions list
wrangler rollback                  # previous version
wrangler rollback <VERSION_ID>     # specific version

# Promote a preview version to production manually
wrangler versions deploy           # interactive; pick the version

# Live logs
wrangler tail
```

### Leaving Workers Builds / Pages behind

If the repository was previously connected to a Cloudflare dashboard build
(Workers Builds or Pages), disconnect it under Worker → Settings → Builds so
only GitHub Actions deploys. A leftover connection double-deploys and races the
preview alias.

### Cleanup

- `GITHUB_CLIENT_SECRET` is a leftover secret on the Worker (no code or config
  references it). Remove with `wrangler secret delete GITHUB_CLIENT_SECRET`.
- `wrangler deploy` deletes plaintext `vars` not present in the config
  (currently none). Secrets are never deleted by deployments.

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `versions upload` prints no preview URLs | `preview_urls` missing/`false` in `wrangler.jsonc`, or the Worker's workers.dev subdomain disabled. Check `wrangler.jsonc` and the Worker's subdomain settings. |
| `wrangler deploy` says `No account id found` | `CLOUDFLARE_ACCOUNT_ID` is missing from the environment or GitHub Actions secrets. |
| Build fails with `ERR_RUNTIME_FAILURE: requires compatibility date ... newest date supported is ...` | `compatibility_date` exceeds the local miniflare/workerd cap. Lower it or upgrade wrangler. |
| External PR does not deploy | The `preview-approved` label is missing; add the label (persistent) or check the "Approve preview" box in the PR comment (one-shot). |
| PR comment is not updated | Make sure the workflow has `pull-requests: write` permission and the `upsert-comment` action finds the existing marker comment. |
