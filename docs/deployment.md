# Deployment

How the site gets built and deployed, and how to operate the deployment. This
also covers the **Edit Existing Repository** flow, which uses a GitHub App and
stateless encrypted sessions.

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
- **KV**: `GIT_REPOS` (generated git repos, 24h TTL). The GitHub App flow is
  intentionally stateless: the user token is encrypted into an HttpOnly cookie
  with `GITHUB_SESSION_SECRET`, so no KV/D1 session store is required.
- **Secrets**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `TURNSTILE_SECRET`, and `FEEDBACK_WEBHOOK_URL`, plus the GitHub App secrets
  `GITHUB_CLIENT_SECRET` and `GITHUB_SESSION_SECRET` (see
  [GitHub App: Edit Existing Repository](#github-app-edit-existing-repository)).
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

## GitHub App: Edit Existing Repository

The **Edit Existing Repository** feature (issue #20) lets users sign in with
GitHub, install the Shield Wizard GitHub App, and save generated keyboard files
directly back to a repository. The server never stores GitHub tokens: the user
token is encrypted into an HttpOnly cookie with `GITHUB_SESSION_SECRET`, so no
KV/D1 session store is required.

### 1. Create the GitHub App

1. Open <https://github.com/settings/apps/new>.
2. Fill in:

   | Field | Value |
   | --- | --- |
   | GitHub App name | `Shield Wizard` (the slug below must match its URL) |
   | Homepage URL | `https://shield-wizard.genteure.com/` |
   | Callback URL | `https://shield-wizard.genteure.com/` (exact, trailing slash included) |
   | Webhook → Active | **unchecked** |
   | Expire user authorization tokens | keep the default (8 hours), or uncheck only if you accept long-lived sessions |

   For local development also add a second callback URL:

   ```text
   http://localhost:4321/
   ```

   > GitHub matches the callback URL exactly. If you test on a
   > `*.workers.dev` preview host you must register that exact origin as an
   > additional callback URL.

3. Under **Repository permissions**:

   | Permission | Access | Why |
   | --- | --- | --- |
   | Contents | Read and write | read `.shield-wizard.json`, write generated files, delete stale generated files |
   | Workflows | Read and write | update `.github/workflows/build.yml` |
   | Metadata | Read-only | always granted automatically |

4. Under **Where can this GitHub App be installed?**, choose
   **Any account** so end users can install it.
5. Click **Create GitHub App**.
6. Copy the **Client ID** (`Iv1...`) — not the numeric App ID.
7. Scroll to **Client secrets** and **Generate a new client secret**.
   Copy it immediately; GitHub shows it only once.
8. The **slug** is in the app's public URL
   `https://github.com/apps/<slug>`.

### 2. Configure environment

All four values are required for the edit feature. If they are missing the
UI shows “GitHub integration is not configured” while new-shield/ZIP export
keep working.

| Variable | Kind | Where | Description |
| --- | --- | --- | --- |
| `PUBLIC_GITHUB_CLIENT_ID` | plain | **build environment** | GitHub App **Client ID** |
| `PUBLIC_GITHUB_APP_SLUG` | plain | **build environment** | slug from `github.com/apps/<slug>` |
| `GITHUB_CLIENT_SECRET` | **secret** | `wrangler secret` | app client secret |
| `GITHUB_SESSION_SECRET` | **secret** | `wrangler secret` | 32+ random bytes; encrypts the session cookie and signs OAuth state |

`PUBLIC_*` values are handled by Astro's env system and are **inlined at
build time** (this is standard Astro behavior for public variables). Provide
them where the build runs: a `.env.production` file, CI variables, or the
deploy pipeline's build environment. Setting them only in the Cloudflare
dashboard *after* the worker is built has no effect.

The two secret values are read at request time through `astro:env/server`,
so they belong in Cloudflare secrets.

#### Cloudflare Workers

```bash
# Provide public values to the build, then build & deploy.
PUBLIC_GITHUB_CLIENT_ID=Iv1... \
PUBLIC_GITHUB_APP_SLUG=shield-wizard \
pnpm build

wrangler deploy
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_SESSION_SECRET
```

For repeatable CI deploys, put the two `PUBLIC_*` values in
`.env.production` (gitignored) or in the CI secret/variable store and export
them before `pnpm build`.

Generate a session secret with:

```bash
openssl rand -base64 32
```

#### Local development

Copy `.env.example` to `.env` and fill the GitHub block. Astro reads it
automatically. For a real OAuth round trip, register
`http://localhost:4321/` as a callback URL on the app.

### 3. How the flow works

#### Startup routing

The app is a single page on `/`. `src/components/main.vue` parses the query
string once and then strips the workflow parameters from the address bar:

| URL | Result |
| --- | --- |
| `/` | launcher: choose **New Shield** or **Edit Existing Repository** |
| `/?action=new` | open a fresh editor for a new shield |
| `/?action=edit` | GitHub flow: sign in → install app → choose repo → editor |
| `/?action=edit&repo=owner/name` | same, but tries to open that repo directly |
| `/?code=...&state=...` | GitHub OAuth callback; server exchanges code and sets the session cookie |
| `/?setup_action=install&state=...` | GitHub App installation callback; continue to repo selection |
| `/?action=new&tab=keyboard` | open the editor on a specific tab |

There is exactly one active flow per tab. The workflow and editor state are
Pinia stores (per-tab, never `localStorage`), so opening several tabs does
not make the tabs fight over which repo is being edited. The session cookie
is intentionally shared: it is the login, not the UI state.

#### Authentication

1. Client calls the `githubBeginAuth` action. The server signs a random
   `state` with HMAC-SHA-256 and returns the GitHub authorize URL.
2. GitHub redirects back to `/` with `code` and `state`.
3. `githubCompleteAuth` verifies the state, POSTs the code to
   `https://github.com/login/oauth/access_token` (GitHub App acting as an
   OAuth app — user-to-server token), and encrypts the token into the
   `shield_wizard_github` cookie:
   - HttpOnly, SameSite=Lax, Secure in production, path `/`
   - payload `{ v, accessToken, expiresAt }`, AES-GCM encrypted with a key
     derived from `GITHUB_SESSION_SECRET`
   - max age 8 hours, matching the default GitHub user-token lifetime
4. If the user has no app installations, the UI sends them to
   `https://github.com/apps/<slug>/installations/new?state=...`. GitHub
   redirects back with `setup_action=install` and the UI refreshes the
   session and shows repository selection.

#### Save

The browser never submits file contents. `githubCommitChanges`:

1. validates the full keyboard state server-side with
   `ValidatedKeyboardSchema`;
2. reads the current `.shield-wizard.json` and refuses shield renames;
3. regenerates every file with `createZMKConfig`;
4. computes the current branch HEAD and tree, filters preserved paths, and
   commits atomically with the GraphQL
   [`createCommitOnBranch`](https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch)
   mutation.

Preserved (never overwritten/deleted): `config/**`. Generated files that
users commonly customize (`README.md`, `build.yaml`,
`.github/workflows/build.yml`) are compared server-side against the baseline
Shield Wizard would generate for the stored keyboard: modified copies are
kept, untouched copies are refreshed. Wizard-owned files (board/shield
overlays, `.github/shield-wizard-layout.svg`, `.shield-wizard.json`) are
replaced by fresh server output, and stale generated files are deleted. The
commit goes directly to the repository's default branch; a PR would make
“edit and build” slower for this use case, but the commit is a normal GitHub
commit users can revert.

### 4. GitHub CLI smoke checks

After deploying, verify the integration pieces:

```bash
# The public client id is served to the browser as part of the app.
curl -s https://shield-wizard.genteure.com/ | grep -o 'Iv1\.[A-Za-z0-9]*' | head -1

# With a real browser session you can also confirm the cookie is HttpOnly:
# devtools → Application → Cookies → shield_wizard_github → HttpOnly ✓
```

In the app:

1. Sign in with GitHub (`?action=edit`).
2. Install the app on a repository generated by Shield Wizard.
3. Select the repo; the editor must open with the stored configuration.
4. Change the display name or a key position, then **Save Changes to
   GitHub**.
5. Confirm the new commit exists, `config/` is untouched, and any
   user-modified `README.md` / `build.yaml` / workflow file was preserved.

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

When the GitHub App edit feature is enabled in CI, the two `PUBLIC_GITHUB_*`
values must also be available to the build step. The current workflows pass
only `PUBLIC_TURNSTILE_SITEKEY` through `deploy-worker`; add
`PUBLIC_GITHUB_CLIENT_ID` and `PUBLIC_GITHUB_APP_SLUG` as workflow
secrets/variables and export them before `pnpm build` (or supply them through a
gitignored `.env.production`).

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
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `PUBLIC_TURNSTILE_SITEKEY` — the production Turnstile site key. It is inlined
  into the client bundle at build time. If you prefer to store it as a plain
  repository variable instead, set `PUBLIC_TURNSTILE_SITEKEY` under
  Settings → Secrets and variables → Actions → Variables; the workflows accept
  either the secret or the variable. If neither is configured, the workflows
  fall back to Cloudflare's always-pass test key (`1x00000000000000000000AA`),
  which is acceptable for local/dev but should not be used for production.
- `PUBLIC_GITHUB_CLIENT_ID` / `PUBLIC_GITHUB_APP_SLUG` — needed in the build
  environment when the GitHub App edit feature is enabled. They can be stored
  as GitHub Actions variables or in a gitignored `.env.production`.
- `GITHUB_CLIENT_SECRET` / `GITHUB_SESSION_SECRET` — GitHub App runtime
  secrets. They are **not** GitHub Actions secrets; they are set as Worker
  secrets with `wrangler secret put`.

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
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_SESSION_SECRET
```

`FEEDBACK_WEBHOOK_URL`, `TURNSTILE_SECRET`, `GITHUB_CLIENT_SECRET`, and
`GITHUB_SESSION_SECRET` are **not** GitHub Actions secrets; they are read from
the Worker at runtime. Do not add them to GitHub unless you have a separate
workflow that needs them.

## Config keys (`wrangler.jsonc`)

| Key | Why it's there |
| --- | -------------- |
| `workers_dev` / `preview_urls` | **Preview URLs default to off in wrangler ≥ 4.34**. Without `preview_urls: true`, `versions upload` produces no preview URLs. Keep both explicitly `true`. |
| `assets.binding` / `assets.directory` | Static assets; `directory` is rewritten to `../client` in the deploy config. |
| `secrets.required` | Declares `TURNSTILE_SECRET` / `FEEDBACK_WEBHOOK_URL`; makes `wrangler types` surface them and enables local dev validation. Values are never stored here. GitHub App secrets are optional and are read through `astro:env/server` instead. |
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

For GitHub App edits, first set the Worker secrets:

```bash
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_SESSION_SECRET
```

### Leaving Workers Builds / Pages behind

If the repository was previously connected to a Cloudflare dashboard build
(Workers Builds or Pages), disconnect it under Worker → Settings → Builds so
only GitHub Actions deploys. A leftover connection double-deploys and races the
preview alias.

### Cleanup

- Keep `GITHUB_CLIENT_SECRET` and `GITHUB_SESSION_SECRET` on the Worker for the
  Edit Existing Repository feature. Removing them disables GitHub edits and
  causes existing OAuth cookies to become invalid.
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
| “GitHub integration is not configured” | One of the four GitHub App values is missing. Public variables must be deployed as `vars`/build-time env; secrets as `wrangler secret put`, never plain `vars`. |
| Callback mismatch / `redirect_uri` error | The app callback URL list must contain the exact `origin + "/"` used at login time. |
| “App installation link unavailable” | `PUBLIC_GITHUB_APP_SLUG` is empty or does not match the app URL. |
| Session expires immediately / 401 on save | The token is over 8 hours old or `GITHUB_SESSION_SECRET` was rotated; sign in again. |
| Rate limit | Repository listing checks `.shield-wizard.json` with bounded concurrency, but a page of repos still uses API calls. If GitHub returns 403, wait a few minutes. |
| Shield rename rejected | Intentional. Renaming changes every generated path and would strand the preserved `config/` files; start a new shield instead. |

## References

- [GitHub App user-to-server tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Building a login with GitHub button with a GitHub App](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app)
- [GitHub REST API](https://docs.github.com/en/rest)
- [GitHub GraphQL API](https://docs.github.com/en/graphql)
