import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Play, Square, Plus, Trash2, BarChart2, List, Gauge, Copy, Check, AlertTriangle } from 'lucide-react';
import { authHeaders } from '../lib/api';
import { cn } from '../lib/utils';

export const Route = createFileRoute('/load-test')({ component: LoadTestPage });

// ── Types ──────────────────────────────────────────────────────────────────────
interface HeaderPair { key: string; value: string; enabled: boolean }

interface Config {
  url: string; method: string; body: string;
  headers: HeaderPair[];
  vus: number; rampUp: number;
  mode: 'duration' | 'count';
  duration: number; count: number;
}

interface Sample {
  id: number; startMs: number;
  ttfbMs: number; totalMs: number;
  status: number | null; size: number;
  error: string | null;
}

interface LiveStats {
  total: number; errors: number; activeVus: number;
  samples: Sample[];
  byStatus: Record<number, number>;
  rpsHistory: { t: number; rps: number }[];
  latHistory: { t: number; p50: number; p95: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function calcPercentiles(samples: Sample[]) {
  if (!samples.length) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  const v = [...samples.map(s => s.totalMs)].sort((a, b) => a - b);
  return {
    p50: pct(v, 50), p95: pct(v, 95), p99: pct(v, 99),
    min: v[0], max: v[v.length - 1],
    avg: v.reduce((a, b) => a + b, 0) / v.length,
  };
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function fmtSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function latColor(ms: number) {
  if (ms < 150) return '#22c55e';
  if (ms < 500) return '#a3e635';
  if (ms < 1200) return '#f59e0b';
  return '#f87171';
}

function statusColor(s: number | null) {
  if (!s) return 'var(--muted-foreground)';
  if (s < 300) return '#22c55e';
  if (s < 400) return '#f59e0b';
  if (s < 500) return '#f87171';
  return '#dc2626';
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const EMPTY_STATS: LiveStats = {
  total: 0, errors: 0, activeVus: 0, samples: [],
  byStatus: {}, rpsHistory: [], latHistory: [],
};

// ── SVG Chart ─────────────────────────────────────────────────────────────────
function LatencyChart({ latHistory, rpsHistory }: {
  latHistory: LiveStats['latHistory'];
  rpsHistory: LiveStats['rpsHistory'];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(600);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = 120;
  const pad = { l: 38, r: 12, t: 10, b: 22 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  if (latHistory.length < 2) {
    return (
      <div className="flex h-[120px] items-center justify-center text-[11px] text-[var(--muted-foreground)]">
        Collecting data…
      </div>
    );
  }

  const minT = latHistory[0].t;
  const maxT = latHistory[latHistory.length - 1].t;
  const tR = maxT - minT || 1;
  const maxLat = Math.max(...latHistory.map(d => d.p95), 10);
  const maxRps = Math.max(...rpsHistory.map(d => d.rps), 1);

  const tx = (t: number) => pad.l + ((t - minT) / tR) * cw;
  const ty = (v: number) => pad.t + (1 - v / maxLat) * ch;

  const p95Pts = latHistory.map(d => `${tx(d.t)},${ty(d.p95)}`).join(' ');
  const p50Pts = latHistory.map(d => `${tx(d.t)},${ty(d.p50)}`).join(' ');
  const lastX = tx(latHistory[latHistory.length - 1].t);
  const firstX = tx(latHistory[0].t);
  const areaClose = `${lastX},${pad.t + ch} ${firstX},${pad.t + ch}`;

  const yTicks = [0, 0.5, 1].map(f => ({
    v: Math.round(maxLat * f),
    y: pad.t + (1 - f) * ch,
  }));

  return (
    <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none" className="overflow-visible block">
      {/* Grid + Y labels */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={pad.l} y1={y} x2={pad.l + cw} y2={y}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <text x={pad.l - 4} y={y + 3.5} fontSize={9} fill="rgba(255,255,255,0.28)" textAnchor="end">
            {v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}`}
          </text>
        </g>
      ))}

      {/* RPS bars */}
      {rpsHistory.map((d, i) => {
        const x = tx(d.t);
        const nxt = rpsHistory[i + 1]?.t ?? d.t + 1;
        const bw = Math.max(1, tx(nxt) - x - 1);
        const bh = (d.rps / maxRps) * ch * 0.28;
        return (
          <rect key={i} x={x} y={pad.t + ch - bh} width={bw} height={bh}
            fill="rgba(96,165,250,0.1)" />
        );
      })}

      {/* P95 fill */}
      <polygon points={`${p95Pts} ${areaClose}`} fill="rgba(251,146,60,0.07)" />
      {/* P95 line */}
      <polyline points={p95Pts} fill="none" stroke="rgba(251,146,60,0.45)"
        strokeWidth={1.2} strokeLinejoin="round" />
      {/* P50 line */}
      <polyline points={p50Pts} fill="none" stroke="#22c55e"
        strokeWidth={1.8} strokeLinejoin="round" />

      {/* X axis */}
      <line x1={pad.l} y1={pad.t + ch} x2={pad.l + cw} y2={pad.t + ch}
        stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
    </svg>
  );
}

// ── Waterfall ─────────────────────────────────────────────────────────────────
function WaterfallChart({ samples }: { samples: Sample[] }) {
  const rows = useMemo(
    () => [...samples].sort((a, b) => a.startMs - b.startMs).slice(0, 200),
    [samples],
  );

  if (!rows.length) {
    return (
      <div className="flex h-24 items-center justify-center text-[11px] text-[var(--muted-foreground)]">
        No samples yet
      </div>
    );
  }

  const maxEnd = Math.max(...rows.map(s => s.startMs + s.totalMs));
  const W = 380;

  return (
    <div className="overflow-auto">
      <div className="min-w-[560px]">
        {/* Legend */}
        <div className="flex items-center gap-5 px-3 py-2 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm inline-block bg-[#60a5fa]" />TTFB</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm inline-block bg-[#34d399]" />Download</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm inline-block bg-[#f87171]" />Error</span>
          <span className="ml-auto">{rows.length} requests</span>
        </div>

        {rows.map(s => {
          const scale = W / maxEnd;
          const x = s.startMs * scale;
          const wTtfb = Math.max(1, s.ttfbMs * scale);
          const wDl = Math.max(1, (s.totalMs - s.ttfbMs) * scale);
          return (
            <div key={s.id}
              className="flex items-center gap-2 h-[22px] px-3 border-b border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] transition-colors">
              <span className="w-[28px] shrink-0 font-mono text-[10px] tabular-nums text-right" style={{ color: statusColor(s.status) }}>
                {s.status ?? '—'}
              </span>
              <div className="relative flex-1 h-[10px] rounded-sm overflow-hidden"
                style={{ background: 'color-mix(in srgb, var(--foreground) 5%, transparent)' }}>
                {s.error ? (
                  <div className="absolute h-full rounded-sm bg-[#f87171]/60"
                    style={{ left: x, width: Math.max(2, s.totalMs * scale) }} />
                ) : (
                  <>
                    <div className="absolute h-full rounded-l-sm bg-[#60a5fa]/75"
                      style={{ left: x, width: wTtfb }} />
                    <div className="absolute h-full bg-[#34d399]/70"
                      style={{ left: x + wTtfb, width: wDl }} />
                  </>
                )}
              </div>
              <span className="w-[46px] shrink-0 text-right font-mono text-[10px] tabular-nums"
                style={{ color: latColor(s.totalMs) }}>
                {fmtMs(s.totalMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function LoadTestPage() {
  const [config, setConfig] = useState<Config>({
    url: '', method: 'GET', body: '', headers: [],
    vus: 10, rampUp: 0, mode: 'duration', duration: 30, count: 100,
  });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [tab, setTab] = useState<'chart' | 'waterfall' | 'requests'>('chart');
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  const cfg = (p: Partial<Config>) => setConfig(c => ({ ...c, ...p }));
  const addHeader = () => cfg({ headers: [...config.headers, { key: '', value: '', enabled: true }] });
  const removeHeader = (i: number) => cfg({ headers: config.headers.filter((_, j) => j !== i) });
  const setHeaderField = (i: number, k: keyof HeaderPair, v: string | boolean) => {
    const h = [...config.headers];
    h[i] = { ...h[i], [k]: v };
    cfg({ headers: h });
  };

  const run = useCallback(async () => {
    if (!config.url) return;
    setRunning(true);
    setDone(false);
    setTab('chart');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startTime = performance.now();
    let sampleId = 0;
    let stopped = false;

    setStats(EMPTY_STATS);

    const hdrs: Record<string, string> = { ...authHeaders() };
    for (const h of config.headers) {
      if (h.enabled && h.key) hdrs[h.key] = h.value;
    }
    const fetchOpts: RequestInit = { method: config.method, headers: hdrs, signal: ctrl.signal };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(config.method) && config.body) {
      fetchOpts.body = config.body;
      if (!hdrs['content-type'] && !hdrs['Content-Type'])
        hdrs['content-type'] = 'application/json';
    }

    const doReq = async (): Promise<Sample> => {
      const id = sampleId++;
      const t0 = performance.now();
      const startMs = t0 - startTime;
      try {
        const resp = await fetch(config.url, { ...fetchOpts, signal: ctrl.signal });
        const ttfbMs = performance.now() - t0;
        const text = await resp.text();
        return { id, startMs, ttfbMs, totalMs: performance.now() - t0, status: resp.status, size: new Blob([text]).size, error: null };
      } catch (e: unknown) {
        return { id, startMs, ttfbMs: 0, totalMs: performance.now() - t0, status: null, size: 0, error: e instanceof Error ? e.message : 'Error' };
      }
    };

    // Rolling metrics updater
    const metricsTimer = setInterval(() => {
      setStats(prev => {
        const nowSec = (performance.now() - startTime) / 1000;
        const windowSamples = prev.samples.filter(s => s.startMs > (performance.now() - startTime) - 1000);
        const rps = windowSamples.length;
        const latSorted = windowSamples.map(s => s.totalMs).sort((a, b) => a - b);
        const newLat = latSorted.length ? { t: nowSec, p50: pct(latSorted, 50), p95: pct(latSorted, 95) } : null;
        return {
          ...prev,
          rpsHistory: [...prev.rpsHistory.slice(-90), { t: nowSec, rps }],
          latHistory: newLat ? [...prev.latHistory.slice(-90), newLat] : prev.latHistory,
        };
      });
    }, 500);

    const runVu = async (vuIdx: number) => {
      if (config.rampUp > 0) {
        await new Promise(r => setTimeout(r, (vuIdx / Math.max(config.vus - 1, 1)) * config.rampUp * 1000));
      }
      setStats(s => ({ ...s, activeVus: s.activeVus + 1 }));
      while (!stopped && !ctrl.signal.aborted) {
        const elapsed = (performance.now() - startTime) / 1000;
        if (config.mode === 'duration' && elapsed >= config.duration) break;
        if (config.mode === 'count' && statsRef.current.total >= config.count) break;
        const sample = await doReq();
        if (ctrl.signal.aborted) break;
        setStats(prev => ({
          ...prev,
          total: prev.total + 1,
          errors: prev.errors + (!!(sample.error || (sample.status != null && sample.status >= 400)) ? 1 : 0),
          samples: [...prev.samples.slice(-2000), sample],
          byStatus: sample.status != null
            ? { ...prev.byStatus, [sample.status]: (prev.byStatus[sample.status] ?? 0) + 1 }
            : prev.byStatus,
        }));
      }
      setStats(s => ({ ...s, activeVus: Math.max(0, s.activeVus - 1) }));
    };

    if (config.mode === 'duration') {
      setTimeout(() => { stopped = true; ctrl.abort(); }, (config.duration + config.rampUp) * 1000 + 200);
    }

    await Promise.allSettled(Array.from({ length: config.vus }, (_, i) => runVu(i)));
    clearInterval(metricsTimer);
    setRunning(false);
    setDone(true);
  }, [config]);

  const stop = () => { abortRef.current?.abort(); setRunning(false); setDone(true); };
  const clear = () => { setDone(false); setStats(EMPTY_STATS); };

  const pct_ = useMemo(() => calcPercentiles(stats.samples), [stats.samples]);
  const errRate = stats.total ? ((stats.errors / stats.total) * 100).toFixed(1) : '0.0';
  const liveRps = stats.rpsHistory[stats.rpsHistory.length - 1]?.rps ?? 0;
  const target = config.mode === 'count' ? config.count : null;

  const STAT_CARDS = [
    { label: 'Requests', value: `${stats.total}${target ? ` / ${target}` : ''}`, color: undefined },
    { label: 'RPS', value: liveRps.toString(), color: '#60a5fa' },
    { label: 'Errors', value: `${stats.errors} (${errRate}%)`, color: stats.errors > 0 ? '#f87171' : '#22c55e' },
    { label: 'P50', value: pct_.p50 ? fmtMs(pct_.p50) : '—', color: pct_.p50 ? latColor(pct_.p50) : undefined },
    { label: 'P95', value: pct_.p95 ? fmtMs(pct_.p95) : '—', color: pct_.p95 ? latColor(pct_.p95) : undefined },
    { label: 'P99', value: pct_.p99 ? fmtMs(pct_.p99) : '—', color: pct_.p99 ? latColor(pct_.p99) : undefined },
    { label: 'Min', value: pct_.min ? fmtMs(pct_.min) : '—', color: undefined },
    { label: 'Max', value: pct_.max ? fmtMs(pct_.max) : '—', color: pct_.max ? latColor(pct_.max) : undefined },
    { label: 'VUs active', value: stats.activeVus.toString(), color: running ? '#a78bfa' : undefined },
  ] as const;

  return (
    <div className="flex h-full overflow-hidden bg-[var(--background)]">

      {/* ── Config panel ── */}
      <div className="w-[300px] shrink-0 flex flex-col border-r border-[var(--border)] overflow-y-auto">
        <header className="flex items-center gap-2 shrink-0 px-4 h-[46px] border-b border-[var(--border)]">
          <Gauge size={13} className="text-[var(--accent)]" />
          <span className="text-[13px] font-semibold text-[var(--foreground)]">Load Test</span>
          <button type="button" onClick={() => { navigator.clipboard.writeText(JSON.stringify(config, null, 2)).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="ml-auto p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer rounded">
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </header>

        <div className="flex-1 flex flex-col gap-5 p-4 overflow-y-auto">

          {/* URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Target URL</label>
            <input className="input font-mono text-[12px] h-8" placeholder="https://api.example.com/path"
              value={config.url} onChange={e => cfg({ url: e.target.value })} />
          </div>

          {/* Method */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Method</label>
            <div className="flex flex-wrap gap-1">
              {METHODS.map(m => (
                <button key={m} type="button" onClick={() => cfg({ method: m })}
                  className={cn(
                    'h-[26px] px-2 rounded text-[10.5px] font-mono font-bold transition-colors cursor-pointer border',
                    config.method === m
                      ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--elevated)]',
                  )}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          {!['GET', 'HEAD', 'OPTIONS'].includes(config.method) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Body</label>
              <textarea className="input font-mono text-[11.5px] min-h-[72px] resize-y py-2" placeholder='{"key":"value"}'
                value={config.body} onChange={e => cfg({ body: e.target.value })} />
            </div>
          )}

          {/* Headers */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Headers</label>
              <button type="button" onClick={addHeader}
                className="flex items-center gap-1 text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                <Plus size={10} />Add
              </button>
            </div>
            {config.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-1">
                <input className="input h-7 text-[11px] font-mono w-0 flex-1" placeholder="Key"
                  value={h.key} onChange={e => setHeaderField(i, 'key', e.target.value)} />
                <input className="input h-7 text-[11px] font-mono w-0 flex-1" placeholder="Value"
                  value={h.value} onChange={e => setHeaderField(i, 'value', e.target.value)} />
                <button type="button" onClick={() => removeHeader(i)}
                  className="shrink-0 p-1 text-[var(--placeholder-foreground)] hover:text-[var(--destructive)] transition-colors cursor-pointer rounded">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
            {!config.headers.length && (
              <p className="text-[11px] italic text-[var(--placeholder-foreground)]">No headers</p>
            )}
          </div>

          {/* Virtual Users */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Virtual Users</label>
              <span className="font-mono text-[13px] font-bold tabular-nums text-[var(--foreground)]">{config.vus}</span>
            </div>
            <input type="range" min={1} max={100} value={config.vus}
              onChange={e => cfg({ vus: Number(e.target.value) })}
              className="w-full accent-[var(--accent)] h-1.5 cursor-pointer" />
            <div className="flex justify-between text-[9.5px] text-[var(--placeholder-foreground)]">
              <span>1</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>

          {/* Ramp-up */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Ramp-up</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={300} className="input h-8 text-[12px] flex-1 tabular-nums"
                value={config.rampUp} onChange={e => cfg({ rampUp: Number(e.target.value) })} />
              <span className="text-[12px] text-[var(--muted-foreground)] shrink-0">seconds</span>
            </div>
            <p className="text-[10px] text-[var(--placeholder-foreground)]">0 = all VUs start at once</p>
          </div>

          {/* Stop condition */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">Stop after</label>
            <div className="flex gap-1.5">
              {(['duration', 'count'] as const).map(m => (
                <button key={m} type="button" onClick={() => cfg({ mode: m })}
                  className={cn(
                    'flex-1 h-8 rounded text-[11.5px] font-medium transition-colors cursor-pointer border',
                    config.mode === m
                      ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--elevated)]',
                  )}>
                  {m === 'duration' ? 'Duration' : 'Request count'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={config.mode === 'duration' ? 3600 : 1000000}
                className="input h-8 text-[12px] flex-1 tabular-nums"
                value={config.mode === 'duration' ? config.duration : config.count}
                onChange={e => config.mode === 'duration' ? cfg({ duration: Number(e.target.value) }) : cfg({ count: Number(e.target.value) })} />
              <span className="text-[12px] text-[var(--muted-foreground)] shrink-0">
                {config.mode === 'duration' ? 'seconds' : 'requests'}
              </span>
            </div>
          </div>
        </div>

        {/* Run / Stop */}
        <div className="shrink-0 p-4 border-t border-[var(--border)] flex flex-col gap-2">
          {running ? (
            <button type="button" onClick={stop}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[var(--destructive)] text-[13px] font-semibold hover:bg-[rgba(239,68,68,0.18)] transition-colors cursor-pointer">
              <Square size={12} />Stop
            </button>
          ) : (
            <button type="button" onClick={run} disabled={!config.url}
              className={cn(
                'flex items-center justify-center gap-2 w-full h-9 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-0',
                config.url
                  ? 'bg-[var(--accent)] text-white hover:opacity-90'
                  : 'bg-[var(--elevated)] text-[var(--muted-foreground)] cursor-not-allowed',
              )}>
              <Play size={12} />{done ? 'Run Again' : 'Start Test'}
            </button>
          )}
          {done && !running && (
            <button type="button" onClick={clear}
              className="w-full h-7 rounded text-[11.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
              Clear results
            </button>
          )}
        </div>
      </div>

      {/* ── Results panel ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Stats bar */}
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3">
          <div className="flex flex-wrap items-start gap-x-7 gap-y-2">
            {STAT_CARDS.map(({ label, value, color }) => (
              <div key={label} className="flex flex-col gap-0.5 min-w-[52px]">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">{label}</span>
                <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: color ?? 'var(--foreground)' }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Status badges */}
            {Object.keys(stats.byStatus).length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Status</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {Object.entries(stats.byStatus).sort(([a], [b]) => Number(a) - Number(b)).map(([s, n]) => (
                    <span key={s} className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold"
                      style={{ color: statusColor(Number(s)), background: `${statusColor(Number(s))}18` }}>
                      {s}×{n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {(running || done) && (
            <div className="mt-3 h-[3px] rounded-full overflow-hidden"
              style={{ background: 'color-mix(in srgb, var(--foreground) 7%, transparent)' }}>
              {config.mode === 'count' && target ? (
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${Math.min(100, (stats.total / target) * 100)}%` }} />
              ) : running ? (
                <div className="h-full w-1/3 rounded-full bg-[var(--accent)] animate-pulse" />
              ) : (
                <div className="h-full w-full rounded-full bg-[var(--accent)]" />
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex gap-0.5 border-b border-[var(--border)] px-4">
          {([
            { id: 'chart', label: 'Chart', icon: BarChart2 },
            { id: 'waterfall', label: 'Waterfall', icon: List },
            { id: 'requests', label: 'Requests', icon: List },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer border-0 bg-transparent',
                tab === id ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}>
              <Icon size={11} />{label}
              {tab === id && <span className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-t-full bg-[var(--foreground)]" />}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-auto p-4">

          {/* Chart tab */}
          {tab === 'chart' && (
            <div className="flex flex-col gap-5 max-w-[900px]">
              {!running && !done ? (
                <div className="flex flex-col items-center justify-center gap-3 py-28 text-center">
                  <Gauge size={30} className="opacity-30 text-[var(--foreground)]" />
                  <p className="text-[13px] font-medium text-[var(--foreground-secondary)]">Configure and run a load test</p>
                  <p className="text-[12px] text-[var(--muted-foreground)]">Real-time metrics appear here as requests complete</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[12px] font-semibold text-[var(--foreground)]">Latency over time</span>
                      <div className="flex items-center gap-4 text-[10px] text-[var(--muted-foreground)]">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full bg-[#22c55e]" />P50</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full bg-[rgba(251,146,60,0.5)]" />P95</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-[rgba(96,165,250,0.18)]" />RPS</span>
                      </div>
                    </div>
                    <LatencyChart latHistory={stats.latHistory} rpsHistory={stats.rpsHistory} />
                  </div>

                  {done && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-[var(--border)]">
                        <span className="text-[12px] font-semibold text-[var(--foreground)]">Summary</span>
                      </div>
                      <div className="divide-y divide-[var(--border)]">
                        {([
                          ['Total requests', stats.total],
                          ['Errors', `${stats.errors} (${errRate}%)`],
                          ['Average', pct_.avg ? fmtMs(pct_.avg) : '—'],
                          ['P50 (median)', pct_.p50 ? fmtMs(pct_.p50) : '—'],
                          ['P95', pct_.p95 ? fmtMs(pct_.p95) : '—'],
                          ['P99', pct_.p99 ? fmtMs(pct_.p99) : '—'],
                          ['Min', pct_.min ? fmtMs(pct_.min) : '—'],
                          ['Max', pct_.max ? fmtMs(pct_.max) : '—'],
                          ['Virtual users', config.vus],
                          ['Ramp-up', config.rampUp ? `${config.rampUp}s` : 'None'],
                        ] as [string, string | number][]).map(([k, v]) => (
                          <div key={k} className="flex items-center px-4 py-2">
                            <span className="flex-1 text-[12px] text-[var(--muted-foreground)]">{k}</span>
                            <span className="font-mono text-[12px] font-semibold text-[var(--foreground)]">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats.errors > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] px-3 py-2.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5 text-[var(--destructive)]" />
                      <p className="text-[11.5px] text-[var(--foreground-secondary)]">
                        {stats.errors} request{stats.errors !== 1 ? 's' : ''} failed ({errRate}%). Check CORS policy,
                        server availability, and request format.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Waterfall tab */}
          {tab === 'waterfall' && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden max-w-[900px]">
              <WaterfallChart samples={stats.samples} />
            </div>
          )}

          {/* Requests tab */}
          {tab === 'requests' && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden max-w-[900px]">
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--foreground)]">Requests</span>
                <span className="text-[10.5px] text-[var(--muted-foreground)]">{stats.samples.length} total (showing 500)</span>
              </div>
              <div className="overflow-auto max-h-[calc(100vh-260px)]">
                {!stats.samples.length ? (
                  <div className="flex items-center justify-center py-16 text-[11px] text-[var(--muted-foreground)]">
                    No requests recorded yet
                  </div>
                ) : (
                  <table className="w-full text-[11.5px]">
                    <thead className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)]">
                      <tr>
                        {['#', 'Status', 'TTFB', 'Total', 'Size', 'Error'].map(h => (
                          <th key={h} className={cn(
                            'px-3 py-2 text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]',
                            h === '#' || h === 'Error' ? 'text-left' : 'text-right',
                          )}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {[...stats.samples].reverse().slice(0, 500).map(s => (
                        <tr key={s.id} className="hover:bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] transition-colors">
                          <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--muted-foreground)]">{s.id + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-right tabular-nums font-semibold" style={{ color: statusColor(s.status) }}>
                            {s.status ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-right tabular-nums" style={{ color: latColor(s.ttfbMs) }}>
                            {fmtMs(s.ttfbMs)}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-right tabular-nums font-bold" style={{ color: latColor(s.totalMs) }}>
                            {fmtMs(s.totalMs)}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-right tabular-nums text-[var(--muted-foreground)]">
                            {s.size ? fmtSize(s.size) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--destructive)] truncate max-w-[200px]">
                            {s.error ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
