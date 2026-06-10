import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import { useApp } from '../context';
import { cacheGet, cacheSet } from '../lib/cache';
import { cn } from '../lib/utils';
import {
  LayoutGrid, Terminal, Activity, Key, Settings, Bot,
  Sun, Moon, Search, ArrowRightLeft,
  ChevronLeft, ChevronRight, ChevronDown, Layers, Keyboard, BugPlay,
} from 'lucide-react';

interface Status { spec: { title: string; version: string }; endpointCount: number; }

const MAIN_NAV = [
  { to: '/',          icon: LayoutGrid,     label: 'Overview',       exact: true  },
  { to: '/explorer',  icon: Terminal,       label: 'Explorer',       exact: false },
  { to: '/ai',        icon: Bot,            label: 'AI Chat',        exact: false },
  { to: '/console',   icon: BugPlay,        label: 'Console',        exact: false },
  { to: '/intercept', icon: ArrowRightLeft, label: 'Intercept',      exact: false },
  { to: '/logs',      icon: Activity,       label: 'Logs',           exact: false },
] as const;

const CONFIG_NAV = [
  { to: '/auth',         icon: Key,      label: 'Authentication', exact: false },
  { to: '/environments', icon: Layers,   label: 'Environments',   exact: false },
  { to: '/settings',     icon: Settings, label: 'Settings',       exact: false },
] as const;

type NavTo = typeof MAIN_NAV[number]['to'] | typeof CONFIG_NAV[number]['to'];

function NavItem({ to, icon: Icon, label, exact, collapsed }: {
  to: NavTo; icon: React.ElementType; label: string; exact: boolean; collapsed: boolean;
}) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + '/');

  if (collapsed) {
    return (
      <Link
        to={to as '/'}
        title={label}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg transition-colors duration-100 no-underline',
          active
            ? 'text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)]'
            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]',
        )}
      >
        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-full bg-[var(--accent)]" />}
        <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0 text-inherit" />
      </Link>
    );
  }

  return (
    <Link
      to={to as '/'}
      className={cn(
        'relative flex items-center gap-2.5 pl-3 pr-2.5 h-8 rounded-lg w-full text-[13.5px] tracking-tight transition-colors duration-100 no-underline',
        active
          ? 'text-[var(--foreground)] font-medium bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)]'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground-secondary)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]',
      )}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-full bg-[var(--accent)]" />}
      <Icon
        size={16}
        strokeWidth={active ? 2.2 : 1.8}
        className={cn('flex-shrink-0', active ? 'text-[var(--accent)]' : 'text-inherit')}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const [status, setStatus] = useState<Status | null>(null);
  const { theme, toggleTheme, setCmdOpen, connected, sidebarCollapsed, toggleSidebar, envs, activeEnvId, setActiveEnvId } = useApp();

  const activeEnv = envs.find(e => e.id === activeEnvId) ?? null;

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

  const collapsed = sidebarCollapsed;
  const w = collapsed ? 'w-[52px] min-w-[52px]' : 'w-[220px] min-w-[220px]';

  return (
    <aside className={cn('h-screen flex flex-col bg-[var(--sidebar)] border-r border-[var(--border)] select-none transition-all duration-200', w)}>

      {/* Header */}
      <div className={cn('flex items-center h-[42px] border-b border-[var(--border)] flex-shrink-0', collapsed ? 'justify-center px-0' : 'gap-2.5 px-4')}>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300"
          style={{
            background: connected ? 'var(--success)' : 'var(--muted-foreground)',
            boxShadow: connected ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
          }}
        />
        {!collapsed && (
          <span className="text-[13.5px] font-semibold tracking-tight text-[var(--foreground)] truncate flex-1 leading-none">
            {status?.spec.title ?? 'Wasper'}
          </span>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 flex-shrink-0">
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg bg-transparent border border-[var(--border)] text-[var(--placeholder-foreground)] text-[12.5px] tracking-tight hover:border-[var(--border-hover)] hover:text-[var(--muted-foreground)] transition-colors cursor-pointer font-sans"
          >
            <Search size={12} className="flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="bg-[var(--elevated)] border border-[var(--border)] rounded px-1.5 text-[10px] font-mono leading-4">⌘K</kbd>
          </button>
        </div>
      )}
      {collapsed && (
        <div className="pt-2 flex-shrink-0 flex justify-center">
          <button
            onClick={() => setCmdOpen(true)}
            title="Search (⌘K)"
            className="w-8 h-8 flex items-center justify-center rounded-md bg-transparent border-0 text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-[var(--foreground-secondary)] transition-colors cursor-pointer"
          >
            <Search size={14} />
          </button>
        </div>
      )}

      {/* Main nav */}
      <nav className={cn('pt-1 flex flex-col gap-0.5 flex-shrink-0', collapsed ? 'px-1' : 'px-2.5')}>
        {MAIN_NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
      </nav>

      {/* Config section */}
      <div className={cn('mt-2 flex-shrink-0', collapsed ? 'px-1' : 'px-2.5')}>
        {!collapsed && (
          <div className="px-1 py-1.5 text-[11px] font-semibold tracking-widest uppercase text-[var(--placeholder-foreground)]">
            Configuration
          </div>
        )}
        {collapsed && <div className="h-[1px] bg-[var(--border)] mx-2 mb-1" />}
        <div className="flex flex-col gap-0.5">
          {CONFIG_NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-0" />

      {/* Environment picker */}
      {envs.length > 0 && (
        <div className={cn('border-t border-[var(--border)] flex-shrink-0', collapsed ? 'px-1.5 py-2' : 'px-2.5 py-2')}>
          {collapsed ? (
            <div
              title={activeEnv?.name ?? 'No env'}
              className="flex items-center justify-center h-7 w-full rounded-md"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: activeEnv?.color ?? 'var(--muted-foreground)' }}
              />
            </div>
          ) : (
            <div className="relative flex items-center gap-2 h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] hover:border-[var(--border-hover)] transition-colors">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: activeEnv?.color ?? 'var(--placeholder-foreground)' }}
              />
              <select
                className="flex-1 min-w-0 text-[12px] bg-transparent border-0 outline-none cursor-pointer text-[var(--foreground-secondary)] font-sans appearance-none pr-4"
                value={activeEnvId ?? ''}
                onChange={e => setActiveEnvId(e.target.value || null)}
              >
                <option value="">No environment</option>
                {envs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 text-[var(--muted-foreground)] pointer-events-none" />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={cn(
        'border-t border-[var(--border)] flex-shrink-0',
        collapsed ? 'flex flex-col items-center gap-1 py-3' : 'flex items-center gap-1.5 px-4 py-3',
      )}>
        {!collapsed && (
          <span className="text-[12px] text-[var(--muted-foreground)] flex-1 truncate">
            {connected
              ? (status ? `${status.endpointCount} endpoints` : 'Connected')
              : 'Disconnected'}
          </span>
        )}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode (Mod+Shift+D)`}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--muted-foreground)] cursor-pointer flex-shrink-0 hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-[var(--foreground)] transition-colors"
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-hotkey-help'))}
          title="Keyboard shortcuts (?)"
          className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--placeholder-foreground)] cursor-pointer flex-shrink-0 hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-[var(--foreground)] transition-colors"
        >
          <Keyboard size={11} />
        </button>
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar (Mod+B)' : 'Collapse sidebar (Mod+B)'}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--muted-foreground)] cursor-pointer flex-shrink-0 hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-[var(--foreground)] transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </aside>
  );
}
