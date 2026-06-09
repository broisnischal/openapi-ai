import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CommandPalette } from '../components/CommandPalette';
import { AppContext } from '../context';
import { apiClient, getCliUrl, setCliUrl, clearCliUrl } from '../lib/api';
import { injectFonts } from '../fonts';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'OpenAPI Agent Studio' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
        {/* Prevent theme flash before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
            document.documentElement.setAttribute('data-theme', t);
          } catch(e) {}
        ` }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

Route.update({ component: AppShell });

function OfflineCard() {
  const currentUrl = getCliUrl();
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [showConfig, setShowConfig] = useState(false);
  // localhost/127.0.0.1 are loopback — browsers exempt them from mixed-content rules.
  // Only warn when the target is a non-localhost HTTP URL on an HTTPS page.
  const isUnsafeMix = typeof window !== 'undefined'
    && window.location.protocol === 'https:'
    && urlInput.startsWith('http:')
    && !urlInput.startsWith('http://localhost')
    && !urlInput.startsWith('http://127.0.0.1');

  const save = () => {
    setCliUrl(urlInput);
    window.location.reload();
  };
  const reset = () => {
    clearCliUrl();
    window.location.reload();
  };

  return (
    <div className="offline-overlay">
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '36px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 14, maxWidth: 440, width: '100%',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'var(--elevated)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>⚡</div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--foreground)', marginBottom: 6 }}>
            CLI not running
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            Trying to reach <code style={{ fontSize: 12, background: 'var(--elevated)', padding: '1px 6px', borderRadius: 4, fontFamily: 'GeistMono, monospace' }}>{currentUrl}</code>
          </div>
        </div>

        <code style={{
          fontSize: 12.5, background: 'var(--elevated)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '9px 16px', color: 'var(--foreground)',
          fontFamily: 'GeistMono, monospace', display: 'block', width: '100%', textAlign: 'center',
        }}>
          openapi-agent --url &lt;spec-url&gt;
        </code>

        {/* Configure URL toggle */}
        <button
          onClick={() => setShowConfig(s => !s)}
          style={{
            fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          {showConfig ? 'Hide' : 'Change CLI URL'}
        </button>

        {showConfig && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="input"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="http://localhost:3388"
              onKeyDown={e => e.key === 'Enter' && save()}
              style={{ fontFamily: 'GeistMono, monospace', fontSize: 12.5 }}
            />
            {isUnsafeMix && (
              <div style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-dim)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.5 }}>
                ⚠ Browsers block HTTP requests to non-localhost addresses from HTTPS pages. Use <strong>https://</strong> or point to <strong>localhost</strong>.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>
                Connect
              </button>
              {currentUrl !== 'http://localhost:3388' && (
                <button className="btn btn-ghost" onClick={reset} title="Reset to default">
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
          <span className="dot dot-pulse" style={{ background: 'var(--warning)' }} />
          Retrying connection…
        </div>
      </div>
    </div>
  );
}

interface ParsedOp { operationId: string; method: string; path: string; summary?: string; tags: string[]; }

function AppShell() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [operations, setOperations] = useState<ParsedOp[]>([]);
  const pendingOpRef = useRef<ParsedOp | null>(null);

  // Inject fonts + restore theme on mount
  useEffect(() => {
    injectFonts();
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Poll for CLI connection
  useEffect(() => {
    let dead = false;
    const check = async () => {
      try {
        await apiClient<unknown>('/api/status');
        if (!dead) setConnected(true);
      } catch {
        if (!dead) setConnected(false);
      }
    };
    check();
    const t = setInterval(check, 4000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Load operations for Cmd+K
  useEffect(() => {
    if (!connected) return;
    apiClient<ParsedOp[]>('/api/spec/endpoints').then(setOperations).catch(() => {});
  }, [connected]);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleCmdSelect = (op: ParsedOp) => {
    pendingOpRef.current = op;
    window.dispatchEvent(new CustomEvent('cmd-open-endpoint', { detail: op }));
  };

  // Loading state: null = still checking
  if (connected === null) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        background: 'var(--background)', color: 'var(--muted-foreground)',
      }}>
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
        <span style={{ fontSize: 13 }}>Connecting to CLI…</span>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ theme, toggleTheme, cmdOpen, setCmdOpen, connected: connected ?? false }}>
      {/* Offline overlay */}
      {connected === false && <OfflineCard />}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', opacity: connected ? 1 : 0, transition: 'opacity 0.2s' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'hidden', background: 'var(--background)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        operations={operations}
        onSelect={handleCmdSelect}
      />
    </AppContext.Provider>
  );
}
