import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';
import { cacheGet, cacheSet } from '../lib/cache';
import { JsonViewer } from '../components/JsonViewer';
import {
  Search, Plus, X, Send, Copy, Check, ChevronRight, ChevronDown,
  RotateCcw, Download, Bot,
} from 'lucide-react';

export const Route = createFileRoute('/explorer')({ component: ExplorerPage });

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedParameter {
  name: string; in: string; required: boolean;
  schema: Record<string, unknown>; description?: string;
}
interface ParsedRequestBody {
  required: boolean; contentType: string;
  schema: Record<string, unknown>; description?: string;
}
interface ParsedOperation {
  operationId: string; method: string; path: string;
  summary?: string; description?: string; tags: string[];
  parameters: ParsedParameter[]; requestBody?: ParsedRequestBody;
  responses: Record<string, unknown>;
}
interface KVRow { key: string; value: string; enabled: boolean; }
interface ResponseResult {
  status: number; statusText: string; headers: Record<string, string>;
  body: string; latency: number; size: number; error?: string;
}
interface RequestTab {
  id: string; title: string; method: string; url: string;
  params: KVRow[]; headers: KVRow[]; body: string;
  bodyType: 'none' | 'json' | 'form' | 'raw';
  response: ResponseResult | null; loading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const MC: Record<string, string> = {
  GET: 'var(--method-get)', POST: 'var(--method-post)', PUT: 'var(--method-put)',
  PATCH: '#a855f7', DELETE: 'var(--method-delete)', HEAD: 'var(--method-head)',
};

// counter-based IDs (deterministic, no Math.random)
let _seq = 0;
function uid() { return String(++_seq); }

function blankTab(overrides?: Partial<RequestTab>): RequestTab {
  return {
    id: uid(), title: 'New Request', method: 'GET', url: '',
    params: [{ key: '', value: '', enabled: true }],
    headers: [{ key: '', value: '', enabled: true }],
    body: '', bodyType: 'none', response: null, loading: false,
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function buildUrl(base: string, params: KVRow[]): string {
  const active = params.filter(p => p.enabled && p.key);
  if (!active.length) return base;
  try {
    const url = new URL(base.startsWith('http') ? base : 'http://x/' + base.replace(/^\//, ''));
    active.forEach(p => url.searchParams.append(p.key, p.value));
    return base.startsWith('http') ? url.toString() : url.pathname + url.search;
  } catch {
    return base + '?' + active.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  }
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function scClass(s: number) {
  if (s < 300) return 'status-ok';
  if (s < 400) return 'status-redir';
  if (s < 500) return 'status-err';
  return 'status-fatal';
}

function schemaToExample(s: Record<string, unknown>): unknown {
  if (!s) return {};
  const t = s.type as string;
  if (t === 'string') return (s.enum as string[])?.[0] ?? '';
  if (t === 'number' || t === 'integer') return 0;
  if (t === 'boolean') return false;
  if (t === 'array') return [schemaToExample((s.items as Record<string, unknown>) ?? {})];
  if (t === 'object' || s.properties) {
    const props = (s.properties as Record<string, unknown>) ?? {};
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) r[k] = schemaToExample(v as Record<string, unknown>);
    return r;
  }
  return null;
}

// ── KV Table ───────────────────────────────────────────────────────────────
function KVTable({ rows, onChange, ph = ['Key', 'Value'] }: {
  rows: KVRow[]; onChange: (r: KVRow[]) => void; ph?: [string, string];
}) {
  const upd = (i: number, field: keyof KVRow, val: string | boolean) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    if (i === rows.length - 1 && field !== 'enabled' && val) {
      next.push({ key: '', value: '', enabled: true });
    }
    onChange(next);
  };

  return (
    <div style={{ fontSize: 12 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
          <input
            type="checkbox" checked={row.enabled}
            onChange={e => upd(i, 'enabled', e.target.checked)}
            style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
          />
          <input
            className="input"
            style={{ flex: 1, height: 26, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
            placeholder={ph[0]} value={row.key}
            onChange={e => upd(i, 'key', e.target.value)}
          />
          <input
            className="input"
            style={{ flex: 2, height: 26, fontSize: 12 }}
            placeholder={ph[1]} value={row.value}
            onChange={e => upd(i, 'value', e.target.value)}
          />
          {rows.length > 1 && (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              style={{ flexShrink: 0, color: 'var(--text-3)' }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Endpoint Tree ──────────────────────────────────────────────────────────
function EndpointTree({ ops, onSelect, activeId }: {
  ops: ParsedOperation[]; onSelect: (op: ParsedOperation) => void; activeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = ops.filter(op =>
    !search ||
    op.path.toLowerCase().includes(search.toLowerCase()) ||
    (op.summary ?? '').toLowerCase().includes(search.toLowerCase()) ||
    op.operationId.toLowerCase().includes(search.toLowerCase())
  );

  const groups: Record<string, ParsedOperation[]> = {};
  for (const op of filtered) {
    const tag = op.tags[0] ?? 'default';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(op);
  }

  const toggle = (tag: string) => setCollapsed(c => ({ ...c, [tag]: !c[tag] }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 28, height: 28, fontSize: 12 }}
            placeholder="Search endpoints…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, paddingLeft: 2 }}>
          {filtered.length} of {ops.length} endpoints
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {Object.entries(groups).map(([tag, tagOps]) => (
          <div key={tag}>
            <button
              onClick={() => toggle(tag)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'inherit' }}
            >
              {collapsed[tag] ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              {tag}
              <span style={{ marginLeft: 'auto', background: 'var(--bg-subtle)', borderRadius: 3, padding: '0 4px', fontSize: 10 }}>
                {tagOps.length}
              </span>
            </button>
            {!collapsed[tag] && tagOps.map(op => (
              <button
                key={op.operationId}
                onClick={() => onSelect(op)}
                className={`endpoint-item${activeId === op.operationId ? ' active' : ''}`}
              >
                <span className={`method-badge method-${op.method.toUpperCase()}`}>
                  {op.method.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, color: activeId === op.operationId ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {op.path}
                </span>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={22} />
            <span style={{ fontSize: 12 }}>No endpoints found</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Response Panel ─────────────────────────────────────────────────────────
function ResponsePanel({ response, loading }: { response: ResponseResult | null; loading: boolean }) {
  const [view, setView] = useState<'body' | 'headers'>('body');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-3)' }}>
        <span className="spinner" />
        <span style={{ fontSize: 13 }}>Sending request…</span>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="empty-state">
        <Send size={28} />
        <div style={{ fontSize: 13, fontWeight: 500 }}>Send a request to see the response</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Enter a URL above and press Send</div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div style={{ flex: 1, padding: 16 }}>
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Request failed</div>
          <pre style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {response.error}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Meta bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 36, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <span className={scClass(response.status)} style={{ fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono,monospace' }}>
          {response.status} {response.statusText}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{response.latency}ms</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtSize(response.size)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={copy} title="Copy">
            {copied ? <Check size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
          </button>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(response.body)}`}
            download="response.txt"
            className="btn btn-ghost btn-sm btn-icon"
            title="Download"
          >
            <Download size={12} />
          </a>
        </div>
      </div>
      {/* Sub-tabs */}
      <div className="sub-tab-bar" style={{ flexShrink: 0, paddingLeft: 8 }}>
        {(['body', 'headers'] as const).map(v => (
          <button key={v} className={`sub-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            {v === 'body' ? 'Body' : `Headers (${Object.keys(response.headers).length})`}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {view === 'body' && <JsonViewer text={response.body} />}
        {view === 'headers' && (
          <div style={{ padding: 12 }}>
            {Object.entries(response.headers).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'var(--text-2)', minWidth: 200, flexShrink: 0 }}>{k}</span>
                <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
function ExplorerPage() {
  const [tabs, setTabs] = useState<RequestTab[]>(() => [blankTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [operations, setOperations] = useState<ParsedOperation[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [activeOpId, setActiveOpId] = useState<string | undefined>();
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');
  const [splitPct, setSplitPct] = useState(0.45);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const tab = tabs.find(t => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    apiClient<{ spec: { baseUrl: string } }>('/api/status')
      .then(s => setBaseUrl(s.spec.baseUrl))
      .catch(() => {});
    // Load from cache first for instant render
    cacheGet<ParsedOperation[]>('spec_endpoints').then(cached => {
      if (cached && operations.length === 0) setOperations(cached);
    });
    // Then fetch fresh data
    apiClient<ParsedOperation[]>('/api/spec/endpoints')
      .then(ops => {
        setOperations(ops);
        if (ops.length > 0) cacheSet('spec_endpoints', ops, 600_000);
      })
      .catch(() => {});
  }, []);

  // Listen for Cmd+K endpoint selection from command palette
  useEffect(() => {
    const handler = (e: Event) => {
      const op = (e as CustomEvent<ParsedOperation>).detail;
      if (op) openEndpoint(op);
    };
    window.addEventListener('cmd-open-endpoint', handler);
    return () => window.removeEventListener('cmd-open-endpoint', handler);
  // openEndpoint references baseUrl/operations which change; use a ref to avoid stale closure issues
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, operations]);

  const upd = useCallback((id: string, patch: Partial<RequestTab>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const addTab = () => {
    const t = blankTab();
    setTabs(p => [...p, t]);
    setActiveId(t.id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(p => {
      const next = p.filter(t => t.id !== id);
      if (!next.length) { const t = blankTab(); return [t]; }
      return next;
    });
    if (activeId === id) {
      const idx = tabs.findIndex(t => t.id === id);
      const fallback = tabs[Math.max(0, idx - 1)];
      if (fallback && fallback.id !== id) setActiveId(fallback.id);
    }
  };

  const openEndpoint = (op: ParsedOperation) => {
    setActiveOpId(op.operationId);
    const url = (baseUrl + op.path).replace(/([^:])\/\//g, '$1/');
    const qp: KVRow[] = op.parameters
      .filter(p => p.in === 'query')
      .map(p => ({ key: p.name, value: '', enabled: true }));
    const hdrs: KVRow[] = [{ key: '', value: '', enabled: true }];
    if (op.requestBody) hdrs.unshift({ key: 'Content-Type', value: op.requestBody.contentType, enabled: true });

    let body = '';
    let bodyType: RequestTab['bodyType'] = 'none';
    if (op.requestBody) {
      bodyType = op.requestBody.contentType.includes('json') ? 'json' : 'raw';
      body = bodyType === 'json' ? JSON.stringify(schemaToExample(op.requestBody.schema), null, 2) : '';
    }

    const t = blankTab({
      title: op.summary ?? op.path,
      method: op.method.toUpperCase(),
      url,
      params: [...qp, { key: '', value: '', enabled: true }],
      headers: hdrs,
      body, bodyType,
    });
    setTabs(p => [...p, t]);
    setActiveId(t.id);
    if (op.requestBody || qp.length) setReqTab(op.requestBody ? 'body' : 'params');
  };

  const send = async () => {
    if (!tab.url) return;
    upd(tab.id, { loading: true, response: null });
    const url = buildUrl(tab.url, tab.params);
    const hdrs: Record<string, string> = {};
    for (const h of tab.headers) { if (h.enabled && h.key) hdrs[h.key] = h.value; }
    if (tab.bodyType === 'json' && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/json';
    const body = tab.bodyType === 'none' ? undefined : tab.body || undefined;

    try {
      const r = await apiClient<{
        status: number; statusText?: string; headers: Record<string, string>;
        body: string; latency: number; error?: string;
      }>('/api/explorer/request', {
        method: 'POST',
        body: JSON.stringify({ method: tab.method, url, headers: hdrs, body }),
      });
      upd(tab.id, {
        loading: false,
        response: r.error
          ? { status: 0, statusText: '', headers: {}, body: '', latency: r.latency ?? 0, size: 0, error: r.error }
          : { status: r.status, statusText: r.statusText ?? '', headers: r.headers, body: r.body, latency: r.latency, size: new Blob([r.body]).size },
      });
    } catch (e) {
      upd(tab.id, { loading: false, response: { status: 0, statusText: '', headers: {}, body: '', latency: 0, size: 0, error: String(e) } });
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSplitPct(Math.max(0.2, Math.min(0.8, (ev.clientY - rect.top) / rect.height)));
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(tab.method);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Endpoint tree */}
      <div style={{ width: 260, minWidth: 260, background: 'var(--sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="section-label" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          Endpoints
        </div>
        {operations.length > 0
          ? <EndpointTree ops={operations} onSelect={openEndpoint} activeId={activeOpId} />
          : <div className="empty-state"><span style={{ fontSize: 12 }}>No spec loaded</span></div>}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab bar */}
        <div className="tab-bar" style={{ flexShrink: 0 }}>
          {tabs.map(t => (
            <div
              key={t.id}
              className={`tab-item${t.id === activeId ? ' active' : ''}`}
              onClick={() => setActiveId(t.id)}
            >
              <span className={`method-badge method-${t.method}`} style={{ fontSize: 9, padding: '0 4px' }}>
                {t.method}
              </span>
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <button
                onClick={e => closeTab(t.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', borderRadius: 3 }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button className="tab-item" onClick={addTab} style={{ color: 'var(--text-3)', padding: '0 10px' }}>
            <Plus size={14} />
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 6 }}>
            <Link to="/ai" style={{ textDecoration: 'none' }}>
              <button className="btn btn-ghost btn-sm" style={{ gap: 5, fontSize: 11 }}>
                <Bot size={12} />
                AI
              </button>
            </Link>
          </div>
        </div>

        {/* Resizable request/response split */}
        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Request builder */}
          <div style={{ height: `${splitPct * 100}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* URL bar */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--background)', alignItems: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <select
                  className="select"
                  value={tab.method}
                  onChange={e => upd(tab.id, { method: e.target.value })}
                  style={{ paddingRight: 8, fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: 12, color: MC[tab.method] ?? 'var(--text)', width: 100 }}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <input
                className="input"
                style={{ flex: 1, fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}
                placeholder="https://api.example.com/endpoint"
                value={tab.url}
                onChange={e => upd(tab.id, { url: e.target.value, title: e.target.value || 'New Request' })}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
              />
              <button
                className="btn btn-primary"
                style={{ flexShrink: 0, gap: 6 }}
                onClick={send}
                disabled={tab.loading || !tab.url}
              >
                {tab.loading ? <span className="spinner" /> : <Send size={13} />}
                Send
              </button>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => upd(tab.id, { response: null, url: '', title: 'New Request', params: [{ key: '', value: '', enabled: true }], headers: [{ key: '', value: '', enabled: true }], body: '', bodyType: 'none' })}
                title="Clear"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="sub-tab-bar" style={{ flexShrink: 0, paddingLeft: 8 }}>
              {(['params', 'headers', 'body', 'auth'] as const).map(v => {
                if (v === 'body' && !hasBody) return null;
                const cnt = v === 'params' ? tab.params.filter(p => p.key).length
                  : v === 'headers' ? tab.headers.filter(h => h.key).length : 0;
                return (
                  <button key={v} className={`sub-tab${reqTab === v ? ' active' : ''}`} onClick={() => setReqTab(v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                    {cnt > 0 && (
                      <span style={{ marginLeft: 4, background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 700 }}>
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sub-tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: reqTab !== 'body' ? 10 : 0 }}>
              {reqTab === 'params' && (
                <KVTable rows={tab.params} onChange={p => upd(tab.id, { params: p })} ph={['Parameter', 'Value']} />
              )}
              {reqTab === 'headers' && (
                <KVTable rows={tab.headers} onChange={h => upd(tab.id, { headers: h })} ph={['Header', 'Value']} />
              )}
              {reqTab === 'body' && hasBody && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                    {(['none', 'json', 'form', 'raw'] as const).map(bt => (
                      <button
                        key={bt}
                        className="btn btn-ghost btn-sm"
                        onClick={() => upd(tab.id, { bodyType: bt })}
                        style={tab.bodyType === bt ? { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' } : {}}
                      >
                        {bt === 'none' ? 'None' : bt === 'json' ? 'JSON' : bt === 'form' ? 'Form' : 'Raw'}
                      </button>
                    ))}
                  </div>
                  {tab.bodyType !== 'none' ? (
                    <textarea
                      className="textarea"
                      style={{ flex: 1, borderRadius: 0, border: 'none', resize: 'none', fontSize: 12 }}
                      placeholder={tab.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body…'}
                      value={tab.body}
                      onChange={e => upd(tab.id, { body: e.target.value })}
                    />
                  ) : (
                    <div className="empty-state"><span style={{ fontSize: 12 }}>No body</span></div>
                  )}
                </div>
              )}
              {reqTab === 'auth' && (
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  Using global auth config.{' '}
                  <a href="/auth" style={{ color: 'var(--accent)' }}>Configure →</a>
                </div>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className={`resize-handle-y${dragging ? ' dragging' : ''}`}
            onMouseDown={startResize}
          />

          {/* Response panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
            <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
              Response
            </div>
            <ResponsePanel response={tab.response} loading={tab.loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
