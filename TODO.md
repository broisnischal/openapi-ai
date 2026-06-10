# openapi-agent — Remaining Work

Status as of 2026-06-10. Everything below is ordered: fix → verify → ship → document → later.

---

## 1. Immediate fixes (blocks compilation)

- [x] **Remove unused import** — `DEFAULT_WS_AUTH` mentioned in TODO was already
  absent; `DEFAULT_WORKSPACE_ID` is the actual import and is used 11 times. No fix needed.
- [x] **Missing npm package files** — `packages/cli/README.md` and `packages/cli/LICENSE`
  created.

## 2. Verification (code is written, never exercised)

Run the CLI on a test port (`bun cli.ts start --port 3395`) and check:

- [ ] **Typecheck both packages**
  `cd packages/cli && bun run typecheck` ·
  `cd packages/studio && bunx tsc --noEmit`
  (one pre-existing unrelated error in `__root.tsx(6,22)` can be ignored).
- [ ] **Studio compiles in dev** — throwaway `vite dev --port 3998`, request
  `src/routes/explorer.tsx`, `src/lib/workspace.ts`, `src/lib/env.ts`,
  `src/routes/environments.tsx`, `src/lib/storage.ts` and expect HTTP 200 each.
- [ ] **Inline auth on the explorer endpoint** (`POST /api/explorer/request`):
  - `{"auth": {"type": "bearer", "token": "x"}}` → upstream receives the header
    (test against https://httpbingo.org/headers).
  - `{"auth": {"type": "oauth2_cc", "tokenUrl": ...}}` → token fetched server-side
    (a fake tokenUrl should degrade gracefully: request goes out without a token).
  - `{"authProfile": "none"}` → CLI active auth is bypassed.
  - No auth field at all → CLI active auth still applies (back-compat).
- [ ] **Per-config OAuth token cache** (`packages/cli/src/auth/engine.ts`):
  two different inline `oauth2_cc` configs must not share a cached token.
- [ ] **Workspaces in the studio** (manual, in browser):
  - Create a second workspace; tabs filter per workspace; switcher works.
  - Workspace settings modal: default auth, default headers, default env save.
  - Header precedence: environment headers < workspace headers < request headers.
  - Per-request env override (`Env:` select in the tab bar) including "none".
  - Auth tab "Inherit from workspace" shows the resolved workspace auth.
  - Old saved tabs migrate (legacy auth type `none` → `inherit`; IndexedDB
    upgrades v2 → v3 without losing environments/cookies/tabs).
- [ ] **Self-update plumbing**: `bun cli.ts update` (expect "Could not reach…"
  or "Already up to date" until the package is published), `--version`, and the
  startup update notice (throttle file `~/.openapi-agent/update-check.json`).
- [ ] Mark session tasks #3, #4, #5 as completed once the above passes.

## 3. Shipping / publishing pipeline

- [ ] **Publish to npm** (makes `npm i -g openapi-agent` and `bun add -g` work,
  and activates the self-updater, which reads
  `registry.npmjs.org/openapi-agent/latest`):
  ```bash
  cd packages/cli
  bun run build          # dist/cli.js with #!/usr/bin/env bun shebang
  npm publish            # or: bun publish
  ```
  Requires the `openapi-agent` name to be available on npm under your account.
- [ ] **Standalone binaries** (no Bun required on the target machine):
  ```bash
  cd packages/cli
  bun run build:bin      # dist/bin/openapi-agent-{linux,darwin}-{x64,arm64}, windows-x64.exe
  ```
  Create a GitHub release tagged `v<version>` and upload the binaries with those
  exact filenames — the self-updater downloads
  `github.com/broisnischal/openapi-agent/releases/download/v<ver>/openapi-agent-<os>-<arch>`.
- [ ] **(Recommended) GitHub Actions release workflow** — on tag push:
  build dist + binaries, `npm publish`, create the release, attach assets.
  Keeps npm version, git tag, and binary assets in lockstep (the updater
  assumes they match).
- [ ] **(Optional) curl installer** — `install.sh` that detects OS/arch and
  drops the right binary into `~/.local/bin`.

## 4. Documentation (README)

- [ ] **Install section**: `npm i -g openapi-agent`, `bun add -g openapi-agent`,
  and the standalone-binary download path.
- [ ] **Update section**: `openapi-agent update`, the `/update` slash command,
  daily auto-check, `OPENAPI_AGENT_AUTO_UPDATE=1` (background install),
  `OPENAPI_AGENT_NO_UPDATE_CHECK=1` (disable), `OPENAPI_AGENT_DATA_DIR` override.
- [ ] **Workspaces & environments section**: workspace default auth/headers/env,
  per-environment default headers, per-request env override, and the auth
  inheritance chain — request → workspace → CLI active auth.
- [ ] **Auth reference table**: inherit · CLI active · none · bearer · basic ·
  API key (header/query/cookie) · OAuth2 client-credentials · OIDC · custom
  headers · saved profile (role) — and which are signed server-side by the CLI.
- [ ] Copy the relevant parts into `packages/cli/README.md` for the npm page.

## 5. Spec history / saved specs (done)

- [x] `spec_history` table added to `packages/cli/src/db/schema.ts`
- [x] `dbQueries.upsertSpec()`, `getSpecHistory()`, `getLastSpec()`, `deleteSpec()` added
- [x] `start.ts` saves spec to history on successful load
- [x] `start.ts` auto-resumes last spec when no `--url` given (skips in daemon mode)
- [x] `wasper ls` — lists saved specs with number, URL, title, endpoint count, last used
- [x] `wasper use <number|url>` — starts server with a saved spec
- [x] `wasper rm <number|url>` — removes a spec from history

## 6. Known gaps / future work (not started, by design)

- [ ] Feature toggles (`/mcp off`, `/readonly on`…) are runtime-only — persist
  to the DB if they should survive restarts.
- [ ] OAuth2 **authorization-code** flow (browser redirect) — only
  client-credentials and OIDC discovery exist today. Postman-parity needs it.
- [ ] Digest auth and AWS SigV4 are not implemented in the auth engine.
- [ ] Saved request **collections** (named, nested folders) — tabs persist, but
  there is no collection tree per workspace yet.
- [ ] Studio settings UI for the feature toggles (`GET/PUT /api/features`
  already exists server-side).
- [ ] Workspace import/export (Postman collection / Insomnia format).
- [ ] Response-size guard in the explorer endpoint (a multi-hundred-MB upstream
  body is buffered fully in memory today).
