// ── HTTP knowledge shared by the explorer ───────────────────────────────────

export const COMMON_HEADERS = [
  'Accept', 'Accept-Charset', 'Accept-Encoding', 'Accept-Language',
  'Authorization', 'Cache-Control', 'Connection', 'Content-Disposition',
  'Content-Encoding', 'Content-Length', 'Content-Type', 'Cookie', 'Date',
  'ETag', 'Expect', 'Forwarded', 'From', 'Host', 'If-Match', 'If-Modified-Since',
  'If-None-Match', 'If-Range', 'If-Unmodified-Since', 'Origin', 'Pragma',
  'Proxy-Authorization', 'Range', 'Referer', 'TE', 'Trailer', 'Transfer-Encoding',
  'Upgrade', 'User-Agent', 'Via', 'Warning', 'X-Api-Key', 'X-CSRF-Token',
  'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Request-ID',
  'X-Requested-With',
];

export const CONTENT_TYPES = [
  'application/json', 'application/xml', 'application/x-www-form-urlencoded',
  'application/octet-stream', 'application/pdf', 'application/zip',
  'application/graphql', 'application/ld+json', 'multipart/form-data',
  'text/plain', 'text/html', 'text/css', 'text/csv', 'text/xml', 'text/yaml',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
];

/** Value suggestions keyed by lowercase header name. */
export const HEADER_VALUE_SUGGESTIONS: Record<string, string[]> = {
  'content-type': CONTENT_TYPES,
  'accept': ['application/json', '*/*', 'application/xml', 'text/html', 'text/plain', 'application/octet-stream'],
  'accept-encoding': ['gzip, deflate, br', 'gzip', 'identity'],
  'authorization': ['Bearer ', 'Basic '],
  'cache-control': ['no-cache', 'no-store', 'max-age=0', 'must-revalidate'],
  'connection': ['keep-alive', 'close'],
  'x-requested-with': ['XMLHttpRequest'],
};

export const RAW_BODY_TYPES: { label: string; mime: string; lang: string }[] = [
  { label: 'Text', mime: 'text/plain', lang: 'text' },
  { label: 'XML', mime: 'application/xml', lang: 'xml' },
  { label: 'YAML', mime: 'text/yaml', lang: 'yaml' },
  { label: 'HTML', mime: 'text/html', lang: 'html' },
  { label: 'JavaScript', mime: 'application/javascript', lang: 'javascript' },
  { label: 'GraphQL', mime: 'application/graphql', lang: 'text' },
];

// ── jq-lite ──────────────────────────────────────────────────────────────────
// Supports the everyday subset of jq: identity, field access, optional access,
// array index/slice, iteration, pipes, and a few functions.
//   .  .foo  .foo.bar  .foo?  .[0]  .foo[2]  .items[]  .items[].name
//   .foo | length   keys   first   last   .[] | .id   .foo[1:3]

type JqStage =
  | { kind: 'field'; name: string; optional: boolean }
  | { kind: 'index'; index: number }
  | { kind: 'slice'; from: number | null; to: number | null }
  | { kind: 'iterate' }
  | { kind: 'fn'; name: string };

const JQ_FNS: Record<string, (v: unknown) => unknown> = {
  length: v => Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v === null ? 0 : 1,
  keys: v => v && typeof v === 'object' ? (Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v).sort()) : err('keys: not an object'),
  values: v => v && typeof v === 'object' ? Object.values(v) : err('values: not an object'),
  first: v => Array.isArray(v) ? v[0] : err('first: not an array'),
  last: v => Array.isArray(v) ? v[v.length - 1] : err('last: not an array'),
  reverse: v => Array.isArray(v) ? [...v].reverse() : err('reverse: not an array'),
  sort: v => Array.isArray(v) ? [...v].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1) : err('sort: not an array'),
  unique: v => Array.isArray(v) ? [...new Map(v.map(x => [JSON.stringify(x), x])).values()] : err('unique: not an array'),
  type: v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v,
  tostring: v => typeof v === 'string' ? v : JSON.stringify(v),
  not: v => !v,
};

function err(msg: string): never { throw new Error(msg); }

function parseSegment(seg: string): JqStage[] {
  // One pipe segment, e.g. ".items[2].name?" or "length"
  seg = seg.trim();
  if (!seg || seg === '.') return [];
  if (JQ_FNS[seg]) return [{ kind: 'fn', name: seg }];
  if (!seg.startsWith('.')) throw new Error(`Unsupported expression: "${seg}"`);

  const stages: JqStage[] = [];
  let i = 1;
  while (i < seg.length) {
    const ch = seg[i]!;
    if (ch === '.') { i++; continue; }
    if (ch === '[') {
      const close = seg.indexOf(']', i);
      if (close === -1) throw new Error('Unclosed [');
      const inner = seg.slice(i + 1, close).trim();
      if (inner === '') stages.push({ kind: 'iterate' });
      else if (inner.includes(':')) {
        const [a = '', b = ''] = inner.split(':');
        stages.push({ kind: 'slice', from: a.trim() ? parseInt(a, 10) : null, to: b.trim() ? parseInt(b, 10) : null });
      } else if (/^-?\d+$/.test(inner)) stages.push({ kind: 'index', index: parseInt(inner, 10) });
      else if (/^"(.*)"$/.test(inner)) stages.push({ kind: 'field', name: inner.slice(1, -1), optional: false });
      else throw new Error(`Bad index: [${inner}]`);
      i = close + 1;
      continue;
    }
    // field name
    let j = i;
    while (j < seg.length && /[\w$-]/.test(seg[j]!)) j++;
    if (j === i) throw new Error(`Unexpected "${seg[i]}" in "${seg}"`);
    const name = seg.slice(i, j);
    let optional = false;
    if (seg[j] === '?') { optional = true; j++; }
    stages.push({ kind: 'field', name, optional });
    i = j;
  }
  return stages;
}

function applyStage(values: unknown[], stage: JqStage): unknown[] {
  const out: unknown[] = [];
  for (const v of values) {
    switch (stage.kind) {
      case 'field': {
        if (v === null || v === undefined) { out.push(null); break; }
        if (typeof v !== 'object' || Array.isArray(v)) {
          if (stage.optional) break;
          throw new Error(`Cannot index ${Array.isArray(v) ? 'array' : typeof v} with "${stage.name}"`);
        }
        out.push((v as Record<string, unknown>)[stage.name] ?? null);
        break;
      }
      case 'index': {
        if (!Array.isArray(v)) throw new Error(`Cannot index ${typeof v} with number`);
        out.push(v[stage.index < 0 ? v.length + stage.index : stage.index] ?? null);
        break;
      }
      case 'slice': {
        if (!Array.isArray(v)) throw new Error('Cannot slice non-array');
        out.push(v.slice(stage.from ?? 0, stage.to ?? undefined));
        break;
      }
      case 'iterate': {
        if (Array.isArray(v)) out.push(...v);
        else if (v && typeof v === 'object') out.push(...Object.values(v));
        else throw new Error(`Cannot iterate over ${v === null ? 'null' : typeof v}`);
        break;
      }
      case 'fn':
        out.push(JQ_FNS[stage.name]!(v));
        break;
    }
  }
  return out;
}

/**
 * Evaluate a jq-style filter against parsed JSON.
 * Returns the result value; multiple outputs (from iteration) come back as an array.
 * Throws with a readable message on bad syntax / type mismatch.
 */
export function jqFilter(data: unknown, expr: string): unknown {
  const segments = expr.split('|');
  let values: unknown[] = [data];
  let iterated = false;
  for (const seg of segments) {
    const stages = parseSegment(seg);
    for (const stage of stages) {
      if (stage.kind === 'iterate') iterated = true;
      values = applyStage(values, stage);
    }
  }
  if (!iterated && values.length === 1) return values[0];
  return values;
}

// ── JSON Schema generation ───────────────────────────────────────────────────

function detectFormat(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return 'date-time';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'email';
  if (/^https?:\/\//.test(s)) return 'uri';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'uuid';
  return null;
}

function schemaOf(value: unknown, depth: number): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (!value.length) return { type: 'array', items: {} };
    // Merge the first few items so heterogeneous arrays still get useful schemas
    const sample = value.slice(0, 10).map(v => schemaOf(v, depth + 1));
    const types = [...new Set(sample.map(s => JSON.stringify(s.type)))];
    return { type: 'array', items: types.length === 1 ? sample[0]! : { anyOf: dedupeSchemas(sample) } };
  }
  switch (typeof value) {
    case 'string': {
      const format = detectFormat(value);
      return format ? { type: 'string', format } : { type: 'string' };
    }
    case 'number':
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const obj = value as Record<string, unknown>;
      const properties: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) properties[k] = schemaOf(v, depth + 1);
      return { type: 'object', properties, required: Object.keys(obj) };
    }
    default:
      return {};
  }
}

function dedupeSchemas(schemas: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...new Map(schemas.map(s => [JSON.stringify(s), s])).values()];
}

/** Infer a JSON Schema (draft 2020-12) from a sample value. */
export function generateJsonSchema(value: unknown): Record<string, unknown> {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', ...schemaOf(value, 0) };
}
