import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { apiClient, CLI_BASE_URL, cliLink } from '../lib/api';
import { cacheInvalidateSpec } from '../lib/cache';
import { cn } from '../lib/utils';
import { saveEnvironment, listEnvironments, type Environment, type EnvVar, ENV_COLORS } from '../lib/env';
import {
  RefreshCw, Copy, Check, ExternalLink,
  Zap, Globe, ArrowUpRight, CheckCircle,
  Upload, Link2, FileJson, FileCode2, X,
  Layers, Eye, EyeOff, Terminal,
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

interface SuggestedVar {
  key: string;
  value: string;
  description: string;
  source: 'server' | 'auth' | 'path';
}

interface LoadResult {
  spec?: { title: string; version: string; baseUrl: string };
  endpointCount?: number;
  error?: string;
  suggestedVars?: SuggestedVar[];
}

function EnvImportModal({
  specTitle,
  vars,
  onConfirm,
  onSkip,
}: {
  specTitle: string;
  vars: SuggestedVar[];
  onConfirm: (envName: string, editedVars: SuggestedVar[]) => Promise<void>;
  onSkip: () => void;
}) {
  const [envName, setEnvName] = useState(`${specTitle} – Default`);
  const [editedVars, setEditedVars] = useState<SuggestedVar[]>(vars);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});

  const updateVar = (i: number, value: string) => {
    setEditedVars(prev => prev.map((v, idx) => idx === i ? { ...v, value } : v));
  };

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(envName, editedVars);
    setSaving(false);
  };

  const SOURCE_COLORS: Record<SuggestedVar['source'], string> = {
    server: 'var(--info)',
    auth:   'var(--warning)',
    path:   'var(--success)',
  };
  const SOURCE_LABELS: Record<SuggestedVar['source'], string> = {
    server: 'server',
    auth:   'auth',
    path:   'path',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-[540px] rounded-xl border border-[var(--border)] bg-[var(--popover)] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
            <Layers className="size-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--foreground)]">Import Environment Variables</div>
            <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
              Found <strong className="text-[var(--foreground)]">{vars.length}</strong> variables in <strong className="text-[var(--foreground)]">{specTitle}</strong>. Review and create an environment.
            </div>
          </div>
          <button onClick={onSkip} className="flex-shrink-0 p-1 rounded hover:bg-[var(--elevated)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors border-0 bg-transparent cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        {/* Variable list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {editedVars.map((v, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              {/* Source badge */}
              <span
                className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: SOURCE_COLORS[v.source],
                  background: `color-mix(in srgb, ${SOURCE_COLORS[v.source]} 12%, transparent)`,
                }}
              >
                {SOURCE_LABELS[v.source]}
              </span>
              {/* Key */}
              <span className="font-mono text-[12px] text-[var(--foreground)] flex-shrink-0 min-w-[120px] max-w-[180px] truncate" title={v.key}>
                {`{{${v.key}}}`}
              </span>
              {/* Value input */}
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <input
                  type={v.source === 'auth' && !showSecret[i] ? 'password' : 'text'}
                  className="input h-6 text-[12px] flex-1 min-w-0 font-mono"
                  value={v.value}
                  onChange={e => updateVar(i, e.target.value)}
                  placeholder={v.source === 'auth' ? '••••••••' : v.value || 'empty'}
                />
                {v.source === 'auth' && (
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => ({ ...s, [i]: !s[i] }))}
                    className="flex-shrink-0 p-0.5 text-[var(--placeholder-foreground)] hover:text-[var(--muted-foreground)] transition-colors border-0 bg-transparent cursor-pointer"
                  >
                    {showSecret[i] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex items-center gap-3">
          <input
            className="input flex-1 h-8 text-[13px]"
            value={envName}
            onChange={e => setEnvName(e.target.value)}
            placeholder="Environment name"
          />
          <button type="button" onClick={onSkip} className="btn btn-ghost btn-sm flex-shrink-0">
            Skip
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !envName.trim()}
            className="btn btn-primary btn-sm flex-shrink-0"
          >
            {saving ? 'Creating…' : 'Create Environment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecLoader({ onLoaded }: { onLoaded: () => void }) {
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [result, setResult] = useState<LoadResult | null>(null);
  const [pendingVars, setPendingVars] = useState<SuggestedVar[] | null>(null);
  const [pendingTitle, setPendingTitle] = useState('');
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
      if (r.suggestedVars && r.suggestedVars.length > 0) {
        setPendingVars(r.suggestedVars);
        setPendingTitle(r.spec?.title ?? 'API');
      } else {
        setTimeout(() => onLoaded(), 600);
      }
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
      if (r.suggestedVars && r.suggestedVars.length > 0) {
        setPendingVars(r.suggestedVars);
        setPendingTitle(r.spec?.title ?? 'API');
      } else {
        setTimeout(() => onLoaded(), 600);
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setState('error');
    }
  };

  const handleEnvConfirm = async (envName: string, editedVars: SuggestedVar[]) => {
    const existing = await listEnvironments();
    const existingEnv = existing.find(e => e.name.toLowerCase() === envName.toLowerCase());

    const envVars: EnvVar[] = editedVars.map(v => ({
      key: v.key,
      value: v.value,
      enabled: true,
    }));

    if (existingEnv) {
      const existingKeys = new Set(existingEnv.vars.map(v => v.key));
      const merged = [
        ...existingEnv.vars,
        ...envVars.filter(v => !existingKeys.has(v.key)),
      ];
      await saveEnvironment({ ...existingEnv, vars: merged });
    } else {
      const colorIdx = existing.length % ENV_COLORS.length;
      const newEnv: Environment = {
        id: crypto.randomUUID(),
        name: envName,
        color: ENV_COLORS[colorIdx],
        vars: envVars,
      };
      await saveEnvironment(newEnv);
    }

    setPendingVars(null);
    onLoaded();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); doUpload(f); }
  };

  return (
    <>
      {pendingVars && (
        <EnvImportModal
          specTitle={pendingTitle}
          vars={pendingVars}
          onConfirm={handleEnvConfirm}
          onSkip={() => { setPendingVars(null); onLoaded(); }}
        />
      )}
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="text-[14px] font-semibold text-[var(--foreground)]">Load Spec</div>
        <div className="mt-0.5 text-[12.5px] text-[var(--muted-foreground)]">
          Upload a YAML or JSON OpenAPI spec, or load from a URL
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex gap-0.5 rounded-lg bg-[var(--elevated)] p-1">
          {(['file', 'url'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium transition-all duration-100 border-0 cursor-pointer font-sans',
                tab === t
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}>
              {t === 'file' ? <FileCode2 size={12} /> : <Link2 size={12} />}
              {t === 'file' ? 'Upload File' : 'From URL'}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <>
            <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); doUpload(f); } }} />
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed px-5 py-10 text-center transition-all duration-150',
                drag ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border)] hover:border-[var(--border-hover)]',
              )}>
              {state === 'loading' ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                  <span className="text-[13px] text-[var(--muted-foreground)]">Parsing spec…</span>
                </div>
              ) : (
                <>
                  <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]">
                    <Upload size={16} className="text-[var(--muted-foreground)]" />
                  </div>
                  {file && state !== 'error' ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileJson size={14} className="text-[var(--accent)]" />
                      <span className="text-[13px] font-medium text-[var(--foreground)]">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 text-[13.5px] font-medium text-[var(--foreground)]">Drop your spec file here</div>
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
            <input className="input flex-1 h-9 font-mono text-[12.5px]"
              placeholder="https://api.example.com/openapi.yaml"
              value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLoadUrl()} />
            <button className="btn btn-primary h-9 flex-shrink-0 gap-1.5" onClick={doLoadUrl}
              disabled={!url.trim() || state === 'loading'}>
              {state === 'loading' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Globe size={13} />}
              Load
            </button>
          </div>
        )}

        {state === 'success' && result?.spec && (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[rgba(34,197,94,0.25)] bg-[var(--accent-dim)] px-3 py-2.5">
            <CheckCircle size={14} className="shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-medium text-[var(--foreground)]">{result.spec.title}</span>
              <span className="ml-2 text-[12px] text-[var(--muted-foreground)]">
                v{result.spec.version} · {result.endpointCount} endpoints
              </span>
            </div>
          </div>
        )}
        {state === 'error' && result?.error && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-[rgba(239,68,68,0.25)] bg-[var(--error-dim)] px-3 py-2.5">
            <X size={14} className="mt-0.5 shrink-0 text-[var(--destructive)]" />
            <span className="text-[12px] text-[var(--destructive)] break-words">{result.error}</span>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ─── MCP brand icons ──────────────────────────────────────────────────────────
function IconClaude({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.494 2.853h3.252l5.857 16.294h-3.114l-1.26-3.703H9.77l-1.26 3.703H5.397L11.254 2.853h2.24zm-.78 9.913h4.476l-2.238-6.587-2.238 6.587zM6.286 2.853H9.57L3.714 19.147H.429L6.286 2.853z"/>
    </svg>
  );
}
function IconCursor({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 2L20 12l-7 2-2 8z"/>
    </svg>
  );
}
function IconVSCode({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 00-1.705.29l-9.46 8.63-4.12-3.128a1 1 0 00-1.276.057L.327 7.261A1 1 0 00.326 8.74L3.9 12 .326 15.26A1 1 0 00.327 16.74l1.323 1.101a1 1 0 001.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 001.704.29l4.942-2.377A1.5 1.5 0 0024 19.86V4.14a1.5 1.5 0 00-.85-1.553zM17.58 19.109l-7.739-6.687 7.739-6.687v13.374z"/>
    </svg>
  );
}
function IconWindsurf({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C7.5 2 4 8 4 12s3.5 10 8 10 8-4.5 8-10c0-2-2-4-4-4-1.5 0-3 1-3 3s1.5 3 3 3"/>
      <path d="M4 12c4-2 8-2 12 0" opacity=".4"/>
    </svg>
  );
}
function IconAntigravity({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
    </svg>
  );
}
function IconHTTP({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3c-2.4 3-4 5.7-4 9s1.6 6 4 9M12 3c2.4 3 4 5.7 4 9s-1.6 6-4 9M3 12h18"/>
    </svg>
  );
}

// ─── MCP client configs ───────────────────────────────────────────────────────
type McpClient = 'claude-desktop' | 'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'antigravity' | 'http';

const MCP_CLIENTS: {
  id: McpClient; label: string; sublabel: string;
  color: string; bg: string;
  Icon: React.FC<{ size?: number }>;
  staticDeeplink?: string;
  computeDeeplink?: (mcpUrl: string) => string;
}[] = [
  {
    id: 'claude-desktop', label: 'Claude Desktop', sublabel: 'Anthropic',
    color: '#c084fc', bg: 'rgba(192,132,252,0.13)',
    Icon: IconClaude,
    staticDeeplink: 'claude://settings/mcp-servers',
  },
  {
    id: 'claude-code', label: 'Claude Code', sublabel: 'CLI',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.13)',
    Icon: IconClaude,
  },
  {
    id: 'cursor', label: 'Cursor', sublabel: 'Anysphere',
    color: '#60a5fa', bg: 'rgba(96,165,250,0.13)',
    Icon: IconCursor,
    computeDeeplink: (url) =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=wasper&config=${encodeURIComponent(btoa(JSON.stringify({ url })))}`,
  },
  {
    id: 'vscode', label: 'VS Code', sublabel: 'Microsoft',
    color: '#4d9ef6', bg: 'rgba(77,158,246,0.13)',
    Icon: IconVSCode,
    staticDeeplink: 'vscode://settings/mcp',
  },
  {
    id: 'windsurf', label: 'Windsurf', sublabel: 'Codeium',
    color: '#22d3ee', bg: 'rgba(34,211,238,0.13)',
    Icon: IconWindsurf,
  },
  {
    id: 'antigravity', label: 'Antigravity', sublabel: 'MCP client',
    color: '#fb923c', bg: 'rgba(251,146,60,0.13)',
    Icon: IconAntigravity,
  },
  {
    id: 'http', label: 'HTTP / Other', sublabel: 'Generic',
    color: '#94a3b8', bg: 'rgba(148,163,184,0.13)',
    Icon: IconHTTP,
  },
];

const MCP_FILE_LABELS: Record<McpClient, string> = {
  'claude-desktop': '~/Library/Application Support/Claude/claude_desktop_config.json',
  'claude-code':    'Terminal',
  'cursor':         '~/.cursor/mcp.json  ·  or project .cursor/mcp.json',
  'vscode':         '.vscode/mcp.json',
  'windsurf':       '~/.codeium/windsurf/mcp_config.json',
  'antigravity':    'mcp.json',
  'http':           'Streamable HTTP endpoint',
};

const MCP_HINTS: Record<McpClient, string> = {
  'claude-desktop': 'Merge into your Claude Desktop config, then restart the app.',
  'claude-code':    'Run in your terminal — registers the MCP server globally.',
  'cursor':         'Click "Add to Cursor" for one-click install, or paste the config manually.',
  'vscode':         'Add to .vscode/mcp.json in your workspace, then reload the window.',
  'windsurf':       'Merge into your Windsurf MCP config, then restart Windsurf.',
  'antigravity':    'Add to your Antigravity MCP configuration file.',
  'http':           'Use this Streamable HTTP endpoint with any MCP-compatible client.',
};

// ─── Install block ────────────────────────────────────────────────────────────
type InstallOS = 'mac-linux' | 'windows';

const INSTALL_ROWS: Record<InstallOS, { key: string; cmd: string; dim?: boolean }[]> = {
  'mac-linux': [
    { key: 'install-curl', cmd: 'curl -fsSL https://studio.stroke.click/install.sh | sh' },
    { key: 'install-bun',  cmd: 'bun add -g wasper-cli', dim: true },
  ],
  windows: [
    { key: 'install-ps1',  cmd: 'irm https://studio.stroke.click/install.ps1 | iex' },
    { key: 'install-npm',  cmd: 'npm install -g wasper-cli', dim: true },
  ],
};

function InstallBlock({ copied, copy }: { copied: string | null; copy: (key: string, text: string) => void }) {
  const [os, setOs] = useState<InstallOS>('mac-linux');

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Terminal size={11} className="text-[var(--muted-foreground)]" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Install the CLI</span>
        </div>
        <div className="flex gap-0.5 rounded-md bg-[var(--elevated)] p-0.5">
          {(['mac-linux', 'windows'] as InstallOS[]).map(t => (
            <button
              key={t}
              onClick={() => setOs(t)}
              className={cn(
                'rounded px-2.5 py-1 text-[11px] font-medium transition-all duration-100 border-0 cursor-pointer font-sans',
                os === t
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}
            >
              {t === 'mac-linux' ? 'macOS / Linux' : 'Windows'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--elevated)]">
        {INSTALL_ROWS[os].map(({ key, cmd, dim }, i) => (
          <div
            key={key}
            className={cn('flex items-center justify-between px-3.5 py-2.5', i < INSTALL_ROWS[os].length - 1 && 'border-b border-[var(--border)]')}
          >
            <code className={cn('font-mono text-[12px] select-all', dim ? 'text-[var(--muted-foreground)]' : 'text-[var(--foreground)]')}>
              {cmd}
            </code>
            <button
              onClick={() => copy(key, cmd)}
              className={cn(
                'ml-3 flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-sans cursor-pointer transition-colors',
                copied === key ? 'text-[#22c55e]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
              )}
            >
              {copied === key ? <Check size={10} /> : <Copy size={10} />}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--placeholder-foreground)]">
        Then run <code className="font-mono">wasper --url &lt;spec-url&gt;</code> to launch the studio.
      </p>
    </div>
  );
}

// ─── Overview page ────────────────────────────────────────────────────────────
function OverviewPage() {
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

  useEffect(() => {
    window.addEventListener('cli-spec-changed', load);
    return () => window.removeEventListener('cli-spec-changed', load);
  }, []);

  const specLoaded = !!status?.spec;
  const mcpUrl = `${CLI_BASE_URL}/mcp`;

  const mcpSnippets: Record<McpClient, string> = {
    'claude-desktop': JSON.stringify({ mcpServers: { wasper: { type: 'streamable-http', url: mcpUrl } } }, null, 2),
    'claude-code':    `claude mcp add wasper ${mcpUrl} --transport http`,
    'cursor':         JSON.stringify({ mcpServers: { wasper: { url: mcpUrl } } }, null, 2),
    'vscode':         JSON.stringify({ servers: { wasper: { type: 'http', url: mcpUrl } } }, null, 2),
    'windsurf':       JSON.stringify({ mcpServers: { wasper: { serverUrl: mcpUrl } } }, null, 2),
    'antigravity':    JSON.stringify({ mcpServers: { wasper: { type: 'streamable-http', url: mcpUrl } } }, null, 2),
    'http':           mcpUrl,
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">

      {/* ── Page header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-8 py-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[var(--foreground)] leading-none">Overview</h1>
          <p className="mt-1 text-[12.5px] text-[var(--muted-foreground)]">
            {specLoaded
              ? `${status!.spec.title} · v${status!.spec.version}`
              : 'Load an OpenAPI spec to get started'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={refreshing}
            className="flex items-center gap-1.5 h-8 rounded-lg border border-[var(--border)] bg-transparent px-3 text-[12px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-40 cursor-pointer font-sans">
            <RefreshCw size={11} className={cn(refreshing && 'animate-spin')} />
            Refresh
          </button>
          {specLoaded && (
            <a href={cliLink('/openapi.json')} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-8 rounded-lg bg-[var(--foreground)] px-3 text-[12px] font-semibold text-[var(--background)] no-underline transition-opacity hover:opacity-85">
              View Spec
              <ArrowUpRight size={11} />
            </a>
          )}
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto">
        {specLoaded ? (
          <div className="max-w-[880px] px-8 py-6 flex flex-col gap-5">

            {/* ── Stats row ── */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'Endpoints',
                  icon: Globe,
                  value: <span className="text-[36px] font-bold leading-none tracking-tight text-[var(--foreground)]">{status!.endpointCount}</span>,
                  sub: 'API operations',
                },
                {
                  label: 'Base URL',
                  icon: Link2,
                  value: <span className="font-mono text-[12px] text-[var(--foreground)] break-all leading-snug">
                    {status!.spec.baseUrl || status!.spec.url || <span className="text-[var(--muted-foreground)]">—</span>}
                  </span>,
                  sub: 'Server origin',
                },
                {
                  label: 'Version',
                  icon: FileJson,
                  value: <span className="font-mono text-[28px] font-bold leading-none text-[var(--foreground)]">v{status!.spec.version}</span>,
                  sub: 'OpenAPI spec',
                },
              ].map(({ label, icon: Icon, value, sub }) => (
                <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{label}</span>
                    <div className="size-5 rounded-md bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] flex items-center justify-center">
                      <Icon size={10} className="text-[var(--muted-foreground)]" />
                    </div>
                  </div>
                  <div className="flex-1 flex items-end">{value}</div>
                  <div className="text-[11px] text-[var(--placeholder-foreground)]">{sub}</div>
                </div>
              ))}
            </div>

            {/* ── MCP Configuration ── */}
            {(() => {
              const active = MCP_CLIENTS.find(c => c.id === mcpClient)!;
              const deeplink = active.staticDeeplink ?? active.computeDeeplink?.(mcpUrl);
              return (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">

                  {/* Card header */}
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: active.bg, color: active.color }}>
                        <active.Icon size={16} />
                      </div>
                      <div>
                        <span className="text-[13.5px] font-semibold text-[var(--foreground)]">MCP Configuration</span>
                        <span className="ml-2 text-[12px] text-[var(--muted-foreground)]">Connect your AI coding tool</span>
                      </div>
                    </div>
                    <a href={mcpUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] px-2.5 py-1 text-[11px] font-medium text-[#22c55e] no-underline transition-colors hover:bg-[rgba(34,197,94,0.14)]">
                      <span className="size-1.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 4px rgba(34,197,94,0.7)' }} />
                      Live
                      <ExternalLink size={9} className="opacity-70" />
                    </a>
                  </div>

                  {/* Client icon grid */}
                  <div className="flex items-center gap-1 px-4 py-3 border-b border-[var(--border)] overflow-x-auto">
                    {MCP_CLIENTS.map(c => {
                      const isActive = mcpClient === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setMcpClient(c.id)}
                          title={c.label}
                          className={cn(
                            'flex flex-col items-center gap-1.5 rounded-xl px-3.5 py-2.5 shrink-0 cursor-pointer border transition-all duration-100 font-sans',
                            isActive
                              ? 'border-[var(--border-strong)] bg-[var(--elevated)]'
                              : 'border-transparent hover:border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)]',
                          )}
                        >
                          <div
                            className="size-9 rounded-xl flex items-center justify-center transition-colors"
                            style={{ background: isActive ? c.bg : 'var(--elevated)', color: isActive ? c.color : 'var(--muted-foreground)' }}
                          >
                            <c.Icon size={18} />
                          </div>
                          <span
                            className="text-[10.5px] font-medium leading-none whitespace-nowrap transition-colors"
                            style={{ color: isActive ? c.color : 'var(--muted-foreground)' }}
                          >
                            {c.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Code block */}
                  <div className="p-5 flex flex-col gap-3">
                    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--elevated)]">
                      <div className="flex items-center justify-between border-b border-[var(--border)] px-3.5 py-2">
                        <span className="truncate font-mono text-[10.5px] text-[var(--muted-foreground)]">
                          {MCP_FILE_LABELS[mcpClient]}
                        </span>
                        <button onClick={() => copy(mcpClient, mcpSnippets[mcpClient])}
                          className={cn(
                            'ml-3 flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-sans cursor-pointer transition-colors',
                            copied === mcpClient ? 'text-[#22c55e]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                          )}>
                          {copied === mcpClient ? <Check size={10} /> : <Copy size={10} />}
                          {copied === mcpClient ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <pre className="m-0 overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap break-all">
                        {mcpSnippets[mcpClient]}
                      </pre>
                    </div>

                    {/* Hint + deeplink */}
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[11.5px] leading-relaxed text-[var(--muted-foreground)]">
                        {MCP_HINTS[mcpClient]}
                      </p>
                      {deeplink && (
                        <a
                          href={deeplink}
                          className="shrink-0 flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold no-underline transition-all hover:opacity-90"
                          style={{ background: active.bg, color: active.color }}
                        >
                          <active.Icon size={13} />
                          {active.id === 'cursor' ? `Add to ${active.label}` : `Open ${active.label}`}
                          <ArrowUpRight size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        ) : (
          /* ── No spec loaded — centered ── */
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-[480px]">
              <h1 className="mb-1 text-[26px] font-bold tracking-tight text-[var(--foreground)] leading-tight">Welcome to Wasper</h1>
              <p className="mb-8 text-[13.5px] text-[var(--muted-foreground)]">Load an OpenAPI specification to get started.</p>
              <SpecLoader onLoaded={load} />
              <div className="mt-5 flex flex-col gap-2.5">
                {[
                  { icon: FileCode2, text: 'Supports OpenAPI 3.x YAML and JSON' },
                  { icon: Link2, text: 'Load from URL — Swagger Hub, GitHub, or any public endpoint' },
                  { icon: Zap, text: 'Explore endpoints, run requests, and chat with AI' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] text-[var(--muted-foreground)]">
                      <Icon size={11} />
                    </span>
                    <span className="text-[12.5px] text-[var(--muted-foreground)]">{text}</span>
                  </div>
                ))}
              </div>

              {/* ── Install command ── */}
              <InstallBlock copied={copied} copy={copy} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
