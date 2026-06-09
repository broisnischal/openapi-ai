import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiClient, CLI_BASE_URL } from '../lib/api';
import { cacheInvalidateSpec } from '../lib/cache';
import {
  RefreshCw, Copy, Check, ExternalLink,
  Zap, GitBranch, Server, Globe, ArrowUpRight,
  CheckCircle, Clock, AlertCircle, ChevronDown,
  Upload, Link2, FileJson, FileCode2, X,
} from 'lucide-react';

export const Route = createFileRoute('/')({ component: OverviewPage });

interface Status {
  ok: boolean;
  spec: { title: string; version: string; baseUrl: string; url: string };
  endpointCount: number;
  wsClients: number;
}

interface LogEntry {
  id: string; method: string; url: string;
  status_code: number | null; latency_ms: number | null;
  source: string; error: string | null; created_at: number;
}

function timeAgo(ts: number) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function trunc(url: string, n = 50) {
  try { const u = new URL(url); url = u.pathname + u.search; } catch { /* */ }
  return url.length > n ? url.slice(0, n) + '…' : url;
}

function statusBadge(code: number | null, error: string | null) {
  if (error) return (
    <span className="status-badge status-badge-error">
      <AlertCircle size={11} />
      Error
    </span>
  );
  if (!code) return null;
  if (code < 300) return (
    <span className="status-badge status-badge-success">
      <CheckCircle size={11} />
      {code}
    </span>
  );
  if (code < 500) return (
    <span className="status-badge status-badge-pending">
      <Clock size={11} />
      {code}
    </span>
  );
  return (
    <span className="status-badge status-badge-error">
      <AlertCircle size={11} />
      {code}
    </span>
  );
}

// ─── Spec Loader ─────────────────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface LoadResult { spec?: { title: string; version: string; baseUrl: string }; endpointCount?: number; error?: string; }

function SpecLoader({ onLoaded }: { onLoaded: () => void }) {
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [result, setResult] = useState<LoadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = async (f: File) => {
    setState('loading');
    setResult(null);
    try {
      const content = await f.text();
      const r = await apiClient<LoadResult>('/api/spec/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: f.name }),
      });
      setResult(r);
      setState('success');
      await cacheInvalidateSpec();
      setTimeout(() => onLoaded(), 600);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState('error');
    }
  };

  const doLoadUrl = async () => {
    if (!url.trim()) return;
    setState('loading');
    setResult(null);
    try {
      const r = await apiClient<LoadResult>('/api/spec/reload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      setResult(r);
      setState('success');
      await cacheInvalidateSpec();
      setTimeout(() => onLoaded(), 600);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState('error');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); doUpload(f); }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); doUpload(f); }
  };

  const tabStyle = (t: 'file' | 'url'): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 500,
    background: tab === t ? 'var(--background)' : 'none',
    border: 'none', borderRadius: tab === t ? 6 : 0,
    color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.12s',
  });

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>Load Spec</div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
          Upload a YAML or JSON OpenAPI spec, or load from a URL
        </div>
      </div>

      <div style={{ padding: '14px 18px' }}>
        {/* Tab switcher */}
        <div style={{
          display: 'flex', background: 'var(--elevated)', borderRadius: 8,
          padding: 3, marginBottom: 14,
        }}>
          <button style={tabStyle('file')} onClick={() => setTab('file')}>
            <FileCode2 size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
            Upload File
          </button>
          <button style={tabStyle('url')} onClick={() => setTab('url')}>
            <Link2 size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
            From URL
          </button>
        </div>

        {tab === 'file' && (
          <>
            <input
              ref={fileRef} type="file"
              accept=".yaml,.yml,.json"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, padding: '28px 20px',
                textAlign: 'center', cursor: 'pointer',
                background: drag ? 'var(--accent-dim)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {state === 'loading' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Parsing spec…</span>
                </div>
              ) : (
                <>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 10px',
                  }}>
                    <Upload size={16} style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                  {file && state !== 'error' ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                      <FileJson size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--foreground)', marginBottom: 4 }}>
                        Drop your spec file here
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                        or click to browse · .yaml, .yml, .json
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {tab === 'url' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="https://api.example.com/openapi.yaml"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLoadUrl()}
              style={{ flex: 1, fontFamily: 'GeistMono, monospace', fontSize: 12.5 }}
            />
            <button
              className="btn btn-primary"
              onClick={doLoadUrl}
              disabled={!url.trim() || state === 'loading'}
              style={{ gap: 6, flexShrink: 0 }}
            >
              {state === 'loading'
                ? <span className="spinner" style={{ width: 12, height: 12 }} />
                : <Globe size={13} />}
              Load
            </button>
          </div>
        )}

        {/* Feedback */}
        {state === 'success' && result?.spec && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 7,
            background: 'var(--accent-dim)', border: '1px solid rgba(34,197,94,0.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
                {result.spec.title}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 8 }}>
                v{result.spec.version} · {result.endpointCount} endpoints
              </span>
            </div>
          </div>
        )}

        {state === 'error' && result?.error && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 7,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <X size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: '#ef4444', wordBreak: 'break-word' }}>{result.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overview page ────────────────────────────────────────────────────────────

export function OverviewPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [s, l] = await Promise.all([
        apiClient<Status>('/api/status'),
        apiClient<LogEntry[]>('/api/logs?limit=8'),
      ]);
      setStatus(s);
      setLogs(l);
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);
  const specLoaded = !!status?.spec;

  const mcpUrl = `${CLI_BASE_URL}/mcp`;
  const mcpConfig = JSON.stringify(
    { mcpServers: { 'openapi-agent': { type: 'streamable-http', url: mcpUrl } } },
    null, 2,
  );

  const copy = () => {
    navigator.clipboard.writeText(mcpConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--background)' }}>

      {/* ── Page header */}
      <div style={{
        padding: '28px 32px 22px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: 'var(--foreground)' }}>
            {greeting()}{status?.spec ? `, ${status.spec.title}` : ''}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
            {status?.spec ? 'API development studio' : 'Welcome — load a spec to get started'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <button
            onClick={load}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, fontSize: 13,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--muted-foreground)', cursor: 'pointer',
              transition: 'all 0.1s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }} />
            Refresh
          </button>
          <a
            href={`${CLI_BASE_URL}/openapi.json`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--accent)', color: '#000',
              fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '1'}
          >
            <Globe size={13} />
            View Spec
            <ArrowUpRight size={11} />
          </a>
        </div>
      </div>

      {/* ── Main info area */}
      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 32 }}>

        {/* Left: MCP card (when spec loaded) or SpecLoader (no spec) */}
        {specLoaded ? (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden', minHeight: 260,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Card header */}
            <div style={{
              padding: '16px 18px', borderBottom: '1px solid var(--border)',
              background: 'var(--sidebar)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                background: 'var(--elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={11} style={{ color: 'var(--muted-foreground)' }} strokeWidth={2} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                {status?.spec.title ?? 'No API loaded'}
              </span>
              <span style={{
                marginLeft: 6, fontSize: 11, fontWeight: 500,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 20, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span className="dot" style={{ background: 'var(--accent)', width: 5, height: 5 }} />
                Live
              </span>
            </div>

            {/* MCP config */}
            <div style={{ padding: '16px 18px', flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                MCP Configuration
              </div>
              <div style={{ position: 'relative', background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <pre style={{
                  margin: 0, padding: '10px 40px 10px 12px',
                  fontSize: 11.5, fontFamily: 'GeistMono, ui-monospace, monospace',
                  color: 'var(--muted-foreground)', overflow: 'auto', lineHeight: 1.65,
                }}>
                  {mcpConfig}
                </pre>
                <button
                  onClick={copy}
                  style={{
                    position: 'absolute', top: 7, right: 7,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '3px 7px',
                    color: copied ? 'var(--accent)' : 'var(--muted-foreground)',
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'color 0.12s',
                  }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* No spec — show spec loader in left column */
          <SpecLoader onLoaded={load} />
        )}

        {/* Right: info panel always rendered — shows status when spec loaded, getting started otherwise */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '20px 20px',
        }}>
          {specLoaded ? (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Status
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="info-row">
                  <Server size={14} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2 }}>Server</div>
                    <div style={{ fontSize: 13, color: 'var(--foreground)', fontFamily: 'GeistMono, monospace', wordBreak: 'break-all' }}>
                      {status?.spec.baseUrl || status?.spec.url || <span style={{ color: 'var(--placeholder-foreground)' }}>Not loaded</span>}
                    </div>
                  </div>
                </div>

                <div className="info-row">
                  <Zap size={14} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2 }}>Endpoints</div>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: 'var(--foreground)' }}>
                      {status?.endpointCount ?? '—'}
                    </div>
                  </div>
                </div>

                <div className="info-row">
                  <GitBranch size={14} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2 }}>Version</div>
                    <div style={{ fontSize: 13, color: 'var(--foreground)' }}>
                      {status ? `v${status.spec.version}` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link
                  to="/explorer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                    background: 'var(--accent)', color: '#000',
                    textDecoration: 'none', transition: 'opacity 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'}
                  onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '1'}
                >
                  Open Explorer
                  <ArrowUpRight size={14} />
                </Link>
                <a
                  href={mcpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)', textDecoration: 'none',
                    transition: 'border-color 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-hover)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--foreground)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--muted-foreground)';
                  }}
                >
                  MCP Server
                  <ExternalLink size={12} />
                </a>
              </div>
            </>
          ) : (
            /* Getting started panel */
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Getting started
              </div>
              {[
                { icon: <FileCode2 size={13} />, text: 'Upload an OpenAPI 3.x YAML or JSON file' },
                { icon: <Link2 size={13} />, text: 'Or paste a spec URL (Swagger Hub, GitHub, etc.)' },
                { icon: <Zap size={13} />, text: 'Explore endpoints, test requests, chat with AI' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--foreground) 7%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--muted-foreground)',
                  }}>
                    {item.icon}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5, paddingTop: 5 }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Activity history */}
      <div style={{ padding: '0 32px 32px' }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12, justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Activity history</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
              Showing recent requests through the studio
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Link
              to="/logs"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                border: '1px solid rgba(34,197,94,0.2)', textDecoration: 'none',
              }}
            >
              <span className="dot" style={{ background: 'var(--accent)', width: 5, height: 5 }} />
              Live
            </Link>
            <a
              href={`${CLI_BASE_URL}/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--muted-foreground)',
                textDecoration: 'none',
              }}
            >
              Spec
            </a>
          </div>
        </div>

        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Activity</th>
                <th style={{ width: '20%' }}>Status</th>
                <th style={{ width: '25%' }}>Endpoint</th>
                <th style={{ width: '10%', textAlign: 'right' }}><ChevronDown size={13} /></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    No requests yet — start using the Explorer or AI Chat
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: 'var(--elevated)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <RefreshCw size={12} style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {log.source === 'mcp' ? 'MCP Request' : 'API Request'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>
                          {timeAgo(log.created_at)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{statusBadge(log.status_code, log.error)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`method-badge method-${(log.method ?? 'GET').toUpperCase()}`}>
                        {(log.method ?? 'GET').toUpperCase()}
                      </span>
                      <span style={{ fontSize: 12, fontFamily: 'GeistMono, monospace', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trunc(log.url, 30)}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {log.latency_ms && (
                      <span style={{ fontSize: 11, color: 'var(--placeholder-foreground)', fontFamily: 'GeistMono, monospace' }}>
                        {log.latency_ms}ms
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length > 0 && (
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <Link
              to="/logs"
              style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}
            >
              View all activity →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
