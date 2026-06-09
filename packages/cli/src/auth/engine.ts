import { dbQueries } from '../db/index';

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey_header' | 'apikey_query' | 'apikey_cookie' | 'oauth2_cc' | 'oidc' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  apiKey?: string;
  queryParam?: string;
  cookieName?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  openIdConnectUrl?: string;
  customHeaders?: Record<string, string>;
}

export async function applyAuth(
  url: string,
  headers: Record<string, string>,
  authConfig: AuthConfig,
): Promise<{ url: string; headers: Record<string, string> }> {
  const resultHeaders = { ...headers };
  let resultUrl = url;

  switch (authConfig.type) {
    case 'bearer':
      if (authConfig.token) resultHeaders['Authorization'] = `Bearer ${authConfig.token}`;
      break;

    case 'basic':
      if (authConfig.username !== undefined) {
        resultHeaders['Authorization'] = `Basic ${btoa(`${authConfig.username}:${authConfig.password ?? ''}`)}`;
      }
      break;

    case 'apikey_header':
      if (authConfig.headerName && authConfig.apiKey) {
        resultHeaders[authConfig.headerName] = authConfig.apiKey;
      }
      break;

    case 'apikey_query':
      if (authConfig.queryParam && authConfig.apiKey) {
        const u = new URL(resultUrl);
        u.searchParams.set(authConfig.queryParam, authConfig.apiKey);
        resultUrl = u.toString();
      }
      break;

    case 'apikey_cookie':
      if (authConfig.cookieName && authConfig.apiKey) {
        const existing = resultHeaders['Cookie'] ?? '';
        resultHeaders['Cookie'] = existing
          ? `${existing}; ${authConfig.cookieName}=${authConfig.apiKey}`
          : `${authConfig.cookieName}=${authConfig.apiKey}`;
      }
      break;

    case 'oauth2_cc': {
      const token = await getOrRefreshOAuthToken(authConfig);
      if (token) resultHeaders['Authorization'] = `Bearer ${token}`;
      break;
    }

    case 'oidc': {
      if (authConfig.openIdConnectUrl && !authConfig.tokenUrl) {
        authConfig.tokenUrl = await discoverOidcTokenUrl(authConfig.openIdConnectUrl) ?? undefined;
      }
      const token = await getOrRefreshOAuthToken(authConfig);
      if (token) resultHeaders['Authorization'] = `Bearer ${token}`;
      break;
    }

    case 'custom':
      if (authConfig.customHeaders) Object.assign(resultHeaders, authConfig.customHeaders);
      break;
  }

  return { url: resultUrl, headers: resultHeaders };
}

interface TokenCache {
  access_token: string;
  expires_at: number;
}

let memCache: TokenCache | null = null;

function getCachedToken(): string | null {
  if (memCache && Date.now() < memCache.expires_at - 30_000) return memCache.access_token;
  const row = dbQueries.getAuthConfig();
  if (row?.token_cache) {
    try {
      const tc = JSON.parse(row.token_cache) as TokenCache;
      if (Date.now() < tc.expires_at - 30_000) { memCache = tc; return tc.access_token; }
    } catch {}
  }
  return null;
}

async function getOrRefreshOAuthToken(config: AuthConfig): Promise<string | null> {
  const cached = getCachedToken();
  if (cached) return cached;
  if (!config.tokenUrl || !config.clientId) return null;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret ?? '',
  });
  if (config.scope) params.set('scope', config.scope);

  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const cache: TokenCache = { access_token: data.access_token, expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 };
    memCache = cache;
    dbQueries.updateTokenCache(cache);
    return cache.access_token;
  } catch {
    return null;
  }
}

async function discoverOidcTokenUrl(openIdConnectUrl: string): Promise<string | null> {
  try {
    const res = await fetch(openIdConnectUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as { token_endpoint?: string };
    return data.token_endpoint ?? null;
  } catch {
    return null;
  }
}
