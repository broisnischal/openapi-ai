import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { LOG_WS_URL, apiClient } from '../lib/api';
import { Trash2, Pause, Play } from 'lucide-react';

export const Route = createFileRoute('/logs')({ component: LogsPage });

interface LogEntry {
  id: string; source: string; tool_name: string | null;
  method: string; url: string; status_code: number | null;
  request_body: string | null; response_body: string | null;
  request_headers: string | null; response_headers: string | null;
  latency_ms: number | null; error: string | null; created_at: number;
}

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

function LogDetail({ log }: { log: LogEntry }) {
  const [tab, setTab] = useState<'response' | 'request'>('response');
  const body = tab === 'response' ? log.response_body : log.request_body;
  const hdrs = tab === 'response' ? log.response_headers : log.request_headers;
  let ph: Record<string, string> = {};
  try { ph = JSON.parse(hdrs ?? '{}'); } catch { /* ignore */ }

  return (
    <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wsSt, setWsSt] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mcp' | 'explorer' | 'error'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    apiClient<LogEntry[]>('/api/logs?limit=100').then(setLogs).catch(() => {});
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(LOG_WS_URL);
      ws.onopen = () => setWsSt('connected');
      ws.onclose = () => { setWsSt('disconnected'); retry = setTimeout(connect, 3000); };
      ws.onerror = () => setWsSt('disconnected');
      ws.onmessage = e => {
        if (pausedRef.current) return;
        try {
          const m = JSON.parse(e.data as string);
          if (m.type === 'connected') return;
          setLogs(p => [m, ...p].slice(0, 500));
        } catch { /* ignore */ }
      };
    };
    connect();
    return () => { ws?.close(); clearTimeout(retry); };
  }, []);

  const clear = async () => { await apiClient('/api/logs', { method: 'DELETE' }); setLogs([]); };

  const toggle = (id: string) => setExpanded(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const filtered = logs.filter(l => {
    if (filter === 'mcp') return l.source === 'mcp';
    if (filter === 'explorer') return l.source === 'explorer';
    if (filter === 'error') return !!(l.error || (l.status_code !== null && l.status_code >= 400));
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot dot-pulse" style={{ background: wsSt === 'connected' ? 'var(--green)' : wsSt === 'connecting' ? 'var(--yellow)' : 'var(--red)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Live Logs</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{wsSt}</span>
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
              {wsSt === 'connected' ? 'Connected — requests appear here in real-time' : 'Reconnecting…'}
            </div>
          </div>
        ) : filtered.map(log => (
          <div key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => toggle(log.id)}
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
            {expanded.has(log.id) && <LogDetail log={log} />}
          </div>
        ))}
      </div>
    </div>
  );
}
