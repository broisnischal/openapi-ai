import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import { useApp } from '../context';
import { cacheGet, cacheSet } from '../lib/cache';
import {
  LayoutGrid, Terminal, Activity, Key, Settings, Bot,
  Sun, Moon, BookOpen, ExternalLink, Search, ArrowRightLeft,
  ChevronRight, Layers,
} from 'lucide-react';

interface Status { spec: { title: string; version: string }; endpointCount: number; }
interface Op { operationId: string; method: string; path: string; tags?: string[]; summary?: string; }

const MAIN_NAV = [
  { to: '/',          icon: LayoutGrid,     label: 'Overview',      exact: true  },
  { to: '/explorer',  icon: Terminal,       label: 'Explorer',      exact: false },
  { to: '/ai',        icon: Bot,            label: 'AI Chat',       exact: false },
  { to: '/intercept', icon: ArrowRightLeft, label: 'Intercept',     exact: false },
  { to: '/logs',      icon: Activity,       label: 'Logs',          exact: false },
] as const;

const CONFIG_NAV = [
  { to: '/auth',     icon: Key,      label: 'Authentication', exact: false },
  { to: '/settings', icon: Settings, label: 'Settings',       exact: false },
] as const;

type NavTo = typeof MAIN_NAV[number]['to'] | typeof CONFIG_NAV[number]['to'];

function NavItem({ to, icon: Icon, label, exact }: { to: NavTo; icon: React.ElementType; label: string; exact: boolean }) {
  const router = useRouter();
  const cur = router.state.location.pathname;
  const active = exact ? cur === to : cur === to || cur.startsWith(to + '/');
  return (
    <Link
      to={to as '/'}
      className={`nav-item${active ? ' active' : ''}`}
    >
      <Icon size={15} strokeWidth={active ? 2.1 : 1.7} style={{ flexShrink: 0, color: 'inherit' }} />
      {label}
    </Link>
  );
}

function EndpointTree() {
  const [ops, setOps] = useState<Op[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    cacheGet<Op[]>('spec_endpoints').then(c => { if (c?.length) setOps(c); });
    apiClient<Op[]>('/api/spec/endpoints').then(d => {
      setOps(d);
      if (d.length) cacheSet('spec_endpoints', d, 600_000);
    }).catch(() => {});
  }, []);

  if (!ops.length) return null;

  const byTag: Record<string, Op[]> = {};
  for (const op of ops) {
    const tag = op.tags?.[0] ?? 'General';
    (byTag[tag] ??= []).push(op);
  }
  const tags = Object.keys(byTag).slice(0, 10);
  const METHOD_COLOR: Record<string, string> = {
    GET: 'var(--method-get)', POST: 'var(--method-post)',
    PUT: 'var(--method-put)', PATCH: 'var(--method-patch)',
    DELETE: 'var(--method-delete)',
  };

  const toggle = (tag: string) => setExpanded(p => {
    const n = new Set(p);
    n.has(tag) ? n.delete(tag) : n.add(tag);
    return n;
  });

  return (
    <div style={{ padding: '0 10px', marginTop: 2 }}>
      <div className="section-label" style={{ padding: '10px 10px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Layers size={11} style={{ opacity: 0.6 }} />
        API Structure
      </div>
      {tags.map(tag => {
        const open = expanded.has(tag);
        return (
          <div key={tag}>
            <button className="tree-tag" onClick={() => toggle(tag)}>
              <ChevronRight size={10} style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
              <span style={{ fontSize: 10, background: 'var(--elevated)', color: 'var(--placeholder-foreground)', borderRadius: 9999, padding: '1px 6px', flexShrink: 0 }}>
                {byTag[tag].length}
              </span>
            </button>
            {open && byTag[tag].slice(0, 12).map(op => (
              <Link
                key={op.operationId}
                to="/explorer"
                className="tree-ep"
              >
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'GeistMono, monospace', color: METHOD_COLOR[op.method.toUpperCase()] ?? 'var(--muted-foreground)', minWidth: 28, flexShrink: 0 }}>
                  {op.method.toUpperCase().slice(0, 3)}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {op.summary ?? (op.path.split('/').filter(Boolean).pop() ?? op.path)}
                </span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const [status, setStatus] = useState<Status | null>(null);
  const { theme, toggleTheme, setCmdOpen, connected } = useApp();

  useEffect(() => {
    if (!connected) { setStatus(null); return; }
    let dead = false;
    const load = async () => {
      try {
        const cached = await cacheGet<Status>('spec_status');
        if (cached && !dead) setStatus(cached);
        const d = await apiClient<Status>('/api/status');
        if (!dead) { setStatus(d); if (d.spec) cacheSet('spec_status', d, 60_000); }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { dead = true; clearInterval(t); };
  }, [connected]);

  return (
    <aside style={{
      width: 232, minWidth: 232,
      background: 'var(--sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', userSelect: 'none',
    }}>

      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: connected ? 'var(--primary)' : 'var(--muted-foreground)',
          boxShadow: connected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
          display: 'inline-block', transition: 'background 0.3s',
        }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '20px', flex: 1 }}>
          {status?.spec.title ?? 'OpenAPI Agent'}
        </span>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 6px' }}>
        <button
          onClick={() => setCmdOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--placeholder-foreground)', fontSize: 12.5,
            fontFamily: 'inherit', letterSpacing: '-0.01em', cursor: 'pointer',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = 'var(--border-hover)'; b.style.color = 'var(--muted-foreground)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--placeholder-foreground)'; }}
        >
          <Search size={12} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
          <kbd style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'GeistMono, monospace', lineHeight: '16px' }}>⌘K</kbd>
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ padding: '2px 10px 0' }}>
        {MAIN_NAV.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Config section */}
      <div style={{ padding: '0 10px' }}>
        <div className="section-label">Configuration</div>
        {CONFIG_NAV.map(item => <NavItem key={item.to} {...item} />)}
      </div>

      {/* Endpoint tree (only when spec loaded) */}
      {status?.spec && <EndpointTree />}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom links */}
      <div style={{ padding: '0 10px', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer"
          className="nav-item" style={{ display: 'flex' }}
        >
          <BookOpen size={15} strokeWidth={1.7} style={{ flexShrink: 0, color: 'inherit' }} />
          Documentation
          <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.4 }} />
        </a>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {connected
            ? (status ? `${status.endpointCount} endpoints` : 'Connected')
            : 'Disconnected'}
        </span>
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted-foreground)', cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.12s, color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--foreground)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted-foreground)'; }}
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </aside>
  );
}
