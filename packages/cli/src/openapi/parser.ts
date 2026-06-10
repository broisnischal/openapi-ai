import yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import type { ParsedSpec, ParsedOperation, ParsedParameter, ParsedRequestBody, JsonSchema } from './types';

export async function fetchAndParseSpec(url: string, name?: string): Promise<ParsedSpec> {
  const res = await fetch(url, { headers: { Accept: 'application/json, application/yaml, text/yaml, */*' } });
  if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
  return parseSpecText(await res.text(), url, name);
}

export function parseSpecText(text: string, url?: string, name?: string): ParsedSpec {
  let raw: Record<string, unknown>;
  try {
    raw = text.trimStart().startsWith('{')
      ? JSON.parse(text)
      : (yaml.load(text) as Record<string, unknown>);
  } catch {
    throw new Error('Invalid OpenAPI spec: could not parse as JSON or YAML');
  }

  const doc = deref(raw, raw) as Record<string, unknown>;
  const info = (doc.info as Record<string, string>) ?? {};
  const servers = (doc.servers as Array<{ url: string }>) ?? [];

  let baseUrl = servers[0]?.url ?? '';
  // Fall back to spec source origin when servers[] is empty (common with NestJS swagger)
  if (!baseUrl && url) {
    try { baseUrl = new URL(url).origin; } catch { /* keep */ }
  }
  // Resolve relative server URLs (e.g. "/api/v1") against the spec source URL
  if (baseUrl && !baseUrl.startsWith('http') && url) {
    try { baseUrl = new URL(baseUrl, url).href.replace(/\/$/, ''); } catch { /* keep */ }
  }

  return {
    id: randomUUID(),
    name: name ?? (info.title ?? 'Untitled API'),
    url: url ?? null,
    raw: JSON.stringify(raw),
    title: info.title ?? 'Untitled API',
    version: info.version ?? '1.0.0',
    baseUrl,
    operations: extractOperations(doc),
    securitySchemes: extractSecuritySchemes(doc),
  };
}

function deref(node: unknown, root: Record<string, unknown>, depth = 0): unknown {
  if (depth > 20 || node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(item => deref(item, root, depth + 1));

  const obj = node as Record<string, unknown>;
  if (typeof obj['$ref'] === 'string' && (obj['$ref'] as string).startsWith('#/')) {
    return deref(resolveRef(obj['$ref'] as string, root), root, depth + 1);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = deref(v, root, depth + 1);
  }
  return result;
}

function resolveRef(ref: string, root: Record<string, unknown>): unknown {
  let current: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else return undefined;
  }
  return current;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

function extractOperations(doc: Record<string, unknown>): ParsedOperation[] {
  const paths = (doc.paths as Record<string, unknown>) ?? {};
  const ops: ParsedOperation[] = [];
  let idx = 0;

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pi = pathItem as Record<string, unknown>;
    const pathParams = parseParameters((pi.parameters as unknown[]) ?? []);

    for (const method of HTTP_METHODS) {
      const opObj = pi[method] as Record<string, unknown> | undefined;
      if (!opObj) continue;

      const rawId = (opObj.operationId as string | undefined)
        ?? `${method}_${pathStr.replace(/[^a-zA-Z0-9]/g, '_')}_${idx++}`;
      const operationId = rawId.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
      const opParams = parseParameters((opObj.parameters as unknown[]) ?? []);

      const paramMap = new Map<string, ParsedParameter>();
      for (const p of [...pathParams, ...opParams]) paramMap.set(`${p.in}:${p.name}`, p);

      ops.push({
        operationId,
        method,
        path: pathStr,
        summary: opObj.summary as string | undefined,
        description: opObj.description as string | undefined,
        tags: (opObj.tags as string[] | undefined) ?? ['default'],
        parameters: [...paramMap.values()],
        requestBody: parseRequestBody(opObj.requestBody),
        responses: parseResponses((opObj.responses as Record<string, unknown>) ?? {}),
        security: opObj.security as Array<Record<string, string[]>> | undefined,
      });
    }
  }

  return ops;
}

function parseParameters(params: unknown[]): ParsedParameter[] {
  return params.flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const param = p as Record<string, unknown>;
    const name = param.name as string | undefined;
    const paramIn = param.in as string | undefined;
    if (!name || !paramIn || !['path', 'query', 'header', 'cookie'].includes(paramIn)) return [];
    return [{
      name,
      in: paramIn as ParsedParameter['in'],
      description: param.description as string | undefined,
      required: (param.required as boolean) ?? paramIn === 'path',
      schema: (param.schema as JsonSchema) ?? { type: 'string' },
    }];
  });
}

function parseRequestBody(rb: unknown): ParsedRequestBody | undefined {
  if (!rb || typeof rb !== 'object') return undefined;
  const body = rb as Record<string, unknown>;
  const content = (body.content as Record<string, { schema?: JsonSchema }>) ?? {};
  const contentType = Object.keys(content).find(ct => ct.includes('json')) ?? Object.keys(content)[0];
  if (!contentType) return undefined;
  return {
    description: body.description as string | undefined,
    required: (body.required as boolean) ?? false,
    contentType,
    schema: content[contentType]?.schema ?? { type: 'object' },
  };
}

function parseResponses(responses: Record<string, unknown>): ParsedOperation['responses'] {
  const result: ParsedOperation['responses'] = {};
  for (const [code, resp] of Object.entries(responses)) {
    if (!resp || typeof resp !== 'object') continue;
    const r = resp as Record<string, unknown>;
    const content = r.content as Record<string, { schema?: JsonSchema }> | undefined;
    const jsonCt = content ? Object.keys(content).find(ct => ct.includes('json')) : undefined;
    result[code] = {
      description: r.description as string | undefined,
      contentType: jsonCt,
      schema: jsonCt ? content?.[jsonCt]?.schema : undefined,
    };
  }
  return result;
}

function extractSecuritySchemes(doc: Record<string, unknown>): ParsedSpec['securitySchemes'] {
  const schemes = ((doc.components as Record<string, unknown> | undefined)?.securitySchemes) as Record<string, unknown> | undefined;
  if (!schemes) return {};
  const result: ParsedSpec['securitySchemes'] = {};
  for (const [name, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== 'object') continue;
    const s = scheme as Record<string, unknown>;
    result[name] = {
      type: s.type as ParsedSpec['securitySchemes'][string]['type'],
      scheme: s.scheme as string | undefined,
      in: s.in as 'header' | 'query' | 'cookie' | undefined,
      name: s.name as string | undefined,
      flows: s.flows as ParsedSpec['securitySchemes'][string]['flows'],
      openIdConnectUrl: s.openIdConnectUrl as string | undefined,
    };
  }
  return result;
}

export interface SuggestedVar {
  key: string;
  value: string;
  description: string;
  source: 'server' | 'auth' | 'path';
}

function toEnvKey(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c: string) => c.toLowerCase())
    .replace(/[^a-zA-Z0-9_]/g, '')
    || str.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

export function extractSuggestedVars(rawText: string, baseUrl: string): SuggestedVar[] {
  let raw: Record<string, unknown>;
  try {
    raw = rawText.trimStart().startsWith('{')
      ? JSON.parse(rawText)
      : (yaml.load(rawText) as Record<string, unknown>);
  } catch { return []; }

  const vars: SuggestedVar[] = [];
  const seen = new Set<string>();

  const add = (key: string, value: string, description: string, source: SuggestedVar['source']) => {
    const k = key.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    vars.push({ key: k, value, description, source });
  };

  // 1. Base URL
  if (baseUrl) add('baseUrl', baseUrl, 'API base URL', 'server');

  // 2. Server template variables
  type ServerDef = { url: string; variables?: Record<string, { default?: string; description?: string }> };
  const servers = (raw.servers as ServerDef[]) ?? [];
  for (const server of servers.slice(0, 5)) {
    if (!server.variables) continue;
    for (const [key, def] of Object.entries(server.variables)) {
      add(toEnvKey(key), def.default ?? '', def.description ?? `Server variable: ${key}`, 'server');
    }
  }

  // 3. Security schemes
  const components = (raw.components as Record<string, unknown>) ?? {};
  const secSchemes = (components.securitySchemes as Record<string, Record<string, unknown>>) ?? {};

  for (const [schemeName, scheme] of Object.entries(secSchemes)) {
    if (!scheme || typeof scheme !== 'object') continue;
    const type = scheme.type as string;
    const slug = toEnvKey(schemeName);

    if (type === 'http') {
      const httpScheme = ((scheme.scheme as string) ?? '').toLowerCase();
      if (httpScheme === 'bearer') {
        add(`${slug}Token`, '', `Bearer token for ${schemeName}`, 'auth');
      } else if (httpScheme === 'basic') {
        add(`${slug}Username`, '', `Username for ${schemeName}`, 'auth');
        add(`${slug}Password`, '', `Password for ${schemeName}`, 'auth');
      }
    } else if (type === 'apiKey') {
      const keyName = (scheme.name as string) ?? schemeName;
      add(toEnvKey(keyName), '', `API key header/param: ${keyName}`, 'auth');
    } else if (type === 'oauth2') {
      add(`${slug}ClientId`, '', `OAuth2 client ID for ${schemeName}`, 'auth');
      add(`${slug}ClientSecret`, '', `OAuth2 client secret for ${schemeName}`, 'auth');
      add(`${slug}Token`, '', `OAuth2 access token for ${schemeName}`, 'auth');
    } else if (type === 'openIdConnect') {
      add(`${slug}Token`, '', `Access token for ${schemeName}`, 'auth');
    }
  }

  // 4. Repeated path parameters (appear in >= 15% of paths or >= 3 paths)
  const paths = (raw.paths as Record<string, Record<string, unknown>>) ?? {};
  const pathKeys = Object.keys(paths);
  const paramFreq: Record<string, number> = {};

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const params = (pathItem.parameters as Array<{ name: string; in: string }>) ?? [];
    const seenInPath = new Set<string>();
    for (const p of params) {
      if (p.in === 'path' && p.name && !seenInPath.has(p.name)) {
        seenInPath.add(p.name);
        paramFreq[p.name] = (paramFreq[p.name] ?? 0) + 1;
      }
    }
    // Also extract {params} from the path string itself
    for (const [, param] of pathStr.matchAll(/\{([^}]+)\}/g)) {
      if (!param) continue;
      if (!seenInPath.has(param)) {
        seenInPath.add(param);
        paramFreq[param] = (paramFreq[param] ?? 0) + 1;
      }
    }
  }

  const threshold = Math.max(3, Math.floor(pathKeys.length * 0.15));
  for (const [name, count] of Object.entries(paramFreq)) {
    if (count >= threshold) {
      add(toEnvKey(name), '', `Common path param: {${name}}`, 'path');
    }
  }

  return vars;
}
