import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CLI_BASE_URL, authHeaders, apiClient } from '../lib/api';
import {
  Search, Terminal, Globe, FileCode, Zap, Check, X, ChevronRight, ChevronDown,
  Bot, User, Sparkles, Wrench, ShieldAlert,
  Wifi, Activity, RefreshCcw, Copy, AlertCircle,
} from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { cn } from '#/lib/utils';
import { Button } from '#/components/ui/button';

export const Route = createFileRoute('/console')({ component: ConsolePage });

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsResult {
  host: string; type: string; timestamp: string; lookup_ms: number;
  addresses?: { address: string; family: string }[];
  A?: string[]; AAAA?: string[]; MX?: { exchange: string; priority: number }[];
  TXT?: string[][]; NS?: string[]; CNAME?: string[]; error?: string;
}

interface PingResult {
  host: string; port: number; resolvedIp: string;
  checks: { step: string; success: boolean; ms: number; status?: number; error?: string; ip?: string }[];
  timestamp: string; error?: string;
}

interface LogEntry {
  id: string; method: string; url: string; status_code: number | null;
  latency_ms: number | null; error: string | null; created_at: number;
}

interface ToolCall { tool: string; input: Record<string, unknown>; output: string; isError: boolean; }
interface LiveToolCall { tool: string; input: Record<string, unknown>; output?: string; isError?: boolean; done: boolean; }
interface Message { id: string; role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[]; }

// ─── Tool metadata ────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  search_endpoints:    { label: 'Search Endpoints',  icon: <Search className="size-3" />,    color: 'var(--muted-foreground)' },
  get_endpoint_schema: { label: 'Get Schema',        icon: <FileCode className="size-3" />,  color: '#0ea5e9' },
  execute_api_request: { label: 'Execute Request',   icon: <Terminal className="size-3" />,  color: '#10b981' },
  fetch_url:           { label: 'Fetch URL',         icon: <Globe className="size-3" />,    color: '#f59e0b' },
  dns_lookup:          { label: 'DNS Lookup',        icon: <Wifi className="size-3" />,     color: '#a855f7' },
  get_recent_logs:     { label: 'Read Logs',         icon: <Activity className="size-3" />, color: '#3b82f6' },
  run_security_check:  { label: 'Security Check',    icon: <ShieldAlert className="size-3" />, color: '#ef4444' },
};

function inputPreview(tc: { tool: string; input: Record<string, unknown> }): React.ReactNode {
  if (tc.tool === 'dns_lookup' && tc.input.host)
    return <span className="font-mono text-[10px] opacity-70">{String(tc.input.host)}</span>;
  if (tc.tool === 'search_endpoints' && tc.input.query)
    return <span className="opacity-70">&ldquo;{String(tc.input.query)}&rdquo;</span>;
  if (tc.tool === 'execute_api_request' && tc.input.operationId)
    return <span className="font-mono text-[10px] opacity-70">{String(tc.input.operationId)}</span>;
  return null;
}

// ─── DNS Lookup Panel ─────────────────────────────────────────────────────────

const DNS_TYPES = ['ALL', 'A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'] as const;
type DnsType = typeof DNS_TYPES[number];

function DnsPanel() {
  const [host, setHost] = useState('');
  const [type, setType] = useState<DnsType>('ALL');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnsResult | null>(null);
  const [pingHost, setPingHost] = useState('');
  const [pingPort, setPingPort] = useState('80');
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [activeTab, setActiveTab] = useState<'dns' | 'ping'>('dns');
  const [copied, setCopied] = useState(false);

  const runDns = async () => {
    const h = host.trim();
    if (!h || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await apiClient<DnsResult>(`/api/debug/dns?host=${encodeURIComponent(h)}&type=${type}`);
      setResult(data);
    } catch (e) {
      setResult({ host: h, type, timestamp: new Date().toISOString(), lookup_ms: 0, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const runPing = async () => {
    const h = pingHost.trim();
    if (!h || pingLoading) return;
    setPingLoading(true);
    setPingResult(null);
    try {
      const data = await apiClient<PingResult>(`/api/debug/ping?host=${encodeURIComponent(h)}&port=${pingPort}`);
      setPingResult(data);
    } catch (e) {
      setPingResult({ host: h, port: Number(pingPort), resolvedIp: '', checks: [], timestamp: new Date().toISOString(), error: String(e) });
    } finally {
      setPingLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(JSON.stringify(result ?? pingResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] pb-0">
        {(['dns', 'ping'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={cn(
              'px-3 py-1.5 text-[12px] font-medium border-b-2 -mb-px transition-colors',
              activeTab === t
                ? 'border-[var(--accent)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
            )}
          >
            {t === 'dns' ? 'DNS / Dig' : 'Ping / Reach'}
          </button>
        ))}
      </div>

      {activeTab === 'dns' && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDns()}
              placeholder="hostname or IP…"
              className="input flex-1 h-8 text-[12.5px]"
            />
            <select
              value={type}
              onChange={e => setType(e.target.value as DnsType)}
              className="input h-8 text-[12px] w-20 px-2"
            >
              {DNS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button size="sm" onClick={runDns} disabled={!host.trim() || loading} className="h-8 px-3 text-[12px]">
              {loading ? <span className="spinner size-3" /> : 'Lookup'}
            </Button>
          </div>

          {result && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
                <Wifi className="size-3.5 text-[#a855f7]" />
                <span className="font-mono text-[12px] text-[var(--foreground)]">{result.host}</span>
                <span className="ml-1 text-[10.5px] text-[var(--muted-foreground)]">{result.lookup_ms}ms</span>
                {result.error && <span className="ml-1 text-[10.5px] text-[var(--destructive)]">{result.error}</span>}
                <button type="button" onClick={copyResult} className="ml-auto text-[var(--muted-foreground)] hover:text-[var(--foreground)]" title="Copy JSON">
                  {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {result.addresses && result.addresses.length > 0 && (
                  <DnsRow label="Resolved" values={result.addresses.map(a => `${a.address} (${a.family})`)} color="#a855f7" />
                )}
                {result.A && result.A.length > 0 && <DnsRow label="A" values={result.A} color="var(--muted-foreground)" />}
                {result.AAAA && result.AAAA.length > 0 && <DnsRow label="AAAA" values={result.AAAA} color="#3b82f6" />}
                {result.MX && result.MX.length > 0 && <DnsRow label="MX" values={result.MX.map(m => `${m.exchange} (pri ${m.priority})`)} color="#0ea5e9" />}
                {result.NS && result.NS.length > 0 && <DnsRow label="NS" values={result.NS} color="#10b981" />}
                {result.CNAME && result.CNAME.length > 0 && <DnsRow label="CNAME" values={result.CNAME} color="#f59e0b" />}
                {result.TXT && result.TXT.length > 0 && <DnsRow label="TXT" values={result.TXT.map(t => t.join(' '))} color="#8b5cf6" />}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'ping' && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={pingHost}
              onChange={e => setPingHost(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runPing()}
              placeholder="hostname or IP…"
              className="input flex-1 h-8 text-[12.5px]"
            />
            <input
              type="number"
              value={pingPort}
              onChange={e => setPingPort(e.target.value)}
              placeholder="port"
              className="input h-8 text-[12px] w-20 px-2"
            />
            <Button size="sm" onClick={runPing} disabled={!pingHost.trim() || pingLoading} className="h-8 px-3 text-[12px]">
              {pingLoading ? <span className="spinner size-3" /> : 'Ping'}
            </Button>
          </div>

          {pingResult && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
                <Activity className="size-3.5 text-[#3b82f6]" />
                <span className="font-mono text-[12px] text-[var(--foreground)]">{pingResult.host}:{pingResult.port}</span>
                {pingResult.resolvedIp && <span className="text-[10.5px] text-[var(--muted-foreground)]">→ {pingResult.resolvedIp}</span>}
                {pingResult.error && <span className="ml-1 text-[10.5px] text-[var(--destructive)]">{pingResult.error}</span>}
              </div>
              <div className="divide-y divide-[var(--border)]">
                {pingResult.checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                    <span className={cn('font-mono font-semibold w-16 shrink-0', c.success ? 'text-[var(--success)]' : 'text-[var(--destructive)]')}>
                      {c.step.toUpperCase()}
                    </span>
                    {c.success
                      ? <Check className="size-3.5 text-[var(--success)] shrink-0" />
                      : <X className="size-3.5 text-[var(--destructive)] shrink-0" />}
                    <span className="text-[var(--foreground)]">{c.success ? (c.ip ?? `HTTP ${c.status}`) : c.error}</span>
                    <span className="ml-auto text-[var(--muted-foreground)] font-mono">{c.ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DnsRow({ label, values, color }: { label: string; values: string[]; color: string }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="px-3 py-1.5">
      <button type="button" onClick={() => setExpanded(p => !p)} className="flex items-center gap-2 w-full text-left">
        <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5" style={{ background: `${color}20`, color }}>
          {label}
        </span>
        <span className="text-[11px] text-[var(--muted-foreground)]">{values.length} record{values.length > 1 ? 's' : ''}</span>
        {expanded ? <ChevronDown className="size-3 text-[var(--muted-foreground)] ml-auto" /> : <ChevronRight className="size-3 text-[var(--muted-foreground)] ml-auto" />}
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-16">
          {values.map((v, i) => (
            <div key={i} className="font-mono text-[11.5px] text-[var(--foreground)]">{v}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recent Logs Widget ───────────────────────────────────────────────────────

function RecentLogsWidget() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<LogEntry[]>('/api/logs?limit=15');
      setLogs(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scColor = (s: number | null) => {
    if (!s) return 'var(--muted-foreground)';
    if (s < 300) return 'var(--success)';
    if (s < 400) return 'var(--warning)';
    return 'var(--destructive)';
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Recent Requests</span>
        <button type="button" onClick={load} disabled={loading} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
          <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-[var(--muted-foreground)]">
          <Activity className="size-4 opacity-40" />
          <span className="text-[11.5px]">{loading ? 'Loading…' : 'No requests captured yet'}</span>
        </div>
      ) : (
        <div className="space-y-0.5">
          {logs.map(log => {
            let shortUrl = log.url;
            try { shortUrl = new URL(log.url).pathname; } catch { /* */ }
            return (
              <div key={log.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] hover:bg-[var(--elevated)] group">
                <span className="font-mono text-[10px] font-bold w-10 shrink-0" style={{ color: 'var(--method-' + (log.method?.toLowerCase() ?? 'get') + ', var(--foreground))' }}>
                  {log.method?.slice(0, 6) ?? 'GET'}
                </span>
                <span className="flex-1 truncate font-mono text-[var(--foreground-secondary)]" title={log.url}>{shortUrl}</span>
                <span className="shrink-0 font-mono font-bold text-[10.5px]" style={{ color: scColor(log.status_code) }}>
                  {log.status_code ?? '—'}
                </span>
                {log.latency_ms !== null && (
                  <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{log.latency_ms}ms</span>
                )}
                {log.error && <span title={log.error}><AlertCircle className="size-3 shrink-0 text-[var(--destructive)]" /></span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI Agent panel (network-aware) ─────────────────────────────────────────

function ToolCallsSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set());
  if (!toolCalls.length) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setExpanded(p => !p)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground-secondary)]">
        <Wrench className="size-3" />
        {toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''} used
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 pl-1">
          {toolCalls.map((tc, i) => {
            const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap className="size-3" />, color: '#8b5cf6' };
            const isOpen = openIdx.has(i);
            return (
              <div key={i} className={cn('rounded-lg border overflow-hidden', tc.isError ? 'border-[rgba(239,68,68,0.25)]' : 'border-[var(--border)] bg-[var(--card)]')}>
                <button type="button" onClick={() => setOpenIdx(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} className="flex w-full items-center gap-2 px-2.5 py-1.5">
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
                  <span className="flex-1 text-[11.5px] font-medium text-[var(--foreground)]">{meta.label}<span className="ml-1.5 font-normal text-[var(--muted-foreground)]">{inputPreview(tc)}</span></span>
                  {isOpen ? <ChevronDown className="size-3 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3 text-[var(--muted-foreground)]" />}
                </button>
                {isOpen && (
                  <div className="space-y-1.5 border-t border-[var(--border)] px-2.5 py-2">
                    {Object.keys(tc.input).length > 0 && <pre className="max-h-32 overflow-auto rounded bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-2 font-mono text-[10.5px]">{JSON.stringify(tc.input, null, 2)}</pre>}
                    <pre className={cn('max-h-48 overflow-auto rounded bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-2 font-mono text-[10.5px]', tc.isError ? 'text-[var(--destructive)]' : '')}>{tc.output}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type LoadingPhase = 'thinking' | 'executing' | 'streaming' | null;

function newMsgId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function NetworkAiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Message[] = [...messages, { id: newMsgId(), role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true); setLoadingPhase('thinking');
    setLiveToolCalls([]); setStreamingContent('');

    try {
      const res = await fetch(`${CLI_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as { type: string; [k: string]: unknown };
              if (ev.type === 'text_delta') { setStreamingContent(p => p + (ev.text as string)); setLoadingPhase('streaming'); }
              else if (ev.type === 'tool_start') {
                setLoadingPhase('executing');
                setLiveToolCalls(p => [...p, { tool: ev.tool as string, input: (ev.input ?? {}) as Record<string, unknown>, done: false }]);
              } else if (ev.type === 'tool_done') {
                setLiveToolCalls(p => {
                  const u = [...p];
                  const ri = [...u].reverse().findIndex(tc => tc.tool === ev.tool && !tc.done);
                  if (ri !== -1) { const i = u.length - 1 - ri; u[i] = { ...u[i], output: ev.output as string, isError: ev.isError as boolean, done: true }; }
                  return u;
                });
              } else if (ev.type === 'done') {
                setMessages([...next, { id: newMsgId(), role: 'assistant', content: ev.content as string, toolCalls: ev.toolCalls as ToolCall[] }]);
                setStreamingContent(''); setLiveToolCalls([]);
              } else if (ev.type === 'error') {
                setMessages([...next, { id: newMsgId(), role: 'assistant', content: `**Error:** ${ev.message as string}` }]);
                setStreamingContent(''); setLiveToolCalls([]);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      setMessages(p => [...p, { id: newMsgId(), role: 'assistant', content: `**Failed:** ${String(e)}` }]);
      setStreamingContent(''); setLiveToolCalls([]);
    } finally { setLoading(false); setLoadingPhase(null); }
  };

  const STARTERS = [
    'Look up DNS for localhost',
    'Show recent network errors',
    'Check security on the login endpoint',
    'What\'s the slowest recent request?',
    'Resolve api.github.com DNS',
  ];

  return (
    <div className="flex h-full flex-col">
      {messages.length === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--foreground)]">
            <Sparkles className="size-5 text-[var(--background)]" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[var(--foreground)]">Network AI Agent</div>
            <div className="mt-1 text-[12px] text-[var(--muted-foreground)]">DNS lookups · log analysis · security checks · API testing</div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 mt-1">
            {STARTERS.map(s => (
              <button key={s} type="button" onClick={() => setInput(s)}
                className="cursor-pointer rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] px-3 py-1.5 text-[11px] text-[var(--foreground)] hover:bg-[var(--elevated)]">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="hide-scrollbar flex-1 overflow-auto space-y-4 px-4 py-4">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex items-start gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
              <div className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                msg.role === 'user' ? 'bg-[var(--foreground)]' : 'border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]')}>
                {msg.role === 'user' ? <User className="size-3 text-[var(--background)]" /> : <Bot className="size-3 text-[var(--muted-foreground)]" />}
              </div>
              <div className={cn('min-w-0', msg.role === 'user' ? 'max-w-[80%]' : 'flex-1')}>
                {msg.role === 'user'
                  ? <div className="rounded-2xl rounded-tr-sm bg-[var(--foreground)] px-3.5 py-2 text-[13px] leading-relaxed text-[var(--background)] shadow-sm">{msg.content}</div>
                  : <div className="pt-0.5"><Markdown content={msg.content} />{msg.toolCalls && msg.toolCalls.length > 0 && <ToolCallsSummary toolCalls={msg.toolCalls} />}</div>
                }
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]">
                <Bot className="size-3 text-[var(--muted-foreground)]" />
              </div>
              <div className="flex-1 pt-0.5">
                {liveToolCalls.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {liveToolCalls.map((tc, i) => {
                      const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap className="size-3" />, color: '#8b5cf6' };
                      return (
                        <div key={i} className={cn('flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] transition-opacity', tc.done ? 'opacity-45' : '')}>
                          <span className="flex size-4 shrink-0 items-center justify-center rounded" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
                          <span className="font-medium text-[var(--foreground)]">{meta.label}<span className="ml-1 font-normal text-[var(--muted-foreground)]">{inputPreview(tc)}</span></span>
                          <span className="ml-auto">{tc.done ? (tc.isError ? <X className="size-3 text-[var(--destructive)]" /> : <Check className="size-3 text-[var(--success)]" />) : <span className="spinner size-3" />}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {streamingContent ? (
                  <div><Markdown content={streamingContent} /><span className="streaming-cursor" /></div>
                ) : loadingPhase === 'thinking' ? (
                  <div className="flex items-center gap-2 text-[11.5px] text-[var(--muted-foreground)]"><span className="spinner size-3" /><span>Thinking…</span></div>
                ) : null}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 focus-within:border-[var(--border-hover)]">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading}
            placeholder="Ask about DNS, logs, security, APIs…"
            rows={1}
            className="flex-1 min-h-[24px] max-h-[120px] resize-none bg-transparent text-[13px] leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--placeholder-foreground)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-full bg-[var(--foreground)] p-1.5 text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {loading ? <span className="spinner size-3.5" style={{ borderTopColor: 'white' }} /> : (
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            )}
          </button>
        </div>
        {messages.length > 0 && (
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => { setMessages([]); setStreamingContent(''); setLiveToolCalls([]); }} className="text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              Clear chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ConsolePage ──────────────────────────────────────────────────────────────

function ConsolePage() {
  return (
    <div className="flex h-full overflow-hidden bg-[var(--background)]">
      {/* Left: DNS & network tools */}
      <div className="flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-[var(--border)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <div className="flex size-[22px] items-center justify-center rounded bg-[var(--foreground)]">
            <Terminal className="size-3 text-[var(--background)]" />
          </div>
          <span className="text-[12.5px] font-bold">Network Console</span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-6">
          <DnsPanel />
          <div className="h-px bg-[var(--border)]" />
          <RecentLogsWidget />
        </div>
      </div>

      {/* Right: AI agent */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <div className="flex size-[22px] items-center justify-center rounded bg-[var(--foreground)]">
            <Bot className="size-3 text-[var(--background)]" />
          </div>
          <span className="text-[12.5px] font-bold">Network AI Agent</span>
          <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">DNS · logs · security · API</span>
        </div>
        <NetworkAiChat />
      </div>
    </div>
  );
}
