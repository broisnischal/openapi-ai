import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

// ── JWT helpers ───────────────────────────────────────────────────────────────
function b64url(s: string) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - (s.length % 4)) % 4, '='));
}

function decodeJwt(token: string) {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64url(parts[0])) as Record<string, unknown>,
      payload: JSON.parse(b64url(parts[1])) as Record<string, unknown>,
    };
  } catch { return null; }
}

// ── JSON token highlight (inline, no external dep) ────────────────────────────
type Tok = { t: 'key' | 'str' | 'num' | 'bool' | 'null' | 'punct' | 'ws'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      let j = i; while (j < src.length && /\s/.test(src[j])) j++;
      out.push({ t: 'ws', v: src.slice(i, j) }); i = j; continue;
    }
    if (src[i] === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '"') { j++; break; }
        j++;
      }
      const str = src.slice(i, j);
      let k = j; while (k < src.length && /\s/.test(src[k])) k++;
      out.push({ t: src[k] === ':' ? 'key' : 'str', v: str }); i = j; continue;
    }
    if (/[-0-9]/.test(src[i])) {
      let j = i; while (j < src.length && /[-0-9.eE+]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
    }
    let kw = false;
    for (const w of ['true', 'false', 'null'] as const) {
      if (src.startsWith(w, i)) { out.push({ t: w === 'null' ? 'null' : 'bool', v: w }); i += w.length; kw = true; break; }
    }
    if (kw) continue;
    out.push({ t: 'punct', v: src[i] }); i++;
  }
  return out;
}

const TOK_COLOR: Partial<Record<Tok['t'], string>> = {
  key: '#60a5fa', str: '#86efac', num: '#fb923c', bool: '#c084fc', null: '#f87171',
};

function JsonCode({ obj }: { obj: unknown }) {
  const src = JSON.stringify(obj, null, 2);
  const toks = useMemo(() => tokenize(src), [src]);
  return (
    <pre className="whitespace-pre-wrap break-all text-[11.5px] font-mono leading-[1.75]">
      {toks.map((t, i) => {
        const c = TOK_COLOR[t.t];
        return c ? <span key={i} style={{ color: c }}>{t.v}</span> : t.v;
      })}
    </pre>
  );
}

// ── SHA-256 via WebCrypto ─────────────────────────────────────────────────────
async function sha256hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha1hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── CopyButton ────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 2000); };
  return (
    <button type="button" onClick={copy}
      className="flex items-center gap-1 rounded border border-[var(--border)] bg-transparent px-2 py-0.5 text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors cursor-pointer shrink-0">
      {ok ? <><Check size={9} />Copied</> : <><Copy size={9} />Copy</>}
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ label, children, copyText }: { label: string; children: React.ReactNode; copyText?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">{label}</span>
        {copyText && <CopyBtn text={copyText} />}
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] p-3 overflow-auto max-h-[220px]">
        {children}
      </div>
    </div>
  );
}

// ── Tab components ────────────────────────────────────────────────────────────
function JwtTab() {
  const [input, setInput] = useState('');
  const decoded = useMemo(() => (input.trim() ? decodeJwt(input) : null), [input]);

  const exp = decoded?.payload?.exp;
  const iat = decoded?.payload?.iat;
  const now = Math.floor(Date.now() / 1000);
  const expired = typeof exp === 'number' ? exp < now : null;
  const expDate = typeof exp === 'number' ? new Date(exp * 1000).toLocaleString() : null;
  const iatDate = typeof iat === 'number' ? new Date(iat * 1000).toLocaleString() : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">JWT Token</label>
        <textarea
          className="input font-mono text-[11px] min-h-[72px] resize-none py-2 leading-relaxed"
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
          value={input}
          onChange={e => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {input && !decoded && (
        <p className="text-[11.5px] text-[var(--destructive)] bg-[rgba(239,68,68,0.07)] rounded-lg px-3 py-2">
          Invalid JWT — must have exactly 3 base64url-separated parts
        </p>
      )}

      {decoded && (
        <>
          {/* Expiry */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {expired !== null && (
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-[10px] font-semibold border',
                expired
                  ? 'bg-[rgba(239,68,68,0.1)] text-[var(--destructive)] border-[rgba(239,68,68,0.25)]'
                  : 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] border-[rgba(34,197,94,0.25)]',
              )}>
                {expired ? 'Expired' : 'Valid'}
              </span>
            )}
            {expDate && <span className="text-[var(--muted-foreground)]">exp: {expDate}</span>}
            {iatDate && <span className="text-[var(--muted-foreground)]">iat: {iatDate}</span>}
          </div>

          <Section label="Header" copyText={JSON.stringify(decoded.header, null, 2)}>
            <JsonCode obj={decoded.header} />
          </Section>
          <Section label="Payload" copyText={JSON.stringify(decoded.payload, null, 2)}>
            <JsonCode obj={decoded.payload} />
          </Section>
        </>
      )}
    </div>
  );
}

function Base64Tab() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');

  const output = useMemo(() => {
    if (!input) return '';
    try {
      if (mode === 'encode') return btoa(unescape(encodeURIComponent(input)));
      return decodeURIComponent(escape(atob(input)));
    } catch { return '⚠ Invalid input'; }
  }, [input, mode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(['encode', 'decode'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn(
              'h-7 px-3 rounded text-[11.5px] font-medium capitalize transition-colors cursor-pointer border',
              mode === m
                ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Input</span>
        <textarea className="input font-mono text-[11px] min-h-[80px] resize-y py-2"
          placeholder={mode === 'encode' ? 'Plain text…' : 'Base64 string…'}
          value={input} onChange={e => setInput(e.target.value)} spellCheck={false} />
      </div>
      {input && (
        <Section label="Output" copyText={output}>
          <p className="font-mono text-[11.5px] break-all">{output}</p>
        </Section>
      )}
    </div>
  );
}

function UrlTab() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');

  const output = useMemo(() => {
    if (!input) return '';
    try {
      return mode === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
    } catch { return '⚠ Invalid input'; }
  }, [input, mode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(['encode', 'decode'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn(
              'h-7 px-3 rounded text-[11.5px] font-medium capitalize transition-colors cursor-pointer border',
              mode === m
                ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Input</span>
        <textarea className="input font-mono text-[11px] min-h-[80px] resize-y py-2"
          placeholder={mode === 'encode' ? 'text to encode…' : '%2F encoded string…'}
          value={input} onChange={e => setInput(e.target.value)} spellCheck={false} />
      </div>
      {input && (
        <Section label="Output" copyText={output}>
          <p className="font-mono text-[11.5px] break-all">{output}</p>
        </Section>
      )}
    </div>
  );
}

function HashTab() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<{ sha256: string; sha1: string } | null>(null);

  useEffect(() => {
    if (!input) { setHashes(null); return; }
    let dead = false;
    Promise.all([sha256hex(input), sha1hex(input)]).then(([sha256, sha1]) => {
      if (!dead) setHashes({ sha256, sha1 });
    }).catch(() => {});
    return () => { dead = true; };
  }, [input]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Input</span>
        <textarea className="input font-mono text-[11px] min-h-[80px] resize-y py-2"
          placeholder="Text to hash…"
          value={input} onChange={e => setInput(e.target.value)} spellCheck={false} />
      </div>
      {hashes && (
        <div className="flex flex-col gap-2.5">
          {[
            { label: 'SHA-256', value: hashes.sha256 },
            { label: 'SHA-1', value: hashes.sha1 },
          ].map(({ label, value }) => (
            <Section key={label} label={label} copyText={value}>
              <p className="font-mono text-[11px] break-all text-[var(--foreground)]">{value}</p>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

function JsonTab() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'pretty' | 'minify'>('pretty');

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: '', error: null };
    try {
      const parsed = JSON.parse(input);
      const out = mode === 'pretty' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      return { output: out, error: null };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [input, mode]);

  const toks = useMemo(() => (output ? tokenize(output) : []), [output]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(['pretty', 'minify'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn(
              'h-7 px-3 rounded text-[11.5px] font-medium capitalize transition-colors cursor-pointer border',
              mode === m
                ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Input</span>
        <textarea className="input font-mono text-[11px] min-h-[100px] resize-y py-2"
          placeholder='{"key": "value"}' value={input}
          onChange={e => setInput(e.target.value)} spellCheck={false} />
      </div>
      {error && (
        <p className="rounded-lg bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] px-3 py-2 text-[11px] text-[var(--destructive)]">
          {error}
        </p>
      )}
      {output && !error && (
        <Section label="Output" copyText={output}>
          <pre className="whitespace-pre-wrap break-all text-[11.5px] font-mono leading-[1.7]">
            {toks.map((t, i) => {
              const c = TOK_COLOR[t.t];
              return c ? <span key={i} style={{ color: c }}>{t.v}</span> : t.v;
            })}
          </pre>
        </Section>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'jwt',    label: 'JWT' },
  { id: 'base64', label: 'Base64' },
  { id: 'url',    label: 'URL' },
  { id: 'hash',   label: 'Hash' },
  { id: 'json',   label: 'JSON' },
] as const;

type TabId = typeof TABS[number]['id'];

export function DecoderPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('jwt');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[1800] bg-black/30 backdrop-blur-[1px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-[1801] flex h-full w-[420px] flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-2xl"
        style={{ animation: 'slide-in-right 0.18s ease' }}>

        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 h-[50px]">
          <span className="text-[13px] font-semibold text-[var(--foreground)]">Decoder / Encoder</span>
          <div className="ml-auto flex items-center gap-1.5">
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted-foreground)]">
              Esc
            </kbd>
            <button type="button" onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--elevated)] transition-colors cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-[var(--border)] px-4">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn(
                'relative px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer border-0 bg-transparent',
                tab === t.id ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)]',
              )}>
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-t-full bg-[var(--foreground)]" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'jwt'    && <JwtTab />}
          {tab === 'base64' && <Base64Tab />}
          {tab === 'url'    && <UrlTab />}
          {tab === 'hash'   && <HashTab />}
          {tab === 'json'   && <JsonTab />}
        </div>
      </div>
    </>,
    document.body,
  );
}
