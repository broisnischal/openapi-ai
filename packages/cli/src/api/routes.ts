import { dbQueries, randomUUID, type InterceptRuleRow } from '../db/index';
import { applyAuth, type AuthConfig } from '../auth/engine';
import { logBus } from '../logs/bus';
import { getState, hasState, loadSpec, loadSpecFromText } from '../state';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function notFound(msg = 'Not found') { return json({ error: msg }, 404); }
function badRequest(msg: string) { return json({ error: msg }, 400); }

export async function apiRouter(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const { pathname: path, searchParams } = new URL(req.url);
  const method = req.method;

  if (path === '/api/status' && method === 'GET') return handleStatus();
  if (path === '/api/logs' && method === 'GET') return handleGetLogs(searchParams);
  if (path === '/api/logs' && method === 'DELETE') return handleClearLogs();
  if (path === '/api/auth/profiles' && method === 'GET') return handleGetProfiles();
  if (path === '/api/auth/profiles' && method === 'POST') return handleCreateProfile(req);
  if (path.startsWith('/api/auth/profiles/') && method === 'PUT') return handleUpdateProfile(req, path);
  if (path.startsWith('/api/auth/profiles/') && method === 'DELETE') return handleDeleteProfile(path);
  if (path.match(/^\/api\/auth\/profiles\/[^/]+\/activate$/) && method === 'POST') return handleActivateProfile(path);
  if (path === '/api/auth' && method === 'GET') return handleGetAuth();
  if (path === '/api/auth' && method === 'PUT') return handleSetAuth(req);
  if (path === '/api/auth/test' && method === 'POST') return handleTestAuth();
  if (path === '/api/explorer/request' && method === 'POST') return handleExplorerRequest(req);
  if (path === '/api/spec/endpoints' && method === 'GET') return handleGetEndpoints();
  if (path === '/api/settings' && method === 'GET') return handleGetSettings();
  if (path === '/api/settings' && method === 'PUT') return handleSetSettings(req);
  if (path === '/api/spec/upload' && method === 'POST') return handleSpecUpload(req);
  if (path === '/api/spec/reload-url' && method === 'POST') return handleSpecReloadUrl(req);
  if (path === '/api/intercept' && method === 'GET') return handleGetRules();
  if (path === '/api/intercept' && method === 'POST') return handleCreateRule(req);
  if (path.startsWith('/api/intercept/') && method === 'PUT') return handleUpdateRule(req, path);
  if (path.startsWith('/api/intercept/') && method === 'DELETE') return handleDeleteRule(path);
  if (path === '/api/ai/chat' && method === 'POST') return handleAiChat(req);
  if (path === '/api/reload' && method === 'POST') return handleReload();
  if (path === '/api/server-info' && method === 'GET') return handleServerInfo();

  return notFound('API route not found');
}

function handleStatus(): Response {
  if (!hasState()) {
    return json({ ok: true, version: '0.1.0', spec: null, endpointCount: 0, wsClients: logBus.clientCount });
  }
  const { spec, operations } = getState();
  return json({
    ok: true,
    version: '0.1.0',
    spec: { title: spec.title, version: spec.version, baseUrl: spec.baseUrl, url: spec.url },
    endpointCount: operations.length,
    wsClients: logBus.clientCount,
  });
}

async function handleReload(): Promise<Response> {
  if (!hasState()) return badRequest('No spec loaded');
  const { specUrl } = getState();
  if (!specUrl) return json({ error: 'Spec was uploaded manually — cannot reload from URL' }, 400);
  try {
    const s = await loadSpec(specUrl);
    return json({ ok: true, spec: s.spec.title, version: s.spec.version, endpoints: s.operations.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

function handleServerInfo(): Response {
  const state = hasState() ? getState() : null;
  return json({
    pid: process.pid,
    port: parseInt(process.env._OA_PORT ?? '3388', 10),
    startedAt: parseInt(process.env._OA_STARTED ?? '0', 10),
    spec: state ? {
      title: state.spec.title,
      version: state.spec.version,
      endpointCount: state.operations.length,
      specUrl: state.specUrl ?? null,
    } : null,
  });
}

async function handleSpecUpload(req: Request): Promise<Response> {
  let content: string;
  let filename = 'spec';

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await req.formData() as unknown as FormData; } catch { return badRequest('Invalid form data'); }
    const file = form.get('file');
    if (!file || typeof file === 'string') return badRequest('No file in form data');
    filename = (file as File).name ?? 'spec';
    content = await (file as File).text();
  } else if (ct.includes('application/json') && !ct.includes('yaml')) {
    let body: { content?: string; filename?: string };
    try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }
    if (!body.content) return badRequest('Missing content field');
    content = body.content;
    filename = body.filename ?? 'spec';
  } else {
    content = await req.text();
  }

  if (!content.trim()) return badRequest('Empty spec content');

  try {
    const state = loadSpecFromText(content, filename);
    return json({
      ok: true,
      spec: { title: state.spec.title, version: state.spec.version, baseUrl: state.spec.baseUrl },
      endpointCount: state.operations.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

async function handleSpecReloadUrl(req: Request): Promise<Response> {
  let body: { url?: string };
  try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }
  if (!body.url) return badRequest('Missing url field');

  try {
    const state = await loadSpec(body.url);
    return json({
      ok: true,
      spec: { title: state.spec.title, version: state.spec.version, baseUrl: state.spec.baseUrl },
      endpointCount: state.operations.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

function handleGetLogs(searchParams: URLSearchParams): Response {
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500'), 2000);
  return json(dbQueries.getRecentLogs(limit));
}

function handleClearLogs(): Response {
  dbQueries.clearLogs();
  return json({ cleared: true });
}

function handleGetAuth(): Response {
  const auth = dbQueries.getAuthConfig();
  return json(auth ? { type: auth.type, config: JSON.parse(auth.config) } : { type: 'none', config: {} });
}

async function handleSetAuth(req: Request): Promise<Response> {
  let body: { type: string; config: object };
  try { body = (await req.json()) as { type: string; config: object }; } catch { return badRequest('Invalid JSON'); }
  dbQueries.setAuthConfig(body.type, body.config);
  return json({ type: body.type, config: body.config });
}

async function handleTestAuth(): Promise<Response> {
  const { spec } = getState();
  const authRow = dbQueries.getAuthConfig();
  const authConfig: AuthConfig = authRow ? JSON.parse(authRow.config) : { type: 'none' };
  const testUrl = `${spec.baseUrl.replace(/\/$/, '')}/`;

  try {
    const { url, headers } = await applyAuth(testUrl, {}, authConfig);
    const res = await fetch(url, { method: 'HEAD', headers }).catch(() => fetch(url, { method: 'GET', headers }));
    return json({ ok: res.ok, status: res.status, statusText: res.statusText });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function handleGetEndpoints(): Response {
  return json(getState().operations);
}

function handleGetSettings(): Response {
  const row = dbQueries.getSettings();
  return json(row ? JSON.parse(row.value) : {
    proxy: { enabled: false, type: 'http', host: '', port: 8080, username: '', password: '' },
    ai: { provider: 'anthropic', apiKey: '', model: 'claude-opus-4-8', baseUrl: '' },
    request: { timeout: 30000, followRedirects: true, sslVerify: true },
  });
}

async function handleSetSettings(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return badRequest('Invalid JSON'); }
  dbQueries.setSettings(body);
  return json(body);
}

// ─── Tool definitions ────────────────────────────────────────────────────────

interface ToolCall { tool: string; input: Record<string, unknown>; output: string; isError: boolean; }

const TOOL_DEFS = {
  search_endpoints: {
    description: 'Search API endpoints by keyword, path, tag, or HTTP method.',
    params: { query: { type: 'string', description: 'Search term, e.g. "user", "GET /pets"' } },
    required: ['query'],
  },
  get_endpoint_schema: {
    description: 'Get full schema (parameters, request body, responses) for an endpoint by operationId.',
    params: { operationId: { type: 'string', description: 'operationId returned by search_endpoints' } },
    required: ['operationId'],
  },
  execute_api_request: {
    description: 'Execute an API request against the loaded spec server and return the response.',
    params: {
      operationId: { type: 'string' },
      pathParams: { type: 'object', additionalProperties: { type: 'string' }, description: 'Path parameter values' },
      queryParams: { type: 'object', additionalProperties: { type: 'string' }, description: 'Query parameter values' },
      headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Extra request headers' },
      body: { description: 'Request body for POST/PUT/PATCH' },
    },
    required: ['operationId'],
  },
  fetch_url: {
    description: 'Fetch a web page or API documentation URL and return its text content.',
    params: { url: { type: 'string', description: 'URL to fetch' } },
    required: ['url'],
  },
};

const ANTHROPIC_TOOLS = Object.entries(TOOL_DEFS).map(([name, def]) => ({
  name,
  description: def.description,
  input_schema: { type: 'object', properties: def.params, required: def.required },
}));

const OPENAI_TOOLS = Object.entries(TOOL_DEFS).map(([name, def]) => ({
  type: 'function',
  function: { name, description: def.description, parameters: { type: 'object', properties: def.params, required: def.required } },
}));

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const { operations, spec } = getState();

  if (name === 'search_endpoints') {
    const q = String(args.query ?? '').toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = operations
      .filter(op => {
        const hay = [op.operationId, op.path, op.method, ...(op.tags ?? []), op.summary ?? '', op.description ?? ''].join(' ').toLowerCase();
        return terms.every(t => hay.includes(t));
      })
      .slice(0, 30)
      .map(op => ({ operationId: op.operationId, method: op.method.toUpperCase(), path: op.path, summary: op.summary ?? null, tags: op.tags }));
    if (!matches.length) return { text: `No endpoints found matching "${args.query}". Total: ${operations.length}.`, isError: false };
    return { text: JSON.stringify({ count: matches.length, total: operations.length, endpoints: matches }, null, 2), isError: false };
  }

  if (name === 'get_endpoint_schema') {
    const op = operations.find(o => o.operationId === args.operationId);
    if (!op) return { text: `Endpoint not found: "${args.operationId}"`, isError: true };
    return {
      text: JSON.stringify({
        operationId: op.operationId, method: op.method.toUpperCase(), path: op.path,
        summary: op.summary ?? null, description: op.description ?? null, tags: op.tags,
        parameters: op.parameters, requestBody: op.requestBody ?? null, responses: op.responses,
      }, null, 2),
      isError: false,
    };
  }

  if (name === 'execute_api_request') {
    const op = operations.find(o => o.operationId === args.operationId);
    if (!op) return { text: `Endpoint not found: "${args.operationId}"`, isError: true };

    const pathParams = (args.pathParams as Record<string, string>) ?? {};
    const queryParams = (args.queryParams as Record<string, string>) ?? {};
    const extraHeaders = (args.headers as Record<string, string>) ?? {};
    const reqBody = args.body;

    let urlPath = op.path;
    for (const [k, v] of Object.entries(pathParams)) urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(String(v)));

    let base = spec.baseUrl;
    if (!base?.startsWith('http') && spec.url) {
      try { base = new URL(spec.url).origin; } catch { /* */ }
    }
    if (!base?.startsWith('http')) return { text: 'Error: spec has no absolute server URL', isError: true };

    const urlObj = new URL(`${base.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`);
    for (const [k, v] of Object.entries(queryParams)) urlObj.searchParams.set(k, String(v));

    const authRow = dbQueries.getAuthConfig();
    const authConfig = authRow ? JSON.parse(authRow.config) : { type: 'none' };
    const { url: authedUrl, headers: authedHeaders } = await applyAuth(urlObj.toString(), extraHeaders, authConfig);

    const bodyStr = reqBody !== undefined ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : null;
    if (bodyStr !== null && op.requestBody?.contentType) authedHeaders['Content-Type'] = op.requestBody.contentType;

    try {
      const start = Date.now();
      const res = await fetch(authedUrl, { method: op.method.toUpperCase(), headers: authedHeaders, body: bodyStr ?? undefined });
      const text = await res.text();
      const latency = Date.now() - start;
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* */ }
      return { text: `HTTP ${res.status} (${latency}ms)\n\n${pretty}`, isError: !res.ok };
    } catch (e) {
      return { text: `Network error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }

  if (name === 'fetch_url') {
    const url = String(args.url ?? '');
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'openapi-agent/0.1' }, signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      const stripped = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);
      return { text: `HTTP ${res.status} from ${url}\n\n${stripped}`, isError: !res.ok };
    } catch (e) {
      return { text: `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }

  return { text: `Unknown tool: ${name}`, isError: true };
}

// ─── Agentic loops ────────────────────────────────────────────────────────────

type Msg = { role: string; content: unknown; tool_call_id?: string };
type Emit = (e: Record<string, unknown>) => void;

async function anthropicAgentLoop(
  apiKey: string, model: string, system: string, initialMessages: Msg[], emit: Emit,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const msgs: Msg[] = [...initialMessages];
  const toolCalls: ToolCall[] = [];

  for (let iter = 0; iter < 10; iter++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4096, system, messages: msgs, tools: ANTHROPIC_TOOLS }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);

    const d = await res.json() as {
      stop_reason: string;
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    };

    const textBlock = d.content.find(c => c.type === 'text');
    if (d.stop_reason !== 'tool_use') return { content: textBlock?.text ?? '', toolCalls };

    msgs.push({ role: 'assistant', content: d.content });

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const block of d.content) {
      if (block.type !== 'tool_use' || !block.id || !block.name) continue;
      emit({ type: 'tool_start', tool: block.name, input: block.input ?? {} });
      const result = await executeTool(block.name, block.input ?? {});
      emit({ type: 'tool_done', tool: block.name, input: block.input ?? {}, output: result.text, isError: result.isError });
      toolCalls.push({ tool: block.name, input: block.input ?? {}, output: result.text, isError: result.isError });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result.text });
    }
    if (!toolResults.length) return { content: textBlock?.text ?? '', toolCalls };
    msgs.push({ role: 'user', content: toolResults });
  }
  return { content: '(max iterations reached)', toolCalls };
}

async function openaiCompatibleLoop(
  base: string, apiKey: string | undefined, model: string, extraHeaders: Record<string, string>,
  system: string, initialMessages: Msg[], emit: Emit,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const msgs: Msg[] = [{ role: 'system', content: system }, ...initialMessages];
  const toolCalls: ToolCall[] = [];
  const authHeaders: Record<string, string> = {};
  if (apiKey) authHeaders['Authorization'] = `Bearer ${apiKey}`;

  for (let iter = 0; iter < 10; iter++) {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...extraHeaders },
      body: JSON.stringify({ model, messages: msgs, tools: OPENAI_TOOLS, tool_choice: 'auto' }),
    });
    if (!res.ok) throw new Error(await res.text());

    const d = await res.json() as {
      choices: Array<{
        finish_reason: string;
        message: {
          role: string; content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const choice = d.choices?.[0];
    if (!choice) return { content: '', toolCalls };

    if (choice.finish_reason !== 'tool_calls') return { content: choice.message.content ?? '', toolCalls };

    msgs.push(choice.message as Msg);
    for (const tc of choice.message.tool_calls ?? []) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* */ }
      emit({ type: 'tool_start', tool: tc.function.name, input: args });
      const result = await executeTool(tc.function.name, args);
      emit({ type: 'tool_done', tool: tc.function.name, input: args, output: result.text, isError: result.isError });
      toolCalls.push({ tool: tc.function.name, input: args, output: result.text, isError: result.isError });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: result.text });
    }
  }
  return { content: '(max iterations reached)', toolCalls };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleAiChat(req: Request): Promise<Response> {
  let body: { messages: { role: string; content: string }[] };
  try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }

  const settingsRow = dbQueries.getSettings();
  const settings = settingsRow ? JSON.parse(settingsRow.value) : {};
  const ai = (settings.ai ?? {}) as { provider?: string; apiKey?: string; model?: string; baseUrl?: string };

  const { spec, operations } = getState();
  const preview = operations.slice(0, 40).map(op => `- ${op.method.toUpperCase()} ${op.path}${op.summary ? `: ${op.summary}` : ''}`).join('\n');
  const system = `You are an AI assistant for the "${spec.title}" API (v${spec.version}). Base URL: ${spec.baseUrl}.
Total endpoints: ${operations.length}. Sample:
${preview}${operations.length > 40 ? `\n... and ${operations.length - 40} more` : ''}

You have tools: search_endpoints, get_endpoint_schema, execute_api_request, fetch_url.
Use them proactively — search before answering questions about endpoints, execute requests when asked to test/call an API, fetch URLs when the user asks about external docs.
Be concise and practical. Render JSON in code blocks.`;

  const provider = ai.provider ?? 'anthropic';
  const requiresKey = provider !== 'ollama' && provider !== 'custom';
  if (requiresKey && !ai.apiKey) {
    return json({ error: 'No AI API key configured. Go to Settings → AI Provider to add one.' }, 400);
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit: Emit = (e) => { writer.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {}); };

  const msgs = body.messages as Msg[];

  (async () => {
    try {
      let result: { content: string; toolCalls: ToolCall[] };

      if (provider === 'anthropic') {
        result = await anthropicAgentLoop(ai.apiKey!, ai.model || 'claude-haiku-4-5-20251001', system, msgs, emit);
      } else if (provider === 'openai') {
        const base = (ai.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
        result = await openaiCompatibleLoop(base, ai.apiKey, ai.model || 'gpt-4o-mini', {}, system, msgs, emit);
      } else if (provider === 'mistral') {
        const base = (ai.baseUrl || 'https://api.mistral.ai').replace(/\/$/, '');
        result = await openaiCompatibleLoop(base, ai.apiKey, ai.model || 'mistral-small-latest', {}, system, msgs, emit);
      } else if (provider === 'github-copilot') {
        const base = (ai.baseUrl || 'https://api.githubcopilot.com').replace(/\/$/, '');
        result = await openaiCompatibleLoop(base, ai.apiKey, ai.model || 'gpt-4o', {
          'Copilot-Integration-Id': 'vscode-chat',
          'Editor-Version': 'vscode/1.85.0',
        }, system, msgs, emit);
      } else if (provider === 'groq') {
        const base = (ai.baseUrl || 'https://api.groq.com/openai').replace(/\/$/, '');
        result = await openaiCompatibleLoop(base, ai.apiKey, ai.model || 'llama-3.1-70b-versatile', {}, system, msgs, emit);
      } else if (provider === 'custom') {
        if (!ai.baseUrl) { emit({ type: 'error', message: 'Custom provider requires a Base URL.' }); await writer.close(); return; }
        result = await openaiCompatibleLoop(ai.baseUrl.replace(/\/$/, ''), ai.apiKey, ai.model || '', {}, system, msgs, emit);
      } else if (provider === 'ollama') {
        const base = (ai.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
        const res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ai.model || 'llama3', messages: [{ role: 'system', content: system }, ...msgs], stream: false }),
        });
        const d = await res.json() as { message: { content: string } };
        result = { content: d.message.content ?? '', toolCalls: [] };
      } else if (provider === 'gemini') {
        const model = ai.model || 'gemini-1.5-flash';
        const base = (ai.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
        const res = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${ai.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens: 4096 },
          }),
        });
        const d = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
        result = { content: d.candidates[0]?.content.parts[0]?.text ?? '', toolCalls: [] };
      } else {
        emit({ type: 'error', message: `Unknown provider: ${provider}` });
        await writer.close();
        return;
      }

      emit({ type: 'done', content: result.content, toolCalls: result.toolCalls });
    } catch (e) {
      emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      try { await writer.close(); } catch { /* stream already closed by timeout or client disconnect */ }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...CORS,
    },
  });
}

// ─── Auth profiles ────────────────────────────────────────────────────────────

function handleGetProfiles(): Response {
  return json(dbQueries.getProfiles());
}

async function handleCreateProfile(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json() as typeof body; } catch { return badRequest('Invalid JSON'); }
  const profile = {
    id: randomUUID(),
    name: String(body.name ?? '').trim() || 'Unnamed',
    description: String(body.description ?? ''),
    type: String(body.type ?? 'none'),
    config: JSON.stringify(body.config ?? {}),
    token_cache: null as string | null,
    is_active: 0,
  };
  dbQueries.insertProfile(profile);
  return json({ ...profile, is_active: false });
}

async function handleUpdateProfile(req: Request, path: string): Promise<Response> {
  const id = path.replace('/api/auth/profiles/', '').replace(/\/.*/, '');
  let body: Record<string, unknown>;
  try { body = await req.json() as typeof body; } catch { return badRequest('Invalid JSON'); }
  const patch: Record<string, unknown> = {};
  if ('name' in body) patch.name = String(body.name);
  if ('description' in body) patch.description = String(body.description);
  if ('type' in body) patch.type = String(body.type);
  if ('config' in body) patch.config = JSON.stringify(body.config);
  dbQueries.updateProfile(id, patch as Parameters<typeof dbQueries.updateProfile>[1]);
  return json({ ok: true });
}

function handleDeleteProfile(path: string): Response {
  const id = path.replace('/api/auth/profiles/', '');
  dbQueries.deleteProfile(id);
  return json({ ok: true });
}

function handleActivateProfile(path: string): Response {
  const id = path.replace('/api/auth/profiles/', '').replace('/activate', '');
  dbQueries.activateProfile(id);
  const profile = dbQueries.getProfiles().find(p => p.id === id);
  return json({ ok: true, profile });
}

// ─── Intercept rules ──────────────────────────────────────────────────────────

function handleGetRules(): Response {
  return json(dbQueries.getRules());
}

async function handleCreateRule(req: Request): Promise<Response> {
  let body: Partial<Omit<InterceptRuleRow, 'id' | 'created_at'>>;
  try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }
  const rule: Omit<InterceptRuleRow, 'created_at'> = {
    id: randomUUID(),
    enabled: body.enabled ?? 1,
    name: body.name ?? '',
    sort_order: body.sort_order ?? 0,
    match_path: body.match_path ?? '',
    match_method: body.match_method ?? '',
    target_host: body.target_host ?? '',
    strip_prefix: body.strip_prefix ?? '',
    add_prefix: body.add_prefix ?? '',
    add_headers: body.add_headers ?? '{}',
  };
  dbQueries.insertRule(rule);
  return json(rule, 201);
}

async function handleUpdateRule(req: Request, path: string): Promise<Response> {
  const id = path.slice('/api/intercept/'.length);
  if (!id) return badRequest('Missing rule id');
  let body: Partial<Omit<InterceptRuleRow, 'id' | 'created_at'>>;
  try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }
  dbQueries.updateRule(id, body);
  return json({ ok: true });
}

function handleDeleteRule(path: string): Response {
  const id = path.slice('/api/intercept/'.length);
  if (!id) return badRequest('Missing rule id');
  dbQueries.deleteRule(id);
  return json({ ok: true });
}

async function handleExplorerRequest(req: Request): Promise<Response> {
  let body: { method: string; url: string; headers?: Record<string, string>; body?: string };
  try { body = (await req.json()) as typeof body; } catch { return badRequest('Invalid JSON'); }

  const authRow = dbQueries.getAuthConfig();
  const authConfig: AuthConfig = authRow ? JSON.parse(authRow.config) : { type: 'none' };

  // Resolve relative URLs against the spec base URL (or spec source origin as fallback)
  let reqUrl = body.url.trim();
  if (!reqUrl.startsWith('http')) {
    const { spec } = getState();
    let base = spec.baseUrl.startsWith('http') ? spec.baseUrl : '';
    if (!base && spec.url) {
      try { base = new URL(spec.url).origin; } catch { /* */ }
    }
    if (base) {
      reqUrl = new URL(reqUrl, base).href;
    } else {
      return json({ error: `Cannot resolve "${reqUrl}": spec has no absolute server URL. Configure it in the OpenAPI spec's servers array.` }, 400);
    }
  }

  const { url: authedUrl, headers: authedHeaders } = await applyAuth(reqUrl, body.headers ?? {}, authConfig);

  const startTime = Date.now();
  try {
    const res = await fetch(authedUrl, {
      method: body.method.toUpperCase(),
      headers: authedHeaders,
      body: body.body ?? undefined,
    });
    const responseText = await res.text();
    const latency = Date.now() - startTime;
    return json({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: responseText, latency });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), latency: Date.now() - startTime }, 502);
  }
}
