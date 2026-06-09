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

// Module-level constant — set once on page load. Changing it requires reload.
export let CLI_BASE_URL = getCliUrl();
export let LOG_WS_URL = CLI_BASE_URL.replace(/^http/, 'ws') + '/logs';

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  // Always reads the latest saved URL (in case user just configured it)
  const base = getCliUrl();
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
