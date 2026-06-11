import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../lib/api';
import { useApp } from '../context';
import { Trash2, Pause, Play, Terminal, Copy, Check, ExternalLink, ChevronDown, ChevronRight, Radio, Plus, X, Bot, Clock, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

interface CaptureBin { id: string; name: string; created_at: number; }
export const Route = createFileRoute('/logs')({ component: LogsPage });

interface LogEntry {
  id: string; source: string; tool_name: string | null;
  method: string; url: string; status_code: number | null;
  request_body: string | null; response_body: string | null;
  request_headers: string | null; response_headers: string | null;
  latency_ms: number | null; error: string | null; created_at: number;
}
interface CtxMenu { x: number; y: number; log: LogEntry }

// ── Constants ──────────────────────────────────────────────────────────────────
const METHOD_COLOR: Record<string, string> = {
  GET: '#22c55e', POST: '#60a5fa', PUT: '#f59e0b',
  PATCH: '#a78bfa', DELETE: '#f87171', HEAD: '#64748b', OPTIONS: '#64748b',
};

const HTTP_STATUS: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 408: 'Timeout',
  409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Server Error', 502: 'Bad Gateway', 503: 'Unavailable', 504: 'Gateway Timeout',
};

const SOURCE_STYLE: Record<string, { bg: string; color: string }> = {
  mcp:      { bg: 'rgba(129,140,248,0.12)', color: '#818cf8' },
  ai:       { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
  explorer: { bg: 'rgba(96,165,250,0.10)',  color: '#60a5fa' },
  capture:  { bg: 'rgba(34,197,94,0.10)',   color: '#22c55e' },
};

function statusColor(s: number | null) {
  if (!s) return 'var(--muted-foreground)';
  if (s < 300) return '#22c55e';
  if (s < 400) return '#f59e0b';
  if (s < 500) return '#f87171';
  return '#dc2626';
}

function latencyColor(ms: number) {
  if (ms < 150) return '#22c55e';
  if (ms < 500) return '#a3e635';
  if (ms < 1200) return '#f59e0b';
  return '#f87171';
}

function fmtSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function trunc(s: string, n = 76) {
  try { const u = new URL(s); s = u.pathname + u.search; } catch { /**/ }
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtTs(ts: number) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function logToCurl(log: LogEntry): string {
  let cmd = `curl -X ${(log.method ?? 'GET').toUpperCase()}`;
  try {
    const hdrs = JSON.parse(log.request_headers ?? '{}') as Record<string, string>;
    for (const [k, v] of Object.entries(hdrs)) {
      if (!['host', 'content-length', 'transfer-encoding'].includes(k.toLowerCase()))
        cmd += ` \\\n  -H '${k}: ${v.replace(/'/g, "'\\''")}'`;
    }
  } catch { /**/ }
  if (log.request_body) cmd += ` \\\n  -d '${log.request_body.replace(/'/g, "'\\''")}'`;
  cmd += ` \\\n  '${log.url}'`;
  return cmd;
}

function openLogInExplorer(log: LogEntry, navigate: ReturnType<typeof useNavigate>) {
  let parsedHeaders: Record<string, string> = {};
  try { parsedHeaders = JSON.parse(log.request_headers ?? '{}'); } catch { /**/ }
  const kvHeaders = Object.entries(parsedHeaders)
    .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
    .map(([key, value]) => ({ key, value, enabled: true }));
  sessionStorage.setItem('explorer_pending_log', JSON.stringify({
    method: (log.method ?? 'GET').toUpperCase(), url: log.url,
    headers: kvHeaders, body: log.request_body ?? '',
    body_type: log.request_body ? 'json' : 'none', title: log.url,
  }));
  void navigate({ to: '/explorer' });
}

// ── JSON syntax highlighting ───────────────────────────────────────────────────
type JTok = { t: 'key' | 'str' | 'num' | 'bool' | 'null' | 'punct' | 'ws'; v: string };

function tokenizeJson(src: string): JTok[] {
  const out: JTok[] = [];
  let i = 0;
  while (i < src.length) {
    // whitespace
    if (/\s/.test(src[i])) {
      let j = i; while (j < src.length && /\s/.test(src[j])) j++;
      out.push({ t: 'ws', v: src.slice(i, j) }); i = j; continue;
    }
    // string
    if (src[i] === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '"') { j++; break; }
        j++;
      }
      const str = src.slice(i, j);
      // peek past whitespace for colon → key
      let k = j; while (k < src.length && /\s/.test(src[k])) k++;
      out.push({ t: src[k] === ':' ? 'key' : 'str', v: str }); i = j; continue;
    }
    // number
    if (/[-0-9]/.test(src[i])) {
      let j = i; while (j < src.length && /[-0-9.eE+]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
    }
    // keywords
    let kwMatched = false;
    for (const kw of ['true', 'false', 'null'] as const) {
      if (src.startsWith(kw, i)) {
        out.push({ t: kw === 'null' ? 'null' : 'bool', v: kw }); i += kw.length; kwMatched = true; break;
      }
    }
    if (kwMatched) continue;
    // punctuation / fallback
    out.push({ t: 'punct', v: src[i] }); i++;
  }
  return out;
}

const J_COLORS: Record<JTok['t'], string | undefined> = {
  key:   '#60a5fa',
  str:   '#86efac',
  num:   '#fb923c',
  bool:  '#c084fc',
  null:  '#f87171',
  punct: undefined,
  ws:    undefined,
};

function JsonHighlight({ code }: { code: string }) {
  const tokens = useMemo(() => tokenizeJson(code), [code]);
  return (
    <>
      {tokens.map((tok, i) => {
        const color = J_COLORS[tok.t];
        return color
          ? <span key={i} style={{ color }}>{tok.v}</span>
          : tok.v;
      })}
    </>
  );
}

// ── BodyBlock ─────────────────────────────────────────────────────────────────
function BodyBlock({ body }: { body: string | null }) {
  if (!body) return <p className="py-2 text-[11.5px] italic text-[var(--placeholder-foreground)]">No body</p>;
  let pretty = body;
  let isJson = false;
  try { pretty = JSON.stringify(JSON.parse(body), null, 2); isJson = true; } catch { /**/ }
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] p-3 font-mono text-[11.5px] leading-[1.7] whitespace-pre-wrap break-all">
      {isJson ? <JsonHighlight code={pretty} /> : pretty}
    </pre>
  );
}

// ── LogDetail ─────────────────────────────────────────────────────────────────
function LogDetail({ log, onOpenInExplorer, copy, copied }: {
  log: LogEntry; onOpenInExplorer: () => void;
  copy: (text: string, key: string) => void; copied: string | null;
}) {
  const [tab, setTab] = useState<'response' | 'request'>('response');

  let resHdrs: Record<string, string> = {};
  let reqHdrs: Record<string, string> = {};
  try { resHdrs = JSON.parse(log.response_headers ?? '{}'); } catch { /**/ }
  try { reqHdrs = JSON.parse(log.request_headers ?? '{}'); } catch { /**/ }

  const ph = tab === 'response' ? resHdrs : reqHdrs;
  const body = tab === 'response' ? log.response_body : log.request_body;
  const bodyBytes = body ? new Blob([body]).size : 0;
  const contentType = resHdrs['content-type']?.split(';')[0]?.trim() ?? '';
  const ms = log.latency_ms ?? 0;
  const ss = SOURCE_STYLE[log.source] ?? { bg: 'var(--elevated)', color: 'var(--muted-foreground)' };
  const isAi = log.source === 'mcp' || log.source === 'ai';

  return (
    <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_1.5%,transparent)]">

      {/* ── Meta strip ── */}
      <div className="px-5 py-3 border-b border-[var(--border)] flex flex-col gap-2.5">

        {/* Row 1: status · source · tool · error · actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {log.status_code != null && (
            <div className="flex items-center gap-1.5 mr-1">
              <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: statusColor(log.status_code) }}>
                {log.status_code}
              </span>
              {HTTP_STATUS[log.status_code] && (
                <span className="text-[11.5px] text-[var(--muted-foreground)]">{HTTP_STATUS[log.status_code]}</span>
              )}
            </div>
          )}
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: ss.bg, color: ss.color }}>
            {log.source}
          </span>
          {isAi && log.tool_name && (
            <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border border-[rgba(129,140,248,0.2)] bg-[rgba(129,140,248,0.07)] text-[#818cf8]">
              <Bot size={9} />{log.tool_name}
            </span>
          )}
          {log.error && (
            <span className="rounded px-1.5 py-0.5 text-[10.5px] text-[var(--destructive)] bg-[rgba(239,68,68,0.08)] truncate max-w-[260px]">
              {log.error}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={onOpenInExplorer}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer">
              <Terminal size={10} />Open in Explorer
            </button>
            <button type="button" onClick={() => copy(log.url, 'det-url')}
              className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer">
              {copied === 'det-url' ? <Check size={10} /> : <Copy size={10} />}
              {copied === 'det-url' ? 'Copied' : 'URL'}
            </button>
            <button type="button" onClick={() => copy(logToCurl(log), 'det-curl')}
              className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer">
              {copied === 'det-curl' ? <Check size={10} /> : <ExternalLink size={10} />}
              cURL
            </button>
          </div>
        </div>

        {/* Row 2: timing stats */}
        <div className="flex items-center gap-5 flex-wrap">
          {log.latency_ms != null && (
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-[var(--placeholder-foreground)]" />
              <span className="text-[10px] font-medium text-[var(--placeholder-foreground)] uppercase tracking-wide">Latency</span>
              <span className="font-mono text-[11.5px] font-semibold tabular-nums" style={{ color: latencyColor(ms) }}>{fmtMs(ms)}</span>
            </div>
          )}
          {bodyBytes > 0 && (
            <div className="flex items-center gap-1.5">
              <HardDrive size={10} className="text-[var(--placeholder-foreground)]" />
              <span className="text-[10px] font-medium text-[var(--placeholder-foreground)] uppercase tracking-wide">Size</span>
              <span className="font-mono text-[11.5px] text-[var(--foreground-secondary)]">{fmtSize(bodyBytes)}</span>
            </div>
          )}
          {contentType && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-[var(--placeholder-foreground)] uppercase tracking-wide">Type</span>
              <span className="font-mono text-[11px] text-[var(--foreground-secondary)]">{contentType}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs + content ── */}
      <div className="px-5 pt-3 pb-4">
        <div className="flex gap-1 border-b border-[var(--border)] mb-3">
          {(['response', 'request'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn(
                'relative px-3 py-1.5 text-[12px] font-medium capitalize transition-colors cursor-pointer border-0 bg-transparent',
                tab === t ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}>
              {t}
              {tab === t && <span className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-t-full bg-[var(--foreground)]" />}
            </button>
          ))}
        </div>

        {/* Headers */}
        {Object.keys(ph).length > 0 && (
          <div className="mb-3 rounded-lg border border-[var(--border)] overflow-hidden text-[11px]">
            {Object.entries(ph).map(([k, v], i) => (
              <div key={k} className={cn('flex min-h-[28px]', i > 0 && 'border-t border-[var(--border)]')}>
                <span className="w-[200px] shrink-0 font-mono text-[var(--muted-foreground)] truncate px-3 py-1.5 bg-[color-mix(in_srgb,var(--foreground)_2.5%,transparent)] border-r border-[var(--border)] flex items-center">
                  {k}
                </span>
                <span className="flex-1 px-3 py-1.5 text-[var(--foreground-secondary)] break-all flex items-center">{v}</span>
              </div>
            ))}
          </div>
        )}

        <BodyBlock body={body} />
      </div>
    </div>
  );
}

// ── LogsPage ──────────────────────────────────────────────────────────────────
function LogsPage() {
  const navigate = useNavigate();
  const { wsConnected } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mcp' | 'explorer' | 'capture' | 'error'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [bins, setBins] = useState<CaptureBin[]>([]);
  const [binsOpen, setBinsOpen] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    apiClient<LogEntry[]>('/api/logs?limit=100').then(initial => {
      setLogs(prev => {
        const seen = new Set(prev.map(l => l.id));
        return [...prev, ...initial.filter(l => !seen.has(l.id))].slice(0, 500);
      });
    }).catch(() => {});
    apiClient<CaptureBin[]>('/api/capture/bins').then(setBins).catch(() => {});
    const handler = (e: Event) => {
      if (pausedRef.current) return;
      const m = (e as CustomEvent<LogEntry>).detail;
      setLogs(p => p.some(l => l.id === m.id) ? p : [m, ...p].slice(0, 500));
    };
    window.addEventListener('cli-log', handler);
    return () => window.removeEventListener('cli-log', handler);
  }, []);

  const clear = async () => { await apiClient('/api/logs', { method: 'DELETE' }); setLogs([]); };

  const createBin = async () => {
    const name = prompt('Bin name (optional):') ?? '';
    const bin = await apiClient<CaptureBin>('/api/capture/bins', { method: 'POST', body: JSON.stringify({ name }) });
    setBins(prev => [bin, ...prev]);
    setBinsOpen(true);
  };

  const deleteBin = async (id: string) => {
    await apiClient(`/api/capture/bins/${id}`, { method: 'DELETE' });
    setBins(prev => prev.filter(b => b.id !== id));
  };

  const binUrl = (id: string) => `${window.location.origin}/c/${id}`;
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  const filtered = logs.filter(l => {
    if (filter === 'mcp')     return l.source === 'mcp';
    if (filter === 'explorer') return l.source === 'explorer';
    if (filter === 'capture') return l.source === 'capture';
    if (filter === 'error')   return !!(l.error || (l.status_code !== null && l.status_code >= 400));
    return true;
  });

  const FILTERS = ['all', 'mcp', 'explorer', 'capture', 'error'] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[1999]" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-[2000] min-w-[168px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] py-1 shadow-xl" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] transition-colors cursor-pointer" onClick={() => { openLogInExplorer(ctxMenu.log, navigate); setCtxMenu(null); }}>
              <Terminal size={12} />Open in Explorer
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] transition-colors cursor-pointer" onClick={() => { copy(ctxMenu.log.url, 'url'); setCtxMenu(null); }}>
              {copied === 'url' ? <Check size={12} /> : <Copy size={12} />}Copy URL
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] transition-colors cursor-pointer" onClick={() => { copy(logToCurl(ctxMenu.log), 'curl'); setCtxMenu(null); }}>
              {copied === 'curl' ? <Check size={12} /> : <ExternalLink size={12} />}Copy as cURL
            </button>
            {ctxMenu.log.request_body && (
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] transition-colors cursor-pointer" onClick={() => { copy(ctxMenu.log.request_body!, 'body'); setCtxMenu(null); }}>
                {copied === 'body' ? <Check size={12} /> : <Copy size={12} />}Copy Request Body
              </button>
            )}
            {ctxMenu.log.response_body && (
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] transition-colors cursor-pointer" onClick={() => { copy(ctxMenu.log.response_body!, 'resp'); setCtxMenu(null); }}>
                {copied === 'resp' ? <Check size={12} /> : <Copy size={12} />}Copy Response Body
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full" style={{
            background: wsConnected ? '#22c55e' : '#f59e0b',
            boxShadow: wsConnected ? '0 0 5px rgba(34,197,94,0.5)' : 'none',
          }} />
          <span className="text-[13px] font-semibold text-[var(--foreground)]">Logs</span>
          <span className="text-[11px] text-[var(--muted-foreground)]">{wsConnected ? 'live' : 'reconnecting…'}</span>
        </div>

        <span className="h-4 w-px bg-[var(--border)]" />

        {/* Filters */}
        <div className="flex gap-0.5">
          {FILTERS.map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors cursor-pointer border-0 font-sans',
                filter === f
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)]'
                  : 'border border-transparent text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground-secondary)] bg-transparent',
              )}>
              {f}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={createBin}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[11.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer font-sans">
            <Radio size={11} />Capture URL
          </button>
          <button type="button" onClick={() => setPaused(p => !p)}
            className={cn(
              'flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11.5px] transition-colors cursor-pointer font-sans',
              paused
                ? 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)]',
            )}>
            {paused ? <><Play size={11} />Resume</> : <><Pause size={11} />Pause</>}
          </button>
          <button type="button" onClick={clear}
            className="flex items-center gap-1.5 rounded border border-[rgba(239,68,68,0.25)] bg-transparent px-2.5 py-1.5 text-[11.5px] text-[var(--destructive)] hover:bg-[rgba(239,68,68,0.08)] transition-colors cursor-pointer font-sans">
            <Trash2 size={11} />Clear
          </button>
        </div>
      </header>

      {/* Capture bins */}
      {bins.length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)]">
          <button type="button" onClick={() => setBinsOpen(v => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-[11.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
            <Radio size={11} className="text-[var(--accent)] shrink-0" />
            <span className="font-medium">Capture URLs</span>
            <span className="rounded bg-[var(--elevated)] px-1.5 py-0.5 text-[10px]">{bins.length}</span>
            <span className="ml-auto text-[10.5px] text-[var(--placeholder-foreground)]">{binsOpen ? 'hide' : 'show'}</span>
          </button>
          {binsOpen && (
            <div className="flex flex-col gap-1.5 px-4 pb-3">
              {bins.map(bin => (
                <div key={bin.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5">
                  <Radio size={9} className="shrink-0 text-[var(--accent)]" />
                  <span className="text-[11.5px] font-medium text-[var(--foreground)] shrink-0">{bin.name || 'Unnamed'}</span>
                  <code className="flex-1 truncate font-mono text-[10.5px] text-[var(--muted-foreground)]">{binUrl(bin.id)}</code>
                  <button type="button" onClick={() => copy(binUrl(bin.id), `bin-${bin.id}`)}
                    className="flex shrink-0 items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                    {copied === `bin-${bin.id}` ? <><Check size={9} />Copied</> : <><Copy size={9} />Copy</>}
                  </button>
                  <button type="button" onClick={() => deleteBin(bin.id)} className="shrink-0 rounded p-1 text-[var(--placeholder-foreground)] hover:text-[var(--destructive)] transition-colors cursor-pointer"><X size={10} /></button>
                </div>
              ))}
              <button type="button" onClick={createBin}
                className="flex items-center gap-1.5 self-start rounded border border-dashed border-[var(--border)] px-3 py-1 text-[11px] text-[var(--placeholder-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer">
                <Plus size={10} />New bin
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Log list ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-24 text-center">
            <p className="text-[13px] font-medium text-[var(--foreground-secondary)]">
              {logs.length === 0 ? 'No requests yet' : 'No logs match this filter'}
            </p>
            <p className="text-[12px] text-[var(--muted-foreground)]">
              {wsConnected ? 'Requests appear here in real-time' : 'Reconnecting…'}
            </p>
          </div>
        ) : filtered.map(log => {
          const isExpanded = expanded.has(log.id);
          const mc = METHOD_COLOR[(log.method ?? 'GET').toUpperCase()] ?? 'var(--muted-foreground)';
          const sc = statusColor(log.status_code);
          const ss = SOURCE_STYLE[log.source] ?? { bg: 'var(--elevated)', color: 'var(--muted-foreground)' };
          const isError = !!(log.error || (log.status_code !== null && log.status_code >= 400));

          return (
            <div key={log.id}
              className={cn('border-b border-[var(--border)] border-l-2', isExpanded && 'bg-[color-mix(in_srgb,var(--foreground)_1.5%,transparent)]')}
              style={{ borderLeftColor: log.status_code != null ? (isError ? '#f87171' : sc) : 'transparent' }}>

              {/* ── Row ── */}
              <button type="button"
                onClick={() => toggle(log.id)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, log }); }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] transition-colors cursor-pointer">

                {/* Chevron */}
                <span className="shrink-0 text-[var(--placeholder-foreground)] w-3">
                  {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>

                {/* Timestamp — 24h, single line */}
                <span className="shrink-0 font-mono text-[10.5px] text-[var(--muted-foreground)] tabular-nums w-[56px]">
                  {fmtTs(log.created_at)}
                </span>

                {/* Method */}
                <span className="shrink-0 w-[46px] rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold"
                  style={{ color: mc, background: `${mc}18` }}>
                  {(log.method ?? 'GET').toUpperCase()}
                </span>

                {/* URL */}
                <span className="flex-1 truncate font-mono text-[12px] text-[var(--foreground)]">
                  {trunc(log.url)}
                </span>

                {/* Tool name (AI) */}
                {log.tool_name && (
                  <span className="shrink-0 hidden md:block rounded px-1.5 py-0.5 text-[10px] font-medium max-w-[180px] truncate"
                    style={{ background: ss.bg, color: ss.color }}>
                    {log.tool_name}
                  </span>
                )}

                {/* Status */}
                {log.status_code != null && (
                  <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums w-[32px] text-right" style={{ color: sc }}>
                    {log.status_code}
                  </span>
                )}

                {/* Latency */}
                {log.latency_ms != null && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums w-[44px] text-right" style={{ color: latencyColor(log.latency_ms) }}>
                    {fmtMs(log.latency_ms)}
                  </span>
                )}

                {/* Source */}
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                  style={{ background: ss.bg, color: ss.color }}>
                  {log.source}
                </span>

                {/* Error dot */}
                {log.error && <span className="shrink-0 size-1.5 rounded-full bg-[var(--destructive)]" />}
              </button>

              {isExpanded && (
                <LogDetail log={log} onOpenInExplorer={() => openLogInExplorer(log, navigate)} copy={copy} copied={copied} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
