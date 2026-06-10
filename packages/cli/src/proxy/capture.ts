import { dbQueries, randomUUID } from '../db/index';
import { logBus } from '../logs/bus';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

export async function captureHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  // Path: /c/<binId>[/optional/subpath...]
  const binId = url.pathname.split('/').filter(Boolean)[1];
  if (!binId) return new Response('Not found', { status: 404 });

  const bin = dbQueries.getCaptureBin(binId);
  if (!bin) {
    return new Response(JSON.stringify({ error: 'Capture bin not found or deleted' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const body = (req.method !== 'GET' && req.method !== 'HEAD')
    ? await req.text().catch(() => null)
    : null;

  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (!['host', 'connection'].includes(k.toLowerCase())) reqHeaders[k] = v;
  }

  const id = randomUUID();
  const now = Date.now();

  dbQueries.insertLog({
    id,
    source: 'capture',
    tool_name: binId,
    method: req.method,
    url: req.url,
    request_headers: JSON.stringify(reqHeaders),
    request_body: body,
    status_code: 200,
    response_headers: null,
    response_body: null,
    latency_ms: 0,
    error: null,
  });

  logBus.emit({
    id,
    source: 'capture',
    tool_name: binId,
    method: req.method,
    url: req.url,
    request_headers: JSON.stringify(reqHeaders),
    request_body: body,
    status_code: 200,
    response_headers: null,
    response_body: null,
    latency_ms: 0,
    error: null,
    created_at: now,
  });

  return new Response(JSON.stringify({ ok: true, id, captured_at: now }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
