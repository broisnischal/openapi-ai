# OpenAPI Agent — Project Context

> **Keep this file updated.** This is the single source of truth for the monorepo architecture, commands, and conventions.

## TanStack CLI Command Used

```sh
npx @tanstack/cli@latest create studio \
  --framework React \
  --deployment cloudflare \
  --no-examples \
  --no-git \
  --non-interactive \
  --package-manager npm \
  --no-toolchain \
  --intent \
  --target-dir packages/studio
```

Run from: `/home/nees/openapi-agent`

## TanStack Intent Commands

```sh
# After scaffolding (already run):
npx @tanstack/intent@latest install   # Wires skill mappings into AGENTS.md
npx @tanstack/intent@latest list      # Lists available skills
```

Intent skills are stored in `packages/studio/AGENTS.md`.
When working on routing, SSR, auth, or deployment — load the relevant skill first:
```sh
npx @tanstack/intent@latest load @tanstack/router-core#router-core/data-loading
```

---

## Monorepo Structure

```
openapi-agent/                  ← monorepo root (npm workspaces)
├── packages/
│   ├── cli/                    ← Bun MCP + API proxy server (npm package)
│   │   ├── src/
│   │   │   ├── db/             ← SQLite schema + query helpers (bun:sqlite)
│   │   │   ├── openapi/        ← OpenAPI spec parser (JSON + YAML)
│   │   │   ├── auth/           ← Auth engine (bearer/basic/apikey/oauth2/oidc)
│   │   │   ├── mcp/            ← MCP Streamable HTTP server
│   │   │   ├── proxy/          ← Auth-injecting API proxy
│   │   │   ├── logs/           ← WebSocket live log bus
│   │   │   └── api/            ← Studio REST API routes
│   │   ├── data/               ← SQLite DB file (gitignored)
│   │   └── index.ts            ← Bun.serve() entry point
│   └── studio/                 ← TanStack Start frontend (Cloudflare Workers)
│       ├── src/
│       │   ├── routes/         ← File-based TanStack Router routes
│       │   │   ├── __root.tsx  ← Root route (layout, head)
│       │   │   └── index.tsx   ← Dashboard route
│       │   ├── lib/
│       │   │   └── api.ts      ← CLI API client (reads VITE_CLI_BASE_URL)
│       │   └── styles.css      ← Tailwind CSS entry
│       ├── .env                ← Local dev env (VITE_CLI_BASE_URL=http://localhost:3388)
│       ├── vite.config.ts      ← Vite + Cloudflare + TanStack Start
│       └── wrangler.jsonc      ← Cloudflare Workers deploy config
└── AGENTS.md                   ← THIS FILE
```

---

## Stack & Integrations

### `packages/cli` — Local MCP + Proxy Server
| Tech | Purpose |
|---|---|
| **Bun** | Runtime — `bun:sqlite`, native fetch, WebSockets |
| **`@modelcontextprotocol/sdk`** | MCP Streamable HTTP protocol |
| **`js-yaml`** | Parse YAML OpenAPI specs |
| **`bun:sqlite`** | SQLite for specs, tools, auth, logs |

### `packages/studio` — Cloudflare-deployed Studio UI
| Tech | Purpose |
|---|---|
| **TanStack Start** | Full-stack React framework (SSR + Cloudflare Workers) |
| **TanStack Router** | Type-safe file-based routing |
| **Tailwind CSS v4** | Styling |
| **Vite 8** | Build toolchain |
| **`@cloudflare/vite-plugin`** | Cloudflare Workers adapter |
| **`wrangler`** | Cloudflare deploy CLI |
| **`@tanstack/devtools-vite`** | Dev tools Vite plugin |

---

## Ports & Endpoints

| Service | Address | Description |
|---|---|---|
| CLI (local) | `http://localhost:3388` | MCP + proxy + REST API |
| MCP endpoint | `http://localhost:3388/mcp` | For Claude Desktop / Cursor / Zed |
| API proxy | `http://localhost:3388/proxy/{spec_id}/**` | Proxied API calls with auth |
| Live logs WS | `ws://localhost:3388/logs` | Real-time WebSocket log stream |
| Studio (dev) | `http://localhost:3000` | TanStack Start dev server |
| Studio (prod) | `https://openapi-agent-studio.{account}.workers.dev` | Cloudflare Workers |

---

## Environment Variables

### Studio (`packages/studio/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_CLI_BASE_URL` | Yes | `http://localhost:3388` | Base URL of local CLI server. Set in Cloudflare dashboard for prod. |

> **Cloudflare production**: Go to Workers → `openapi-agent-studio` → Settings → Variables.
> Add `VITE_CLI_BASE_URL` pointing to **your machine's public URL** (e.g. via Cloudflare Tunnel or ngrok).
> Or use a hosted version of the CLI in the future.

### CLI (`packages/cli/`)
No env vars required for local dev. SQLite DB is stored at `packages/cli/data/openapi-agent.db`.

---

## Development

```sh
# 1. Start the CLI server (MCP + proxy + API)
cd packages/cli
bun --hot index.ts
# Server runs on http://localhost:3388

# 2. Start the Studio (in a separate terminal)
cd packages/studio
npm run dev
# Studio runs on http://localhost:3000
```

---

## Build & Deploy

### CLI (publish to npm)
```sh
cd packages/cli
bun build ./index.ts --outdir=dist --target=bun
npm publish --access public   # publishes @openapi-agent/cli
```

### Studio (deploy to Cloudflare)
```sh
cd packages/studio
# Set VITE_CLI_BASE_URL in Cloudflare dashboard first, then:
npm run deploy   # runs: vite build && wrangler deploy
```

---

## Key Architectural Decisions

1. **Single-port CLI server (3388)**: All CLI functionality (MCP, proxy, REST API, WebSocket logs) runs on one `Bun.serve()` instance. No port juggling.

2. **Studio on Cloudflare, CLI local**: The studio is stateless — it only proxies requests from the browser to the local CLI. The CLI holds all state (SQLite, auth tokens, MCP connections).

3. **`VITE_CLI_BASE_URL` build-time injection**: Vite replaces `import.meta.env.VITE_CLI_BASE_URL` at build time. For production, users must expose their CLI via a tunnel (Cloudflare Tunnel, ngrok, etc.) and set this variable before building.

4. **MCP Streamable HTTP (not stdio)**: Chosen for compatibility with Claude.ai, Cursor, Zed, and any HTTP-capable MCP client. Claude Desktop also supports HTTP MCP servers.

5. **File-based routing in TanStack Start**: All pages are in `src/routes/`. The router generates `routeTree.gen.ts` automatically — never edit that file manually.

6. **Tailwind CSS v4**: Uses `@tailwindcss/vite` plugin. No `tailwind.config.js` needed.

---

## Known Gotchas

- **`routeTree.gen.ts` is auto-generated** — run `npm run generate-routes` in studio after adding routes, or just let the dev server do it on save.
- **Bun workspaces vs npm workspaces**: The root uses npm workspaces for studio compatibility. The CLI is built with Bun. Run `bun install` from the root to install CLI deps; run `npm install` inside `packages/studio` for studio deps.
- **`VITE_` prefix is required** for env vars to be exposed to the browser bundle by Vite.
- **Cloudflare Workers run in the edge runtime** — no Node.js built-ins like `fs`. Keep studio code Cloudflare-compatible.
- **OAuth2 Authorization Code flow** requires a popup/redirect — only works when Studio is served over HTTPS (prod). In dev, use Client Credentials or API Key auth.

---

## Next Steps

- [ ] Implement `packages/cli/src/db/schema.ts` — SQLite schema
- [ ] Implement `packages/cli/src/openapi/parser.ts` — fetch + parse specs
- [ ] Implement `packages/cli/src/auth/engine.ts` — all auth mechanisms
- [ ] Implement `packages/cli/src/mcp/server.ts` — MCP Streamable HTTP
- [ ] Implement `packages/cli/src/proxy/handler.ts` — API proxy
- [ ] Implement `packages/cli/src/logs/bus.ts` — WebSocket log bus
- [ ] Implement `packages/cli/index.ts` — `Bun.serve()` wiring
- [ ] Build Studio pages: Dashboard, Explorer (Scalar-style), Logs, Auth, MCP Connect
- [ ] Set up Cloudflare Tunnel for local → cloud connectivity
- [ ] Write unit tests: parser, tool-builder, auth engine
- [ ] Publish `@openapi-agent/cli` to npm
