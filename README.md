# wasper

Host an MCP server + API proxy from any OpenAPI spec. Like Drizzle Studio, but for APIs.

## Installing

### Package manager (needs Bun or Node)

```bash
bun add -g openapi-agent     # or: npm install -g openapi-agent
openapi-agent --url https://petstore3.swagger.io/api/v3/openapi.json
```

### Compiled binaries (no runtime needed)

Standalone executables are attached to each GitHub release (tag `v<version>`)
as `openapi-agent-<os>-<arch>` — e.g. `openapi-agent-linux-x64`,
`openapi-agent-darwin-arm64`, `openapi-agent-windows-x64.exe`:

```bash
curl -fsSL -o openapi-agent \
  https://github.com/broisnischal/openapi-agent/releases/latest/download/openapi-agent-linux-x64
chmod +x openapi-agent && ./openapi-agent --url <spec-url>
```

To build the binaries yourself, run `bun run build:bin` in `packages/cli`
(`--current` builds only the host platform). Outputs land in `dist/bin/`;
upload them as release assets on tag `v<version>` — the self-updater
downloads them from `releases/download/v<version>/openapi-agent-<os>-<arch>`.

Publishing to npm: `bun publish` from `packages/cli` (the `prepublishOnly`
hook builds `dist/` automatically).

## Updating

```bash
openapi-agent update        # or press / and type `update` in a running server
```

The updater detects how it was installed: package installs re-run
`bun add -g` / `npm install -g`, compiled binaries download the matching
release asset and swap themselves in place (restart running servers to pick
it up).

`wasper start` also checks npm for a newer version at most once a day
(non-blocking) and prints a notice when one exists. Two env vars control it:

| Env var | Effect |
| --- | --- |
| `OPENAPI_AGENT_AUTO_UPDATE=1` | Install the update automatically when the startup check finds one |
| `OPENAPI_AGENT_NO_UPDATE_CHECK=1` | Disable the startup check entirely |

## Studio: workspaces, environments & auth

The explorer organizes requests into **workspaces** (Postman-style). Each
workspace carries shared defaults that every request in it can use:

- **Default auth** — bearer, basic, API key, OAuth2 client credentials, OIDC,
  custom headers, a saved CLI auth profile, or the CLI's active auth.
- **Default headers** — merged under each request's own headers (the request
  always wins on conflict).
- **Default environment** — which variable set (`{{var}}` substitution) the
  workspace uses; leave it empty to follow the globally active environment.

**Environments** hold `{{key}}` variables plus optional **default headers**
applied to every request sent with that environment. A request tab can
override which environment it uses: inherit the workspace's, pick a specific
one, or `none` to disable substitution for that request.

**Auth inheritance** resolves per request through a chain:

```
request auth → workspace default auth → CLI active auth
```

A request set to *Inherit from workspace* uses the workspace's default; a
workspace set to *CLI* defers to whatever auth is active on the server
(switchable with `/auth use <role>` or from the studio). Any request can
still pin its own inline auth or a saved profile, or send unauthenticated
with auth type *none* — handy for testing public endpoints while the rest of
the workspace stays signed.

## Development

```bash
bun install
bun run dev          # in packages/cli — hot-reloading server
bun run dev          # in packages/studio — vite dev server
```

## Self-hosting the CLI

The CLI server can run anywhere — a VPS, a homelab box, a container — and be
reached at a custom URL. The studio connects to it dynamically.

### Flags / environment variables

| Flag | Env var | Purpose |
| --- | --- | --- |
| `--url` | `OPENAPI_AGENT_SPEC_URL` | OpenAPI spec to load on boot |
| `--port` | `OPENAPI_AGENT_PORT` | Listen port (default `3388`) |
| `--host` | `OPENAPI_AGENT_HOST` | Bind address (default `0.0.0.0`; use `127.0.0.1` to stay local-only) |
| `--origin` | `OPENAPI_AGENT_ORIGIN` | Public URL the server is reachable at, e.g. `https://agent.example.com` |
| `--token` | `OPENAPI_AGENT_TOKEN` | Require this bearer token on every request — **strongly recommended** for public servers |

```bash
wasper start \
  --url https://petstore3.swagger.io/api/v3/openapi.json \
  --origin https://agent.example.com \
  --token "$(openssl rand -hex 24)" \
  --background
```

### Runtime controls (slash commands)

In foreground mode, press `/` and type a command — no restart needed:

| Command | Effect |
| --- | --- |
| `/mcp on\|off`, `/proxy on\|off`, `/ai on\|off` | Toggle endpoints live (also `--no-mcp` / `--no-proxy` / `--no-ai` flags, or `PUT /api/features`) |
| `/readonly on\|off` | Guardrail: block every non-GET upstream request (MCP, proxy, explorer, AI tools). Also `--readonly` |
| `/auth` · `/auth use <role>` · `/auth none` | List / switch the active auth role |
| `/token new\|off\|<value>` | Rotate, remove, or set the access token live |
| `/spec <url>` | Load a different OpenAPI spec |
| `/tail on\|off` | Live request log in the terminal |
| `/status` · `/reload` · `/open` · `/help` · `/quit` | The usual |

### Auth roles for AI agents

Save multiple auth profiles (roles) — e.g. `admin`, `readonly-bot` — in the
studio. Every MCP agent learns them on connect (the `initialize` response
lists each role and how to use it), and can either:

- pass `authProfile: "<role>"` to `execute_api_request` — per-request, so
  concurrent agents can act as different roles without interfering, or
- call `set_active_auth` to switch the global default.

Combine with `/readonly on` to let agents explore an API safely.

### Connecting the studio to a remote server

Open the studio with the server passed in the URL — it persists to
localStorage and the params are stripped from the address bar:

```
https://studio.example.com/?server=https://agent.example.com&token=<secret>
```

You can also set it manually from the connect screen (URL + optional token).

All authenticated clients work the same way:

```bash
curl -H "Authorization: Bearer <secret>" https://agent.example.com/api/status
# WebSocket log stream and plain browser links accept ?token=<secret>
```

### Docker

```bash
cd packages/cli
docker build -t openapi-agent .
docker run -d --name openapi-agent \
  -p 3388:3388 \
  -v openapi-agent-data:/app/data \
  -e OPENAPI_AGENT_SPEC_URL=https://petstore3.swagger.io/api/v3/openapi.json \
  -e OPENAPI_AGENT_ORIGIN=https://agent.example.com \
  -e OPENAPI_AGENT_TOKEN=change-me \
  openapi-agent
```

### Reverse proxy (custom domain)

Any TLS-terminating proxy works — the landing page and proxy URLs follow
whatever host the server is reached through. Caddy example:

```
agent.example.com {
    reverse_proxy localhost:3388
}
```

WebSockets (`/logs`) are proxied automatically by Caddy; for nginx add the
usual `Upgrade`/`Connection` headers.
