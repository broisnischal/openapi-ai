# wasper-cli

A local CLI proxy and AI agent for your OpenAPI specs. Explore, test, and automate any REST API without leaving your terminal.

## Install

```bash
npm i -g wasper-cli
# or
bun add -g wasper-cli
```

## Quick start

```bash
# Start with an OpenAPI spec URL
wasper --url https://petstore3.swagger.io/api/v3/openapi.json

# Start in background
wasper --url <spec-url> --background

# Resume last used spec
wasper

# List saved specs
wasper ls

# Switch to a saved spec (by number from `wasper ls`)
wasper use 2

# Remove a spec from history
wasper rm 2
```

Then open [Wasper Studio](https://wasper.site) in your browser.

## Options

```
wasper [--url <spec>] [--port 3388]   Start in foreground
wasper start --background             Start in background
wasper stop                           Stop background server
wasper status                         Show server status
wasper reload                         Hot-reload the spec
wasper ls                             List saved specs
wasper use <number|url>               Start with a saved spec
wasper rm  <number|url>               Remove a spec from history

--url, -u        OpenAPI spec URL or local file path
--port           Port to listen on (default: 3388, env: WASPER_PORT)
--host           Bind address (default: 0.0.0.0, env: WASPER_HOST)
--origin         Public URL (env: WASPER_ORIGIN) — for self-hosting
--token          Require bearer token on every request (env: WASPER_TOKEN)
--no-mcp         Disable MCP endpoint
--no-proxy       Disable HTTP proxy
--no-ai          Disable AI chat endpoint
--readonly       Block all non-GET upstream requests
--background,-b  Start detached in background
```

## Authentication

wasper supports multiple auth schemes — configure them in Wasper Studio under **Authentication**:

| Type | Description |
|------|-------------|
| Bearer | Static bearer token |
| Basic | Username + password |
| API Key | Header, query param, or cookie |
| OAuth2 Client Credentials | Server-side token fetch with caching |
| OIDC | OpenID Connect discovery |
| Custom Headers | Any key/value headers |

Profiles let you save multiple auth configurations and switch between them with:

```bash
# In the interactive REPL
/auth use <profile-name>
```

## Self-hosting

Run wasper on a remote server and connect your studio to it:

```bash
wasper --url <spec> --origin https://api.example.com --token <secret> --background
```

Then in the studio, click **Change CLI URL** and enter `https://api.example.com` with the token.

## AI Agent

The AI chat (`/ai` in the studio, or the `wasper` MCP server) uses the spec to answer questions, search endpoints, and execute API calls on your behalf.

Add wasper as an MCP server in Claude Code:

```bash
claude mcp add wasper -- wasper --port 3388
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `WASPER_PORT` | Server port (default: 3388) |
| `WASPER_HOST` | Bind address (default: 0.0.0.0) |
| `WASPER_ORIGIN` | Public URL for self-hosted deployments |
| `WASPER_TOKEN` | Access token gate |
| `WASPER_SPEC_URL` | Default spec URL |
| `WASPER_DATA_DIR` | Override data directory (default: ~/.wasper/data) |

## Data

wasper stores its database at `~/.wasper/data/wasper.db`. This includes request logs, saved specs, auth profiles, and settings. If you have an existing `~/.openapi-agent/data` directory, wasper will use it automatically.

## License

MIT — see [LICENSE](./LICENSE).
