import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/api';
import { useApp } from '../context';
import { Trash2, Pause, Play, Terminal, Copy, Check, ExternalLink } from 'lucide-react';

export const Route = createFileRoute('/logs')({ component: LogsPage });

interface LogEntry {
  id: string; source: string; tool_name: string | null;
  method: string; url: string; status_code: number | null;
  request_body: string | null; response_body: string | null;
  request_headers: string | null; response_headers: string | null;
  latency_ms: number | null; error: string | null; created_at: number;
}

interface CtxMenu { x: number; y: number; log: LogEntry }

function scClass(s: number | null) {
  if (!s) return '';
  if (s < 300) return 'status-ok';
  if (s < 400) return 'status-redir';
  if (s < 500) return 'status-err';
  return 'status-fatal';
}

function trunc(s: string, n = 70) {
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
    const escaped = log.request_body.replace(/'/g, "'\\''");
    cmd += ` \\\n  -d '${escaped}'`;
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

function LogDetail({ log, onOpenInExplorer }: { log: LogEntry; onOpenInExplorer: () => void }) {
  const [tab, setTab] = useState<'response' | 'request'>('response');
  const body = tab === 'response' ? log.response_body : log.request_body;
  const hdrs = tab === 'response' ? log.response_headers : log.request_headers;
  let ph: Record<string, string> = {};
  try { ph = JSON.parse(hdrs ?? '{}'); } catch { /* ignore */ }

  return (
    <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, paddingTop: 10 }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ gap: 5, fontSize: 11 }}
          onClick={onOpenInExplorer}
          title="Open in Explorer to edit and replay"
        >
          <Terminal size={11} /> Open in Explorer
        </button>
      </div>
      <div className="sub-tab-bar" style={{ marginBottom: 8 }}>
        {(['response', 'request'] as const).map(t => (
          <button key={t} className={`sub-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {Object.keys(ph).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {Object.entries(ph).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'var(--text-3)', minWidth: 180, flexShrink: 0 }}>{k}</span>
              <span style={{ color: 'var(--text-2)', wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {body ? (
        <pre style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', maxHeight: 220, overflow: 'auto', margin: 0 }}>
          {(() => { try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; } })()}
        </pre>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No body</div>
      )}
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

  // Load recent logs from DB on mount
  useEffect(() => {
    apiClient<LogEntry[]>('/api/logs?limit=100').then(initial => {
      setLogs(prev => {
        const seen = new Set(prev.map(l => l.id));
        const fresh = initial.filter(l => !seen.has(l.id));
        return [...prev, ...fresh].slice(0, 500);
      });
    }).catch(() => {});
    // Live entries come via the global WebSocket in __root.tsx
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Context menu overlay */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[1999]" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <button className="ctx-item" onClick={() => { openLogInExplorer(ctxMenu.log, navigate); setCtxMenu(null); }}>
              <Terminal size={12} /> Open in Explorer
            </button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { copy(ctxMenu.log.url, 'url'); setCtxMenu(null); }}>
              {copied === 'url' ? <Check size={12} /> : <Copy size={12} />} Copy URL
            </button>
            <button className="ctx-item" onClick={() => { copy(logToCurl(ctxMenu.log), 'curl'); setCtxMenu(null); }}>
              {copied === 'curl' ? <Check size={12} /> : <ExternalLink size={12} />} Copy as cURL
            </button>
            {ctxMenu.log.request_body && (
              <button className="ctx-item" onClick={() => { copy(ctxMenu.log.request_body!, 'body'); setCtxMenu(null); }}>
                {copied === 'body' ? <Check size={12} /> : <Copy size={12} />} Copy Request Body
              </button>
            )}
            {ctxMenu.log.response_body && (
              <button className="ctx-item" onClick={() => { copy(ctxMenu.log.response_body!, 'resp'); setCtxMenu(null); }}>
                {copied === 'resp' ? <Check size={12} /> : <Copy size={12} />} Copy Response Body
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot dot-pulse" style={{ background: wsConnected ? 'var(--green)' : 'var(--yellow)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Live Logs</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{wsConnected ? 'connected' : 'reconnecting…'}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {(['all', 'mcp', 'explorer', 'error'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="btn btn-ghost btn-sm"
              style={filter === f ? { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' } : {}}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPaused(p => !p)} style={{ gap: 5 }}>
            {paused ? <><Play size={12} />Resume</> : <><Pause size={12} />Pause</>}
          </button>
          <button className="btn btn-danger btn-sm" onClick={clear} style={{ gap: 5 }}>
            <Trash2 size={12} />Clear
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {logs.length === 0 ? 'Waiting for requests…' : 'No logs match this filter'}
            </div>
            <div style={{ fontSize: 12 }}>
              {wsConnected ? 'Connected — requests appear here in real-time' : 'Reconnecting…'}
            </div>
          </div>
        ) : filtered.map(log => (
          <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => toggle(log.id)}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, log }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px', background: expanded.has(log.id) ? 'rgba(99,102,241,0.04)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, width: 70 }}>
                {fmtTs(log.created_at)}
              </span>
              <span className={`method-badge method-${(log.method ?? 'GET').toUpperCase()}`}>
                {(log.method ?? 'GET').toUpperCase()}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono,monospace' }}>
                {trunc(log.url)}
              </span>
              {log.status_code !== null && (
                <span className={scClass(log.status_code)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {log.status_code}
                </span>
              )}
              {log.latency_ms !== null && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{log.latency_ms}ms</span>
              )}
              <span style={{ fontSize: 10, background: 'var(--bg-subtle)', color: 'var(--text-3)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                {log.source}
              </span>
              {log.error && <span style={{ color: 'var(--red)', fontSize: 11, flexShrink: 0 }}>ERR</span>}
            </button>
            {expanded.has(log.id) && <LogDetail log={log} onOpenInExplorer={() => openLogInExplorer(log, navigate)} />}
          </div>
        ))}
      </div>
    </div>
  );
}
