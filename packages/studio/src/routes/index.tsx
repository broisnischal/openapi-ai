import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiClient, CLI_BASE_URL, cliLink } from '../lib/api';
import { cacheInvalidateSpec } from '../lib/cache';
import { cn } from '../lib/utils';
import {
  RefreshCw, Copy, Check, ExternalLink,
  Zap, Globe, ArrowUpRight, CheckCircle,
  Upload, Link2, FileJson, FileCode2, X,
  Bot, Activity,
} from 'lucide-react';

export const Route = createFileRoute('/')({ component: OverviewPage });

interface Status {
  ok: boolean;
  spec: { title: string; version: string; baseUrl: string; url: string };
  endpointCount: number;
  wsClients: number;
}

// ─── Spec Loader ──────────────────────────────────────────────────────────────
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
    setState('loading'); setResult(null);
    try {
      const content = await f.text();
      const r = await apiClient<LoadResult>('/api/spec/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: f.name }),
      });
      setResult(r); setState('success');
      await cacheInvalidateSpec();
      setTimeout(() => onLoaded(), 600);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState('error');
    }
  };

  const doLoadUrl = async () => {
    if (!url.trim()) return;
    setState('loading'); setResult(null);
    try {
      const r = await apiClient<LoadResult>('/api/spec/reload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      setResult(r); setState('success');
      await cacheInvalidateSpec();
      setTimeout(() => onLoaded(), 600);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState('error');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); doUpload(f); }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <div className="text-[14px] font-semibold text-[var(--foreground)]">Load Spec</div>
        <div className="text-[12.5px] text-[var(--muted-foreground)] mt-0.5">
          Upload a YAML or JSON OpenAPI spec, or load from a URL
        </div>
      </div>

      <div className="p-5">
        <div className="flex bg-[var(--elevated)] rounded-lg p-1 mb-4 gap-0.5">
          {(['file', 'url'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[13px] font-medium rounded-md transition-all duration-100 border-0 cursor-pointer font-sans',
                tab === t
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}
            >
              {t === 'file' ? <FileCode2 size={12} /> : <Link2 size={12} />}
              {t === 'file' ? 'Upload File' : 'From URL'}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <>
            <input
              ref={fileRef} type="file" accept=".yaml,.yml,.json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); doUpload(f); } }}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg px-5 py-8 text-center cursor-pointer transition-all duration-150',
                drag
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                  : 'border-[var(--border)] hover:border-[var(--border-hover)]',
              )}
            >
              {state === 'loading' ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                  <span className="text-[13px] text-[var(--muted-foreground)]">Parsing spec…</span>
                </div>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-lg bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] flex items-center justify-center mx-auto mb-3">
                    <Upload size={16} className="text-[var(--muted-foreground)]" />
                  </div>
                  {file && state !== 'error' ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileJson size={14} className="text-[var(--accent)]" />
                      <span className="text-[13px] font-medium text-[var(--foreground)]">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-[13.5px] font-medium text-[var(--foreground)] mb-1">Drop your spec file here</div>
                      <div className="text-[12px] text-[var(--muted-foreground)]">or click to browse · .yaml, .yml, .json</div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {tab === 'url' && (
          <div className="flex gap-2">
            <input
              className="input flex-1 h-9 font-mono text-[12.5px]"
              placeholder="https://api.example.com/openapi.yaml"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLoadUrl()}
            />
            <button
              className="btn btn-primary h-9 flex-shrink-0 gap-1.5"
              onClick={doLoadUrl}
              disabled={!url.trim() || state === 'loading'}
            >
              {state === 'loading'
                ? <span className="spinner" style={{ width: 12, height: 12 }} />
                : <Globe size={13} />}
              Load
            </button>
          </div>
        )}

        {state === 'success' && result?.spec && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-[var(--accent-dim)] border border-[rgba(34,197,94,0.25)] flex items-center gap-2.5">
            <CheckCircle size={14} className="text-[var(--accent)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-[var(--foreground)]">{result.spec.title}</span>
              <span className="text-[12px] text-[var(--muted-foreground)] ml-2">
                v{result.spec.version} · {result.endpointCount} endpoints
              </span>
            </div>
          </div>
        )}

        {state === 'error' && result?.error && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-[var(--error-dim)] border border-[rgba(239,68,68,0.25)] flex items-start gap-2.5">
            <X size={14} className="text-[var(--destructive)] flex-shrink-0 mt-0.5" />
            <span className="text-[12px] text-[var(--destructive)] break-words">{result.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MCP client configs ───────────────────────────────────────────────────────
type McpClient = 'claude-desktop' | 'claude-code' | 'http';

const MCP_CLIENTS: { id: McpClient; label: string }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'claude-code',    label: 'Claude Code' },
  { id: 'http',           label: 'HTTP / Other' },
];

const MCP_FILE_LABELS: Record<McpClient, string> = {
  'claude-desktop': '~/Library/Application Support/Claude/claude_desktop_config.json',
  'claude-code':    'Terminal',
  'http':           'Endpoint URL',
};

const MCP_HINTS: Record<McpClient, string> = {
  'claude-desktop': 'Add to your Claude Desktop config file, then restart Claude Desktop.',
  'claude-code':    'Run this command in your terminal to register the MCP server.',
  'http':           'Use this Streamable HTTP endpoint with any MCP-compatible client.',
};

// ─── Overview page ────────────────────────────────────────────────────────────
export function OverviewPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mcpClient, setMcpClient] = useState<McpClient>('claude-desktop');

  const load = async () => {
    setRefreshing(true);
    try {
      const s = await apiClient<Status>('/api/status');
      setStatus(s);
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const specLoaded = !!status?.spec;
  const mcpUrl = `${CLI_BASE_URL}/mcp`;

  const mcpSnippets: Record<McpClient, string> = {
    'claude-desktop': JSON.stringify(
      { mcpServers: { 'wasper': { type: 'streamable-http', url: mcpUrl } } },
      null, 2,
    ),
    'claude-code': `claude mcp add wasper ${mcpUrl} --transport http`,
    'http': mcpUrl,
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="flex-1 overflow-auto bg-[var(--background)]">

      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-[var(--border)]">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-[var(--foreground)]">Overview</h1>
          <p className="text-[12.5px] text-[var(--muted-foreground)] mt-0.5">
            {specLoaded
              ? `${status!.spec.title} · v${status!.spec.version}`
              : 'Load an OpenAPI spec to get started'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={refreshing} className="btn btn-ghost gap-1.5 text-[13px]">
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
            Refresh
          </button>
          {specLoaded && (
            <a
              href={cliLink('/openapi.json')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary gap-1.5 text-[13px] no-underline"
            >
              <Globe size={13} />
              View Spec
              <ArrowUpRight size={11} />
            </a>
          )}
        </div>
      </div>

      {specLoaded ? (
        <div className="px-8 py-6 flex flex-col gap-5">

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2.5">Endpoints</div>
              <div className="text-[30px] font-bold tracking-tight leading-none text-[var(--foreground)]">
                {status!.endpointCount ?? '—'}
              </div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2.5">Server</div>
              <div className="text-[12.5px] font-mono text-[var(--foreground)] truncate leading-snug">
                {status!.spec.baseUrl || status!.spec.url || '—'}
              </div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2.5">Version</div>
              <div className="text-[13px] font-mono text-[var(--foreground)]">
                v{status!.spec.version}
              </div>
            </div>
          </div>

          {/* MCP config + quick actions */}
          <div className="grid grid-cols-[1fr_240px] gap-4">

            {/* MCP Configuration */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold text-[var(--foreground)]">MCP Configuration</div>
                  <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">Connect your AI client to this server</div>
                </div>
                <a
                  href={mcpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted-foreground)] no-underline hover:text-[var(--foreground)] transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] flex-shrink-0" />
                  Live
                  <ExternalLink size={10} className="opacity-50" />
                </a>
              </div>

              <div className="p-5">
                {/* Client tabs */}
                <div className="flex bg-[var(--elevated)] rounded-lg p-1 mb-4 gap-0.5">
                  {MCP_CLIENTS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setMcpClient(c.id)}
                      className={cn(
                        'flex-1 py-1.5 text-[12.5px] font-medium rounded-md transition-all duration-100 border-0 cursor-pointer font-sans',
                        mcpClient === c.id
                          ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                          : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Snippet */}
                <div className="relative bg-[var(--elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
                  <div className="px-3 pt-2 pb-2 text-[10.5px] text-[var(--placeholder-foreground)] border-b border-[var(--border)] font-mono truncate">
                    {MCP_FILE_LABELS[mcpClient]}
                  </div>
                  <pre className="m-0 px-4 pt-3 pb-3 pr-20 text-[11.5px] font-mono text-[var(--muted-foreground)] overflow-auto leading-relaxed whitespace-pre-wrap break-all">
                    {mcpSnippets[mcpClient]}
                  </pre>
                  <button
                    onClick={() => copy(mcpClient, mcpSnippets[mcpClient])}
                    className={cn(
                      'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--card)] border border-[var(--border)] cursor-pointer font-sans transition-colors',
                      copied === mcpClient
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                    )}
                  >
                    {copied === mcpClient ? <Check size={11} /> : <Copy size={11} />}
                    {copied === mcpClient ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <p className="text-[11.5px] text-[var(--placeholder-foreground)] mt-3 leading-relaxed">
                  {MCP_HINTS[mcpClient]}
                </p>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                Quick Actions
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  to="/explorer"
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium bg-[var(--primary)] text-[var(--primary-foreground)] no-underline hover:opacity-90 transition-opacity"
                >
                  Open Explorer
                  <ArrowUpRight size={13} />
                </Link>
                <Link
                  to="/ai"
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium border border-[var(--border)] text-[var(--muted-foreground)] no-underline hover:border-[var(--border-hover)] hover:text-[var(--foreground)] transition-colors"
                >
                  AI Chat
                  <Bot size={13} />
                </Link>
                <Link
                  to="/logs"
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium border border-[var(--border)] text-[var(--muted-foreground)] no-underline hover:border-[var(--border-hover)] hover:text-[var(--foreground)] transition-colors"
                >
                  View Logs
                  <Activity size={13} />
                </Link>
                <a
                  href={cliLink('/openapi.json')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium border border-[var(--border)] text-[var(--muted-foreground)] no-underline hover:border-[var(--border-hover)] hover:text-[var(--foreground)] transition-colors"
                >
                  Raw Spec
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>

        </div>
      ) : (
        /* No spec loaded */
        <div className="px-8 py-6 grid grid-cols-[1fr_280px] gap-5">
          <SpecLoader onLoaded={load} />
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-4">
              Getting started
            </div>
            {[
              { icon: <FileCode2 size={13} />, text: 'Upload an OpenAPI 3.x YAML or JSON file' },
              { icon: <Link2 size={13} />, text: 'Or paste a spec URL (Swagger Hub, GitHub, etc.)' },
              { icon: <Zap size={13} />, text: 'Explore endpoints, test requests, chat with AI' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 mb-3">
                <span className="w-7 h-7 rounded-lg flex-shrink-0 bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] flex items-center justify-center text-[var(--muted-foreground)]">
                  {item.icon}
                </span>
                <span className="text-[12.5px] text-[var(--muted-foreground)] leading-relaxed pt-1">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
