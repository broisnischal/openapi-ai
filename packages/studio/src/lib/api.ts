const ENV_URL = (import.meta.env.VITE_CLI_BASE_URL as string | undefined) ?? 'http://localhost:3388';

export function getCliUrl(): string {
  try {
    return localStorage.getItem('cli_url') || ENV_URL;
  } catch {
    return ENV_URL;
  }
}

export function setCliUrl(url: string): void {
  try { localStorage.setItem('cli_url', url.replace(/\/$/, '')); } catch { /* */ }
}

export function clearCliUrl(): void {
  try { localStorage.removeItem('cli_url'); } catch { /* */ }
}

export function getCliToken(): string | null {
  try { return localStorage.getItem('cli_token'); } catch { return null; }
}

export function setCliToken(token: string): void {
  try {
    if (token) localStorage.setItem('cli_token', token);
    else localStorage.removeItem('cli_token');
  } catch { /* */ }
}

export function clearCliToken(): void {
  try { localStorage.removeItem('cli_token'); } catch { /* */ }
}

// ── Deep-link configuration ─────────────────────────────────────────────────
// Opening the studio with ?server=https://my-cli.example.com&token=secret
// connects it to a remote/self-hosted CLI dynamically. The values persist to
// localStorage and are stripped from the address bar.
function applyDeepLink(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const server = params.get('server') ?? params.get('cli');
    const token = params.get('token');
    if (!server && token === null) return;
    if (server) setCliUrl(server);
    if (token !== null) setCliToken(token);
    params.delete('server');
    params.delete('cli');
    params.delete('token');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  } catch { /* */ }
}
applyDeepLink();

/** Headers to authenticate against the CLI (empty when no token is set). */
export function authHeaders(): Record<string, string> {
  const token = getCliToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Absolute CLI URL for direct browser links (carries the token via query). */
export function cliLink(path: string): string {
  const token = getCliToken();
  const base = getCliUrl();
  if (!token) return `${base}${path}`;
  return `${base}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

// Module-level constant — set once on page load. Changing it requires reload.
export let CLI_BASE_URL = getCliUrl();
export let LOG_WS_URL = cliLink('/logs').replace(/^http/, 'ws');

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  // Always reads the latest saved URL (in case user just configured it)
  const base = getCliUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
