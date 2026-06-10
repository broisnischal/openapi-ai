import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/api';
import { useApp } from '../context';
import { Trash2, Pause, Play, Terminal, Copy, Check, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export const Route = createFileRoute('/logs')({ component: LogsPage });

interface LogEntry {
  id: string; source: string; tool_name: string | null;
  method: string; url: string; status_code: number | null;
  request_body: string | null; response_body: string | null;
  request_headers: string | null; response_headers: string | null;
  latency_ms: number | null; error: string | null; created_at: number;
}

interface CtxMenu { x: number; y: number; log: LogEntry }

const METHOD_COLOR: Record<string, string> = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
  PATCH: '#8b5cf6', DELETE: '#ef4444', HEAD: '#64748b', OPTIONS: '#64748b',
};

function statusColor(s: number | null) {
  if (!s) return 'var(--muted-foreground)';
  if (s < 300) return '#22c55e';
  if (s < 400) return '#f59e0b';
  if (s < 500) return '#ef4444';
  return '#dc2626';
}

function trunc(s: string, n = 68) {
  try { const u = new URL(s); s = u.pathname + u.search; } catch { /* not a URL */ }
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtTs(ts: number) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function logToCurl(log: LogEntry): string {
  let cmd = `curl -X ${(log.method ?? 'GET').toUpperCase()}`;
  try {
    const hdrs = JSON.parse(log.request_headers ?? '{}') as Record<string, string>;
    for (const [k, v] of Object.entries(hdrs)) {
      if (!['host', 'content-length', 'transfer-encoding'].includes(k.toLowerCase())) {
        cmd += ` \\\n  -H '${k}: ${v.replace(/'/g, "'\\''")}'`;
      }
    }
  } catch { /* ignore */ }
  if (log.request_body) {
    cmd += ` \\\n  -d '${log.request_body.replace(/'/g, "'\\''")}'`;
  }
  cmd += ` \\\n  '${log.url}'`;
  return cmd;
}

function openLogInExplorer(log: LogEntry, navigate: ReturnType<typeof useNavigate>) {
  let parsedHeaders: Record<string, string> = {};
  try { parsedHeaders = JSON.parse(log.request_headers ?? '{}'); } catch { /* ignore */ }
  const kvHeaders = Object.entries(parsedHeaders)
    .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
    .map(([key, value]) => ({ key, value, enabled: true }));

  sessionStorage.setItem('explorer_pending_log', JSON.stringify({
    method: (log.method ?? 'GET').toUpperCase(),
    url: log.url,
    headers: kvHeaders,
    body: log.request_body ?? '',
    body_type: log.request_body ? 'json' : 'none',
    title: log.url,
  }));
  void navigate({ to: '/explorer' });
}

function BodyBlock({ body }: { body: string | null }) {
  if (!body) return <span className="text-[11.5px] italic text-[var(--muted-foreground)]">No body</span>;
  let pretty = body;
  try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch { /* raw */ }
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap break-all">
      {pretty}
    </pre>
  );
}

function LogDetail({ log, onOpenInExplorer }: { log: LogEntry; onOpenInExplorer: () => void }) {
  const [tab, setTab] = useState<'response' | 'request'>('response');
  const body = tab === 'response' ? log.response_body : log.request_body;
  const hdrs = tab === 'response' ? log.response_headers : log.request_headers;
  let ph: Record<string, string> = {};
  try { ph = JSON.parse(hdrs ?? '{}'); } catch { /* ignore */ }

  return (
    <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
      {/* Open in explorer */}
      <button
        type="button"
        onClick={onOpenInExplorer}
        className="mb-3 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11.5px] text-[var(--foreground-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
      >
        <Terminal size={11} /> Open in Explorer
      </button>

      {/* Sub-tabs */}
      <div className="mb-3 flex gap-1 border-b border-[var(--border)]">
        {(['response', 'request'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn(
              'relative px-3 py-1.5 text-[12px] font-medium capitalize transition-colors',
              tab === t ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
            )}>
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-t-full bg-[var(--foreground)]" />}
          </button>
        ))}
      </div>

      {/* Headers */}
      {Object.keys(ph).length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--border)] overflow-hidden">
          {Object.entries(ph).slice(0, 8).map(([k, v], i) => (
            <div key={k} className={cn('flex gap-3 px-3 py-1.5 text-[11px]', i > 0 && 'border-t border-[var(--border)]')}>
              <span className="w-[160px] shrink-0 font-mono text-[var(--muted-foreground)] truncate">{k}</span>
              <span className="flex-1 text-[var(--foreground-secondary)] break-all">{v}</span>
            </div>
          ))}
        </div>
      )}

      <BodyBlock body={body} />
    </div>
  );
}

function LogsPage() {
  const navigate = useNavigate();
  const { wsConnected } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mcp' | 'explorer' | 'error'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    apiClient<LogEntry[]>('/api/logs?limit=100').then(initial => {
      setLogs(prev => {
        const seen = new Set(prev.map(l => l.id));
        const fresh = initial.filter(l => !seen.has(l.id));
        return [...prev, ...fresh].slice(0, 500);
      });
    }).catch(() => {});
    const handler = (e: Event) => {
      if (pausedRef.current) return;
      const m = (e as CustomEvent<LogEntry>).detail;
      setLogs(p => {
        if (p.some(l => l.id === m.id)) return p;
        return [m, ...p].slice(0, 500);
      });
    };
    window.addEventListener('cli-log', handler);
    return () => window.removeEventListener('cli-log', handler);
  }, []);

  const clear = async () => { await apiClient('/api/logs', { method: 'DELETE' }); setLogs([]); };

  const toggle = (id: string) => setExpanded(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const filtered = logs.filter(l => {
    if (filter === 'mcp') return l.source === 'mcp';
    if (filter === 'explorer') return l.source === 'explorer';
    if (filter === 'error') return !!(l.error || (l.status_code !== null && l.status_code >= 400));
    return true;
  });

  const FILTERS = ['all', 'mcp', 'explorer', 'error'] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[1999]" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-[2000] min-w-[168px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] py-1 shadow-xl"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] transition-colors"
              onClick={() => { openLogInExplorer(ctxMenu.log, navigate); setCtxMenu(null); }}>
              <Terminal size={12} /> Open in Explorer
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] transition-colors"
              onClick={() => { copy(ctxMenu.log.url, 'url'); setCtxMenu(null); }}>
              {copied === 'url' ? <Check size={12} /> : <Copy size={12} />} Copy URL
            </button>
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] transition-colors"
              onClick={() => { copy(logToCurl(ctxMenu.log), 'curl'); setCtxMenu(null); }}>
              {copied === 'curl' ? <Check size={12} /> : <ExternalLink size={12} />} Copy as cURL
            </button>
            {ctxMenu.log.request_body && (
              <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] transition-colors"
                onClick={() => { copy(ctxMenu.log.request_body!, 'body'); setCtxMenu(null); }}>
                {copied === 'body' ? <Check size={12} /> : <Copy size={12} />} Copy Request Body
              </button>
            )}
            {ctxMenu.log.response_body && (
              <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--foreground-secondary)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] transition-colors"
                onClick={() => { copy(ctxMenu.log.response_body!, 'resp'); setCtxMenu(null); }}>
                {copied === 'resp' ? <Check size={12} /> : <Copy size={12} />} Copy Response Body
              </button>
            )}
          </div>
        </>
      )}

      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-full transition-colors"
            style={{
              background: wsConnected ? '#22c55e' : '#f59e0b',
              boxShadow: wsConnected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
            }}
          />
          <span className="text-[13.5px] font-semibold">Live Logs</span>
          <span className="text-[11.5px] text-[var(--muted-foreground)]">{wsConnected ? 'connected' : 'reconnecting…'}</span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors',
                filter === f
                  ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'
                  : 'border border-transparent text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground-secondary)]',
              )}>
              {f}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setPaused(p => !p)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11.5px] text-[var(--foreground-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]">
            {paused ? <><Play size={11} /> Resume</> : <><Pause size={11} /> Pause</>}
          </button>
          <button type="button" onClick={clear}
            className="flex items-center gap-1.5 rounded-md border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-2.5 py-1.5 text-[11.5px] text-[var(--destructive)] transition-colors hover:bg-[rgba(239,68,68,0.12)]">
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </header>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <div className="text-[13px] font-medium text-[var(--foreground-secondary)]">
              {logs.length === 0 ? 'Waiting for requests…' : 'No logs match this filter'}
            </div>
            <div className="text-[12px] text-[var(--muted-foreground)]">
              {wsConnected ? 'Connected — requests appear here in real-time' : 'Reconnecting…'}
            </div>
          </div>
        ) : (
          filtered.map(log => {
            const isExpanded = expanded.has(log.id);
            const mc = METHOD_COLOR[(log.method ?? 'GET').toUpperCase()] ?? 'var(--muted-foreground)';
            return (
              <div key={log.id} className={cn('border-b border-[var(--border)]', isExpanded && 'bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)]')}>
                {/* Row */}
                <button
                  type="button"
                  onClick={() => toggle(log.id)}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, log }); }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] transition-colors"
                >
                  {/* Expand chevron */}
                  <span className="shrink-0 text-[var(--muted-foreground)]">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>

                  {/* Timestamp */}
                  <span className="w-[62px] shrink-0 font-mono text-[10.5px] text-[var(--muted-foreground)]">
                    {fmtTs(log.created_at)}
                  </span>

                  {/* Method badge */}
                  <span
                    className="w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold"
                    style={{ color: mc, background: `${mc}18` }}
                  >
                    {(log.method ?? 'GET').toUpperCase()}
                  </span>

                  {/* URL */}
                  <span className="flex-1 overflow-hidden truncate font-mono text-[12px] text-[var(--foreground)]">
                    {trunc(log.url)}
                  </span>

                  {/* Status */}
                  {log.status_code !== null && (
                    <span className="shrink-0 font-mono text-[12px] font-bold" style={{ color: statusColor(log.status_code) }}>
                      {log.status_code}
                    </span>
                  )}

                  {/* Latency */}
                  {log.latency_ms !== null && (
                    <span className="shrink-0 font-mono text-[11px] text-[var(--muted-foreground)]">{log.latency_ms}ms</span>
                  )}

                  {/* Source */}
                  <span className="shrink-0 rounded bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                    {log.source}
                  </span>

                  {/* Error indicator */}
                  {log.error && (
                    <span className="shrink-0 rounded bg-[rgba(239,68,68,0.1)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--destructive)]">ERR</span>
                  )}
                </button>

                {/* Detail */}
                {isExpanded && <LogDetail log={log} onOpenInExplorer={() => openLogInExplorer(log, navigate)} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
