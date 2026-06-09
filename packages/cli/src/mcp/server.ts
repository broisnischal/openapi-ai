import { getState } from '../state';
import { dbQueries, randomUUID } from '../db/index';
import { logBus } from '../logs/bus';
import { applyAuth } from '../auth/engine';
import type { AuthConfig } from '../auth/engine';
import type { ParsedOperation } from '../openapi/types';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
};

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'openapi-agent', version: '0.1.0' };

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function summarizeAuth(type: string, config: AuthConfig): string {
  switch (type) {
    case 'bearer':    return config.token ? 'Bearer token (configured)' : 'Bearer token (empty)';
    case 'basic':     return config.username ? `Basic auth — user: ${config.username}` : 'Basic auth (not configured)';
    case 'apikey_header': return config.apiKey ? `API Key in header ${config.headerName ?? '?'} (set)` : 'API Key header (not set)';
    case 'apikey_query':  return config.apiKey ? `API Key in query ?${config.queryParam ?? '?'} (set)` : 'API Key query (not set)';
    case 'apikey_cookie': return config.apiKey ? `API Key cookie ${config.cookieName ?? '?'} (set)` : 'API Key cookie (not set)';
    case 'oauth2_cc': return `OAuth2 client_credentials${config.clientId ? ` (client: ${config.clientId})` : ''}`;
    case 'oidc':      return `OIDC${config.openIdConnectUrl ? ` (${config.openIdConnectUrl})` : ''}`;
    case 'custom':    return `Custom headers (${Object.keys(config.customHeaders ?? {}).length} headers set)`;
    default:          return 'No authentication';
  }
}

const TOOLS = [
  {
    name: 'search_endpoints',
    description:
      'Search for API endpoints by keyword, path, tag, or HTTP method. Returns matching endpoints with their operationIds.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — e.g. "user", "GET /pets", "create order", "authentication"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_endpoint_schema',
    description:
      'Get the full schema for a specific API endpoint: parameters, request body, and response schemas.',
    inputSchema: {
      type: 'object',
      properties: {
        operationId: {
          type: 'string',
          description: 'The operationId returned by search_endpoints',
        },
      },
      required: ['operationId'],
    },
  },
  {
    name: 'execute_api_request',
    description: 'Execute an API request for a specific endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        operationId: { type: 'string', description: 'The operationId of the endpoint to call' },
        pathParams: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Path parameter values (e.g. { "petId": "123" })',
        },
        queryParams: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Query parameter values',
        },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Extra request headers',
        },
        body: { description: 'Request body for POST/PUT/PATCH requests' },
      },
      required: ['operationId'],
    },
  },
  {
    name: 'list_auth_profiles',
    description: 'List all saved authentication profiles. Shows profile names, types, and which one is currently active.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_active_auth',
    description: 'Get the current active authentication configuration being used for API requests.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_active_auth',
    description: 'Switch to a saved authentication profile by name or ID. Use list_auth_profiles first to see available profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: 'Profile ID (from list_auth_profiles)' },
        name: { type: 'string', description: 'Profile name (case-insensitive match)' },
      },
    },
  },
];

export async function mcpHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS });

  let bodyText: string;
  try { bodyText = await req.text(); } catch {
    return jsonRes({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Failed to read body' } });
  }
  if (!bodyText.trim()) {
    return jsonRes({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Empty request body' } });
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = JSON.parse(bodyText) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return jsonRes({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map(r => dispatch(r)));
    return jsonRes(responses.filter((r): r is JsonRpcResponse => r !== null));
  }

  const response = await dispatch(body);
  if (response === null) return new Response(null, { status: 202, headers: CORS });
  return jsonRes(response);
}

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  switch (req.method) {
    case 'initialize':
      return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args = {} } = req.params as { name: string; arguments?: Record<string, unknown> };
      return callTool(id, name, args);
    }
    default:
      return rpcErr(id, -32601, `Method not found: ${req.method}`);
  }
}

async function callTool(
  id: string | number | null,
  name: string,
  args: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  switch (name) {
    case 'search_endpoints': {
      const { operations } = getState();
      const q = String(args.query ?? '').toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const matches = operations
        .filter(op => {
          const haystack = [
            op.operationId, op.path, op.method,
            ...(op.tags ?? []),
            op.summary ?? '',
            op.description ?? '',
          ].join(' ').toLowerCase();
          return terms.every(t => haystack.includes(t));
        })
        .slice(0, 50)
        .map(op => ({
          operationId: op.operationId,
          method: op.method.toUpperCase(),
          path: op.path,
          summary: op.summary ?? null,
          tags: op.tags,
        }));

      const totalMatched = operations.filter(op => {
        const haystack = [op.operationId, op.path, op.method, ...(op.tags ?? []), op.summary ?? '', op.description ?? ''].join(' ').toLowerCase();
        return q.split(/\s+/).filter(Boolean).every(t => haystack.includes(t));
      }).length;

      const text =
        matches.length === 0
          ? `No endpoints found matching "${args.query}". Total endpoints available: ${operations.length}. Try a broader or different search term.`
          : JSON.stringify({ returned: matches.length, totalMatched, totalEndpoints: operations.length, endpoints: matches }, null, 2);

      return ok(id, { content: [{ type: 'text', text }] });
    }

    case 'get_endpoint_schema': {
      const { operations } = getState();
      const op = operations.find(o => o.operationId === args.operationId);
      if (!op) {
        return ok(id, {
          content: [{ type: 'text', text: `Endpoint not found: "${args.operationId}". Use search_endpoints to find valid operationIds.` }],
          isError: true,
        });
      }
      return ok(id, {
        content: [{
          type: 'text',
          text: JSON.stringify({
            operationId: op.operationId,
            method: op.method.toUpperCase(),
            path: op.path,
            summary: op.summary ?? null,
            description: op.description ?? null,
            tags: op.tags,
            parameters: op.parameters.map(p => ({
              name: p.name,
              in: p.in,
              required: p.required,
              description: p.description ?? null,
              schema: p.schema,
            })),
            requestBody: op.requestBody ?? null,
            responses: op.responses,
          }, null, 2),
        }],
      });
    }

    case 'execute_api_request': {
      const { operations, spec } = getState();
      const op = operations.find(o => o.operationId === args.operationId);
      if (!op) {
        return ok(id, {
          content: [{ type: 'text', text: `Endpoint not found: "${args.operationId}"` }],
          isError: true,
        });
      }
      try {
        return ok(id, await executeOperation(op, spec.baseUrl, args));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return ok(id, { content: [{ type: 'text', text: `Error: ${message}` }], isError: true });
      }
    }

    case 'list_auth_profiles': {
      const profiles = dbQueries.getProfiles().map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || null,
        type: p.type,
        summary: summarizeAuth(p.type, JSON.parse(p.config) as AuthConfig),
        isActive: p.is_active === 1,
      }));
      const text = profiles.length === 0
        ? 'No auth profiles saved. Create profiles in Studio → Authentication.'
        : JSON.stringify({ count: profiles.length, profiles }, null, 2);
      return ok(id, { content: [{ type: 'text', text }] });
    }

    case 'get_active_auth': {
      const authRow = dbQueries.getAuthConfig();
      if (!authRow || authRow.type === 'none') {
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ type: 'none', summary: 'No authentication configured', isConfigured: false, profileName: null }) }] });
      }
      const config = JSON.parse(authRow.config) as AuthConfig;
      const activeProfile = dbQueries.getActiveProfile();
      return ok(id, { content: [{ type: 'text', text: JSON.stringify({
        type: authRow.type,
        summary: summarizeAuth(authRow.type, config),
        isConfigured: true,
        profileName: activeProfile?.name ?? null,
      }) }] });
    }

    case 'set_active_auth': {
      const reqArgs = args as { id?: string; name?: string };
      const profiles = dbQueries.getProfiles();
      const target = reqArgs.id
        ? profiles.find(p => p.id === reqArgs.id)
        : profiles.find(p => p.name.toLowerCase() === String(reqArgs.name ?? '').toLowerCase());
      if (!target) {
        const names = profiles.map(p => p.name).join(', ') || 'none saved';
        const text = `Profile not found: "${reqArgs.id ?? reqArgs.name}". Available profiles: ${names}`;
        return ok(id, { content: [{ type: 'text', text }], isError: true });
      }
      dbQueries.activateProfile(target.id);
      return ok(id, { content: [{ type: 'text', text: JSON.stringify({
        success: true,
        message: `Switched to "${target.name}"`,
        type: target.type,
        summary: summarizeAuth(target.type, JSON.parse(target.config) as AuthConfig),
      }) }] });
    }

    default:
      return rpcErr(id, -32601, `Unknown tool: ${name}`);
  }
}

async function executeOperation(
  op: ParsedOperation,
  baseUrl: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError: boolean }> {
  const pathParams = (args.pathParams as Record<string, string>) ?? {};
  const queryParams = (args.queryParams as Record<string, string>) ?? {};
  const extraHeaders = (args.headers as Record<string, string>) ?? {};
  const body = args.body;

  let urlPath = op.path;
  for (const [k, v] of Object.entries(pathParams)) {
    urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(String(v)));
  }

  // Resolve base URL — fall back to spec source origin if baseUrl is relative/empty
  let resolvedBase = baseUrl;
  if (!resolvedBase || !resolvedBase.startsWith('http')) {
    const { spec } = getState();
    if (spec.url) {
      try { resolvedBase = new URL(spec.url).origin; } catch { /* */ }
    }
  }
  if (!resolvedBase || !resolvedBase.startsWith('http')) {
    return {
      content: [{ type: 'text', text: `Error: spec has no absolute server URL. Configure the servers array in your OpenAPI spec.` }],
      isError: true,
    };
  }

  const urlObj = new URL(`${resolvedBase.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`);
  for (const [k, v] of Object.entries(queryParams)) urlObj.searchParams.set(k, String(v));

  const authRow = dbQueries.getAuthConfig();
  const authConfig = authRow ? JSON.parse(authRow.config) : { type: 'none' };
  const { url: authedUrl, headers: authedHeaders } = await applyAuth(urlObj.toString(), extraHeaders, authConfig);

  const reqBody = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
  if (reqBody !== null && op.requestBody?.contentType) {
    authedHeaders['Content-Type'] = op.requestBody.contentType;
  }

  const startTime = Date.now();
  const logId = randomUUID();

  try {
    const res = await fetch(authedUrl, {
      method: op.method.toUpperCase(),
      headers: authedHeaders,
      body: reqBody ?? undefined,
    });
    const responseText = await res.text();
    const latency = Date.now() - startTime;

    dbQueries.insertLog({
      id: logId, source: 'mcp', tool_name: op.operationId,
      method: op.method.toUpperCase(), url: authedUrl,
      request_headers: JSON.stringify(authedHeaders), request_body: reqBody,
      status_code: res.status,
      response_headers: JSON.stringify(Object.fromEntries(res.headers.entries())),
      response_body: responseText.slice(0, 8192), latency_ms: latency, error: null,
    });
    logBus.emit({
      id: logId, source: 'mcp', tool_name: op.operationId,
      method: op.method.toUpperCase(), url: authedUrl,
      request_headers: null, request_body: reqBody,
      status_code: res.status, response_headers: null,
      response_body: responseText.slice(0, 2048), latency_ms: latency, error: null,
      created_at: Date.now(),
    });

    let text = responseText;
    try { text = JSON.stringify(JSON.parse(responseText), null, 2); } catch {}

    return {
      content: [{ type: 'text', text: `HTTP ${res.status} (${latency}ms)\n\n${text}` }],
      isError: !res.ok,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - startTime;

    dbQueries.insertLog({
      id: logId, source: 'mcp', tool_name: op.operationId,
      method: op.method.toUpperCase(), url: authedUrl,
      request_headers: JSON.stringify(authedHeaders), request_body: reqBody,
      status_code: null, response_headers: null, response_body: null,
      latency_ms: latency, error: message,
    });
    logBus.emit({
      id: logId, source: 'mcp', tool_name: op.operationId,
      method: op.method.toUpperCase(), url: authedUrl,
      request_headers: null, request_body: null,
      status_code: null, response_headers: null, response_body: null,
      latency_ms: latency, error: message, created_at: Date.now(),
    });

    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcErr(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function jsonRes(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
