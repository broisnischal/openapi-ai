// ─── Runtime server config ────────────────────────────────────────────────────
// Set once at startup (start.ts) and read anywhere the public-facing URL,
// bind address, or access token is needed.

export interface ServerConfig {
  port: number;
  /** Bind address, e.g. "0.0.0.0" (default) or "127.0.0.1" to stay local-only. */
  host: string;
  /** Public origin the server is reachable at, e.g. "https://api.example.com". */
  origin: string | null;
  /** Bearer token required on every request when set. */
  token: string | null;
}

let config: ServerConfig = {
  port: 3388,
  host: '0.0.0.0',
  origin: null,
  token: null,
};

export function setServerConfig(c: ServerConfig) {
  config = c;
}

export function getServerConfig(): ServerConfig {
  return config;
}

export function updateServerConfig(patch: Partial<ServerConfig>) {
  config = { ...config, ...patch };
}

// ─── Runtime feature toggles ──────────────────────────────────────────────────
// Flipped live via slash commands (/mcp off) or PUT /api/features.

export interface Features {
  /** Serve the MCP endpoint (/mcp). */
  mcp: boolean;
  /** Serve the HTTP proxy (/proxy/*). */
  proxy: boolean;
  /** Serve the AI chat endpoint (/api/ai/chat). */
  ai: boolean;
  /** Block every non-GET upstream request (MCP, proxy, explorer, AI tools). */
  readonly: boolean;
}

let features: Features = { mcp: true, proxy: true, ai: true, readonly: false };

export function getFeatures(): Features {
  return features;
}

export function setFeatures(patch: Partial<Features>) {
  features = { ...features, ...patch };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Returns an error message when readonly mode blocks this method, else null. */
export function readonlyViolation(method: string): string | null {
  if (!features.readonly) return null;
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  return `Read-only mode is enabled — ${method.toUpperCase()} requests are blocked. Ask the operator to run /readonly off.`;
}

/** Public base URL for display + serving (no trailing slash). */
export function publicOrigin(): string {
  if (config.origin) return config.origin.replace(/\/$/, '');
  return `http://localhost:${config.port}`;
}

/**
 * Validate the access token on an incoming request.
 * Accepts `Authorization: Bearer <token>` or a `?token=` query param
 * (the latter for WebSocket upgrades and plain browser links).
 * Always passes when no token is configured.
 */
export function isAuthorized(req: Request): boolean {
  if (!config.token) return true;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${config.token}`) return true;
  try {
    return new URL(req.url).searchParams.get('token') === config.token;
  } catch {
    return false;
  }
}
