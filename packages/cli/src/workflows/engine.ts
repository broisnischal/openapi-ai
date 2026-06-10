import { applyAuth, type AuthConfig } from '../auth/engine';
import { dbQueries } from '../db/index';
import { getState } from '../state';

export interface WorkflowStep {
  id: string;
  label: string;
  method: string;
  path: string;
  operationId?: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  extract?: Array<{ var: string; path: string }>;
  assert?: Array<{ type: 'status' | 'json'; statusCode?: number; path?: string; eq?: unknown; contains?: string }>;
}

export interface StepResult {
  stepId: string;
  label: string;
  method: string;
  resolvedPath: string;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number | null;
  statusText: string;
  responseHeaders: Record<string, string>;
  latency: number;
  extractedVars: Record<string, string>;
  assertions: Array<{ pass: boolean; message: string }>;
  pass: boolean;
  error?: string;
  responseBody?: string;
}

type EmitFn = (event: Record<string, unknown>) => void;

function interpolate(val: string, ctx: Record<string, string>): string {
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
}

function interpolateDeep(obj: unknown, ctx: Record<string, string>): unknown {
  if (typeof obj === 'string') return interpolate(obj, ctx);
  if (Array.isArray(obj)) return obj.map(v => interpolateDeep(v, ctx));
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = interpolateDeep(v, ctx);
    return out;
  }
  return obj;
}

function resolveJsonPath(data: unknown, path: string): unknown {
  if (!path || path === '$') return data;
  const normalized = path.startsWith('$.') ? path.slice(2) : path.startsWith('$[') ? path.slice(1) : path;
  if (!normalized) return data;

  const parts: (string | number)[] = [];
  for (const seg of normalized.split('.')) {
    const m = seg.match(/^(\w+)\[(\d+)\]$/);
    if (m) { parts.push(m[1]!, parseInt(m[2]!, 10)); }
    else if (/^\d+$/.test(seg)) { parts.push(parseInt(seg, 10)); }
    else { parts.push(seg); }
  }

  let cur: unknown = data;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = typeof part === 'number'
      ? (cur as unknown[])[part]
      : (cur as Record<string, unknown>)[part];
  }
  return cur;
}

async function executeStep(step: WorkflowStep, ctx: Record<string, string>): Promise<StepResult> {
  const { spec } = getState();

  let base = spec.baseUrl;
  if (!base?.startsWith('http') && spec.url) {
    try { base = new URL(spec.url).origin; } catch { /* */ }
  }
  if (!base?.startsWith('http')) throw new Error('Spec has no absolute server URL');

  // Resolve path: first substitute {param} from pathParams, then interpolate {{var}}
  let urlPath = step.path;
  for (const [k, v] of Object.entries(step.pathParams ?? {})) {
    urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(interpolate(v, ctx)));
  }
  urlPath = interpolate(urlPath, ctx);

  const urlObj = new URL(`${base.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`);

  for (const [k, v] of Object.entries(step.queryParams ?? {})) {
    urlObj.searchParams.set(k, interpolate(v, ctx));
  }

  const stepHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(step.headers ?? {})) {
    stepHeaders[k] = interpolate(v, ctx);
  }

  const authRow = dbQueries.getAuthConfig();
  const authConfig: AuthConfig = authRow ? JSON.parse(authRow.config) as AuthConfig : { type: 'none' };
  const { url: authedUrl, headers: authedHeaders } = await applyAuth(urlObj.toString(), stepHeaders, authConfig);

  const noBodyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(step.method.toUpperCase());
  let bodyStr: string | undefined;
  if (!noBodyMethod && step.body !== undefined && step.body !== null) {
    const interpolated = interpolateDeep(step.body, ctx);
    bodyStr = typeof interpolated === 'string' ? interpolated : JSON.stringify(interpolated);
    if (!authedHeaders['Content-Type'] && !authedHeaders['content-type']) {
      authedHeaders['Content-Type'] = 'application/json';
    }
  }

  const start = Date.now();
  const res = await fetch(authedUrl, {
    method: step.method.toUpperCase(),
    headers: authedHeaders,
    ...(bodyStr !== undefined ? { body: bodyStr } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const latency = Date.now() - start;

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { responseHeaders[k] = v; });

  const responseText = await res.text();
  let responseData: unknown;
  try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

  // Extract variables from response
  const extractedVars: Record<string, string> = {};
  for (const ext of step.extract ?? []) {
    const val = resolveJsonPath(responseData, ext.path);
    if (val !== undefined && val !== null) {
      extractedVars[ext.var] = typeof val === 'string' ? val : JSON.stringify(val);
    }
  }

  // Check assertions
  const assertions: Array<{ pass: boolean; message: string }> = [];
  for (const a of step.assert ?? []) {
    if (a.type === 'status') {
      const expected = a.statusCode ?? 200;
      const pass = res.status === expected;
      assertions.push({ pass, message: `HTTP ${res.status} ${pass ? '==' : '!='} ${expected}` });
    } else if (a.type === 'json') {
      const val = resolveJsonPath(responseData, a.path ?? '$');
      if ('eq' in a) {
        const pass = JSON.stringify(val) === JSON.stringify(a.eq);
        assertions.push({ pass, message: `${a.path} ${pass ? '==' : '!='} ${JSON.stringify(a.eq)}` });
      } else if ('contains' in a && typeof val === 'string') {
        const pass = val.includes(a.contains!);
        assertions.push({ pass, message: `${a.path} ${pass ? 'contains' : "doesn't contain"} "${a.contains}"` });
      }
    }
  }

  const pass = assertions.length === 0 ? res.ok : assertions.every(a => a.pass);

  return {
    stepId: step.id,
    label: step.label,
    method: step.method,
    resolvedPath: urlPath,
    requestUrl: authedUrl,
    requestHeaders: authedHeaders,
    requestBody: bodyStr,
    status: res.status,
    statusText: res.statusText,
    responseHeaders,
    latency,
    extractedVars,
    assertions,
    pass,
    responseBody: responseText.slice(0, 10_000),
  };
}

export async function runWorkflow(
  steps: WorkflowStep[],
  emit: EmitFn,
  signal?: AbortSignal,
): Promise<void> {
  const ctx: Record<string, string> = {};
  let passed = 0;

  emit({ type: 'run_start', totalSteps: steps.length });

  for (const step of steps) {
    if (signal?.aborted) {
      emit({ type: 'run_aborted', message: 'Run cancelled' });
      return;
    }

    emit({ type: 'step_start', stepId: step.id, label: step.label, method: step.method, path: step.path });

    try {
      const result = await executeStep(step, ctx);

      // Merge extracted vars into context for subsequent steps
      for (const [k, v] of Object.entries(result.extractedVars)) ctx[k] = v;
      ctx[`${step.id}_status`] = String(result.status ?? '');

      if (result.pass) passed++;

      emit({
        type: 'step_done',
        stepId: result.stepId,
        label: result.label,
        method: result.method,
        resolvedPath: result.resolvedPath,
        requestUrl: result.requestUrl,
        requestHeaders: result.requestHeaders,
        requestBody: result.requestBody,
        status: result.status,
        statusText: result.statusText,
        responseHeaders: result.responseHeaders,
        latency: result.latency,
        extractedVars: result.extractedVars,
        assertions: result.assertions,
        pass: result.pass,
        responseBody: result.responseBody,
      });
    } catch (e) {
      emit({
        type: 'step_error',
        stepId: step.id,
        label: step.label,
        method: step.method,
        path: step.path,
        error: e instanceof Error ? e.message : String(e),
        pass: false,
      });
    }
  }

  emit({ type: 'run_done', totalSteps: steps.length, passedSteps: passed });
}
