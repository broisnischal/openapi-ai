import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Copy, Check, ExternalLink, ChevronRight,
  Terminal, Zap, Server,
  BookOpen, Settings, AlertTriangle, Info, Lightbulb,
  ArrowLeft, ArrowRight,
} from 'lucide-react';
import { cn } from '#/lib/utils';

export const Route = createFileRoute('/docs')({ component: DocsPage });

// ─── Types ────────────────────────────────────────────────────────────────────

type PageId =
  | 'introduction'
  | 'installation'
  | 'quickstart'
  | 'self-hosting-overview'
  | 'with-token-auth'
  | 'docker'
  | 'commands'
  | 'flags'
  | 'env-vars';

interface NavItem {
  id: PageId;
  label: string;
}

interface NavSection {
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
}

// ─── Navigation structure ─────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Getting Started',
    icon: <BookOpen size={12} />,
    items: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'installation', label: 'Installation' },
      { id: 'quickstart', label: 'Quickstart' },
    ],
  },
  {
    title: 'Self-Hosting',
    icon: <Server size={12} />,
    items: [
      { id: 'self-hosting-overview', label: 'Overview' },
      { id: 'with-token-auth', label: 'With Token Auth' },
      { id: 'docker', label: 'Docker' },
    ],
  },
  {
    title: 'CLI Reference',
    icon: <Terminal size={12} />,
    items: [
      { id: 'commands', label: 'Commands' },
      { id: 'flags', label: 'Flags' },
      { id: 'env-vars', label: 'Environment Variables' },
    ],
  },
];

const PAGE_ORDER: PageId[] = [
  'introduction', 'installation', 'quickstart',
  'self-hosting-overview', 'with-token-auth', 'docker',
  'commands', 'flags', 'env-vars',
];

function getPageLabel(id: PageId): string {
  for (const s of NAV_SECTIONS) {
    const item = s.items.find(i => i.id === id);
    if (item) return item.label;
  }
  return id;
}

function getSectionTitle(id: PageId): string {
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => i.id === id)) return s.title;
  }
  return '';
}

// ─── Inline UI components ─────────────────────────────────────────────────────

function CodeBlock({ code, lang = 'bash', label }: { code: string; lang?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--elevated)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {label ?? lang}
        </span>
        <button
          onClick={copy}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-sans cursor-pointer transition-colors border-0 bg-transparent',
            copied ? 'text-[#22c55e]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          )}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-[var(--foreground)] whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

type CalloutVariant = 'info' | 'warning' | 'tip';

const CALLOUT_STYLES: Record<CalloutVariant, { border: string; bg: string; icon: React.ReactNode; label: string }> = {
  info: {
    border: 'border-l-[var(--info,#3b82f6)]',
    bg: 'bg-[rgba(59,130,246,0.06)]',
    icon: <Info size={13} className="text-[#3b82f6] mt-0.5 shrink-0" />,
    label: 'Note',
  },
  warning: {
    border: 'border-l-[var(--warning,#f59e0b)]',
    bg: 'bg-[rgba(245,158,11,0.06)]',
    icon: <AlertTriangle size={13} className="text-[#f59e0b] mt-0.5 shrink-0" />,
    label: 'Warning',
  },
  tip: {
    border: 'border-l-[#22c55e]',
    bg: 'bg-[rgba(34,197,94,0.06)]',
    icon: <Lightbulb size={13} className="text-[#22c55e] mt-0.5 shrink-0" />,
    label: 'Tip',
  },
};

function Callout({ variant = 'info', children }: { variant?: CalloutVariant; children: React.ReactNode }) {
  const s = CALLOUT_STYLES[variant];
  return (
    <div className={cn('my-4 flex gap-3 rounded-r-xl border border-l-[3px] px-4 py-3', s.border, s.bg, 'border-[var(--border)]')}>
      {s.icon}
      <div className="text-[13px] leading-relaxed text-[var(--foreground)]">
        <span className="font-semibold">{s.label}: </span>
        {children}
      </div>
    </div>
  );
}

function StepItem({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative mb-6 flex gap-4 last:mb-0">
      <div className="flex shrink-0 flex-col items-center">
        <div className="flex size-7 items-center justify-center rounded-full bg-[#22c55e] text-[12px] font-bold text-white">
          {number}
        </div>
        <div className="mt-2 w-px flex-1 bg-[var(--border)]" />
      </div>
      <div className="flex-1 pb-6">
        <h3 className="mb-2 text-[14px] font-semibold text-[var(--foreground)]">{title}</h3>
        <div className="text-[13.5px] leading-relaxed text-[var(--muted-foreground)]">{children}</div>
      </div>
    </div>
  );
}

function TabGroup({
  tabs,
  children,
}: {
  tabs: string[];
  children: (active: string) => React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]);
  return (
    <div className="my-4">
      <div className="flex gap-0.5 rounded-lg bg-[var(--elevated)] p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-100 border-0 cursor-pointer font-sans',
              active === t
                ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight text-[var(--foreground)]">
      {children}
    </h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 text-[18px] font-semibold tracking-tight text-[var(--foreground)] border-b border-[var(--border)] pb-2">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-[15px] font-semibold text-[var(--foreground)]">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[13.5px] leading-relaxed text-[var(--muted-foreground)]">
      {children}
    </p>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-[var(--border)] bg-[var(--elevated)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--foreground)]">
      {children}
    </code>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--elevated)]">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--elevated)]"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-3 align-top text-[var(--muted-foreground)] leading-relaxed"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[#22c55e]/30 hover:bg-[rgba(34,197,94,0.03)]">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-[rgba(34,197,94,0.1)] text-[#22c55e]">
        {icon}
      </div>
      <div className="mb-1 text-[13.5px] font-semibold text-[var(--foreground)]">{title}</div>
      <div className="text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">{desc}</div>
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function PageIntroduction() {
  return (
    <div>
      <H1>Introduction</H1>
      <P>
        <strong className="text-[var(--foreground)]">Wasper</strong> is a CLI tool that takes any OpenAPI specification and instantly
        gives you a running MCP server, an API proxy, an AI assistant, and a full studio UI — all from a single command.
      </P>
      <P>
        Point Wasper at a spec URL or file and you can immediately explore every endpoint, fire requests with live
        environment variables, watch logs stream in real-time, and let the built-in AI assistant (<em>Quiry</em>)
        help you understand and test the API.
      </P>

      <Callout variant="tip">
        Wasper is designed for developers and teams who work with APIs daily. It replaces the &quot;import spec into
        Postman, configure Claude Desktop, set up a proxy&quot; workflow with a single command.
      </Callout>

      <H2>Key Features</H2>
      <div className="grid grid-cols-2 gap-3 my-4">
        <FeatureCard
          icon={<Server size={16} />}
          title="MCP Server"
          desc="Every endpoint in your OpenAPI spec becomes an MCP tool, ready to call from Claude Desktop, Claude Code, or any MCP-compatible agent."
        />
        <FeatureCard
          icon={<Zap size={16} />}
          title="API Proxy"
          desc="Wasper proxies all requests through the CLI, injecting environment variables, tracking request/response pairs, and intercepting traffic."
        />
        <FeatureCard
          icon={<BookOpen size={16} />}
          title="Quiry — AI Assistant"
          desc="Ask natural-language questions about your API. Quiry understands your spec and can execute requests, summarise responses, and suggest fixes."
        />
        <FeatureCard
          icon={<Settings size={16} />}
          title="Studio UI"
          desc="A web-based interface for exploring endpoints, managing environments, inspecting logs, running workflows, and configuring the CLI — all in one place."
        />
      </div>

      <H2>How It Works</H2>
      <P>
        When you run <InlineCode>wasper --url &lt;spec-url&gt;</InlineCode>, the CLI:
      </P>
      <ol className="my-3 ml-5 flex flex-col gap-2 list-decimal text-[13.5px] text-[var(--muted-foreground)]">
        <li className="leading-relaxed">Downloads and parses the OpenAPI spec (JSON or YAML, v3.x).</li>
        <li className="leading-relaxed">Starts an HTTP server on <InlineCode>localhost:3388</InlineCode> (configurable with <InlineCode>--port</InlineCode>).</li>
        <li className="leading-relaxed">Exposes an MCP endpoint at <InlineCode>/mcp</InlineCode> (Streamable HTTP transport).</li>
        <li className="leading-relaxed">Serves the studio UI — open <InlineCode>http://localhost:3388</InlineCode> in your browser.</li>
        <li className="leading-relaxed">Begins streaming logs over a WebSocket connection to the studio.</li>
      </ol>

      <H2>When to Use Wasper</H2>
      <Table
        headers={['Scenario', 'How Wasper Helps']}
        rows={[
          ['Exploring a third-party API', 'Load their public OpenAPI spec and browse all endpoints in the studio.'],
          ['Connecting an API to an AI agent', 'Use the MCP server — every endpoint becomes a callable tool instantly.'],
          ['Debugging API issues', 'The request log captures every call with timing, headers, and body.'],
          ['Team API development', 'Self-host Wasper with token auth so the whole team shares one studio.'],
          ['Automating API workflows', 'Chain requests in the Workflows tab and schedule or trigger them.'],
        ]}
      />
    </div>
  );
}

function PageInstallation() {
  return (
    <div>
      <H1>Installation</H1>
      <P>
        Wasper can be installed in three ways. The <strong className="text-[var(--foreground)]">curl install</strong> is
        recommended for most users — it downloads a standalone binary with no runtime dependencies.
      </P>

      <TabGroup tabs={['curl (recommended)', 'npm', 'bun']}>
        {(active) => (
          <>
            {active === 'curl (recommended)' && (
              <div>
                <P>
                  The installer script auto-detects your operating system (macOS, Linux x64/arm64) and places the
                  <InlineCode>wasper</InlineCode> binary in <InlineCode>/usr/local/bin</InlineCode>.
                  No Node.js or Bun runtime required.
                </P>
                <CodeBlock
                  lang="bash"
                  label="Terminal"
                  code={`curl -fsSL https://studio.stroke.click/install.sh | sh`}
                />
                <P>
                  After installation, verify it worked:
                </P>
                <CodeBlock lang="bash" label="Terminal" code={`wasper --version`} />
                <Callout variant="info">
                  The install script needs write access to <InlineCode>/usr/local/bin</InlineCode>.
                  On macOS you may be prompted for your password. On Linux you can prefix with <InlineCode>sudo</InlineCode> or
                  set <InlineCode>INSTALL_DIR=~/.local/bin</InlineCode> to install to a user-writable location.
                </Callout>

                <H3>Manual download</H3>
                <P>
                  If you prefer to download the binary directly, grab the latest release for your platform from{' '}
                  <a
                    href="https://github.com/broisnischal/wasper/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#22c55e] underline underline-offset-2 hover:no-underline"
                  >
                    GitHub Releases
                  </a>
                  , make it executable, and move it to your <InlineCode>PATH</InlineCode>:
                </P>
                <CodeBlock
                  lang="bash"
                  label="Terminal (Linux x64 example)"
                  code={`# Download
curl -L https://github.com/broisnischal/wasper/releases/latest/download/wasper-linux-x64 -o wasper

# Make executable
chmod +x wasper

# Move to PATH
sudo mv wasper /usr/local/bin/`}
                />
              </div>
            )}

            {active === 'npm' && (
              <div>
                <P>
                  Install the <InlineCode>wasper-cli</InlineCode> package globally via npm.
                  This method requires the <strong className="text-[var(--foreground)]">Bun runtime</strong> to be
                  installed on your system — the package uses Bun APIs internally.
                </P>
                <CodeBlock lang="bash" label="Terminal" code={`npm install -g wasper-cli`} />
                <Callout variant="warning">
                  The npm package requires Bun ({'>'}= 1.1) to run. Install Bun first:{' '}
                  <InlineCode>curl -fsSL https://bun.sh/install | bash</InlineCode>
                </Callout>
                <P>Verify the installation:</P>
                <CodeBlock lang="bash" label="Terminal" code={`wasper --version`} />
              </div>
            )}

            {active === 'bun' && (
              <div>
                <P>
                  If you already have Bun installed, you can add <InlineCode>wasper-cli</InlineCode> as a global package:
                </P>
                <CodeBlock lang="bash" label="Terminal" code={`bun add -g wasper-cli`} />
                <P>
                  Global Bun packages are placed in <InlineCode>~/.bun/bin</InlineCode>. Make sure that directory is in
                  your <InlineCode>PATH</InlineCode>:
                </P>
                <CodeBlock
                  lang="bash"
                  label="~/.zshrc or ~/.bashrc"
                  code={`export PATH="$HOME/.bun/bin:$PATH"`}
                />
                <P>Verify the installation:</P>
                <CodeBlock lang="bash" label="Terminal" code={`wasper --version`} />
              </div>
            )}
          </>
        )}
      </TabGroup>

      <H2>Updating</H2>
      <P>
        To update to the latest version, re-run your install method. For the curl install:
      </P>
      <CodeBlock lang="bash" label="Terminal" code={`curl -fsSL https://studio.stroke.click/install.sh | sh`} />

      <H2>Uninstalling</H2>
      <CodeBlock lang="bash" label="Terminal" code={`# curl install
sudo rm /usr/local/bin/wasper

# npm
npm uninstall -g wasper-cli

# bun
bun remove -g wasper-cli`} />
    </div>
  );
}

function PageQuickstart() {
  return (
    <div>
      <H1>Quickstart</H1>
      <P>
        Get from zero to a running studio in under two minutes.
      </P>

      <div className="my-6">
        <StepItem number={1} title="Install Wasper">
          Run the installer script — it downloads a standalone binary, no runtime dependencies required.
          <CodeBlock lang="bash" label="Terminal" code={`curl -fsSL https://studio.stroke.click/install.sh | sh`} />
        </StepItem>

        <StepItem number={2} title="Start the CLI with your OpenAPI spec">
          Pass the URL of any public OpenAPI spec (or a local file path):
          <CodeBlock
            lang="bash"
            label="Terminal"
            code={`wasper --url https://petstore3.swagger.io/api/v3/openapi.json`}
          />
          The CLI will print something like:
          <CodeBlock
            lang="text"
            label="Output"
            code={` Wasper  v0.3.1

  Spec    Swagger Petstore — OpenAPI 3.0  (20 endpoints)
  Studio  http://localhost:3388
  MCP     http://localhost:3388/mcp
  Proxy   http://localhost:3388/proxy

  Ready. Press Ctrl+C to stop.`}
          />
          <Callout variant="tip">
            Use <InlineCode>--port 4000</InlineCode> to run on a different port if 3388 is taken.
          </Callout>
        </StepItem>

        <StepItem number={3} title="Open the Studio">
          Navigate to <InlineCode>http://localhost:3388</InlineCode> in your browser. You&apos;ll see the Wasper Studio
          Overview page showing your spec stats and a ready-to-use MCP configuration snippet.
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              ['Explorer', 'Browse and test every API endpoint'],
              ['AI Chat', 'Ask Quiry questions about your API'],
              ['Logs', 'Watch requests stream in real-time'],
              ['MCP Config', 'Connect Claude Desktop in one click'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
                <div className="mb-0.5 text-[13px] font-medium text-[var(--foreground)]">{title}</div>
                <div className="text-[12px] text-[var(--muted-foreground)]">{desc}</div>
              </div>
            ))}
          </div>
        </StepItem>
      </div>

      <H2>Example Specs to Try</H2>
      <Table
        headers={['API', 'URL']}
        rows={[
          [<span className="font-medium text-[var(--foreground)]">Swagger Petstore</span>, <InlineCode>https://petstore3.swagger.io/api/v3/openapi.json</InlineCode>],
          [<span className="font-medium text-[var(--foreground)]">GitHub REST API</span>, <InlineCode>https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json</InlineCode>],
          [<span className="font-medium text-[var(--foreground)]">JSONPlaceholder</span>, <InlineCode>https://jsonplaceholder.typicode.com/</InlineCode>],
        ]}
      />

      <H2>Connect to Claude Desktop</H2>
      <P>
        Once the CLI is running, open the Studio Overview and copy the MCP configuration snippet for Claude Desktop.
        Paste it into your <InlineCode>claude_desktop_config.json</InlineCode> and restart Claude Desktop — all your
        API endpoints are now available as tools.
      </P>
      <CodeBlock
        lang="json"
        label="~/Library/Application Support/Claude/claude_desktop_config.json"
        code={JSON.stringify(
          { mcpServers: { wasper: { type: 'streamable-http', url: 'http://localhost:3388/mcp' } } },
          null,
          2,
        )}
      />
    </div>
  );
}

function PageSelfHostingOverview() {
  return (
    <div>
      <H1>Self-Hosting Overview</H1>
      <P>
        Running Wasper on a remote server lets your entire team access the same Studio from any browser —
        no local CLI installation required for team members. The server operator runs one <InlineCode>wasper</InlineCode>
        process; everyone else connects via the Studio UI.
      </P>

      <H2>Architecture</H2>
      <CodeBlock
        lang="text"
        label="Deployment diagram"
        code={`  ┌──────────────────── Remote Server ─────────────────────┐
  │                                                         │
  │   wasper --url <spec> --port 3388 --token <secret>      │
  │       │                                                 │
  │       ├── /         Studio UI (served as static HTML)   │
  │       ├── /mcp      MCP endpoint (Streamable HTTP)      │
  │       ├── /proxy/*  API proxy (forwards to base URL)    │
  │       └── /api/*    Internal REST API for the studio    │
  │                                                         │
  └─────────────────────────────┬───────────────────────────┘
                                │  HTTPS (recommended)
              ┌─────────────────┼─────────────────┐
              │                 │                  │
         Browser            Browser            AI Agent
         (Alice)            (Bob)           (Claude Code)
         Studio UI          Studio UI        MCP client`}
      />

      <Callout variant="warning">
        By default Wasper binds to <InlineCode>localhost</InlineCode>. To accept external connections use{' '}
        <InlineCode>--host 0.0.0.0</InlineCode>. Always pair this with <InlineCode>--token</InlineCode>
        to require authentication.
      </Callout>

      <H2>Reverse Proxy (Recommended)</H2>
      <P>
        In production, place Wasper behind a reverse proxy like nginx or Caddy to get HTTPS termination and a clean URL.
        Here is a minimal Caddy configuration:
      </P>
      <CodeBlock
        lang="text"
        label="Caddyfile"
        code={`api-studio.example.com {
    reverse_proxy localhost:3388
}`}
      />
      <P>
        Caddy automatically provisions TLS certificates via Let&apos;s Encrypt. For nginx, see the
        &quot;With Token Auth&quot; page for a full service setup including nginx config.
      </P>

      <H2>Data Persistence</H2>
      <P>
        Wasper stores settings, environments, and request history in a data directory. The default location is:
      </P>
      <Table
        headers={['Platform', 'Default path']}
        rows={[
          ['macOS', <InlineCode>~/Library/Application Support/wasper</InlineCode>],
          ['Linux', <InlineCode>~/.local/share/wasper</InlineCode>],
          ['Docker / custom', 'Set <InlineCode>WASPER_DATA_DIR</InlineCode>'],
        ]}
      />
      <P>
        Override the data directory with the <InlineCode>--data-dir</InlineCode> flag or the{' '}
        <InlineCode>WASPER_DATA_DIR</InlineCode> environment variable — useful for Docker volumes.
      </P>
    </div>
  );
}

function PageWithTokenAuth() {
  return (
    <div>
      <H1>With Token Auth</H1>
      <P>
        Pass <InlineCode>--token</InlineCode> to require a bearer token before any Studio, MCP, or proxy request
        is served. This is the recommended way to protect a public-facing Wasper instance.
      </P>

      <H2>Starting with a Token</H2>
      <CodeBlock
        lang="bash"
        label="Terminal"
        code={`wasper --url https://petstore3.swagger.io/api/v3/openapi.json \\
       --host 0.0.0.0 \\
       --port 3388 \\
       --token my-secret-token`}
      />

      <H2>Connecting the Studio to a Remote Server</H2>
      <P>
        When someone opens the Studio URL and Wasper can&apos;t connect (because it&apos;s a remote server, or the token is missing),
        the Studio shows an offline card. In that card:
      </P>
      <ol className="my-3 ml-5 flex flex-col gap-2 list-decimal text-[13.5px] text-[var(--muted-foreground)]">
        <li className="leading-relaxed">Click <strong className="text-[var(--foreground)]">Change CLI URL</strong></li>
        <li className="leading-relaxed">Enter the remote server address, e.g. <InlineCode>https://api-studio.example.com</InlineCode></li>
        <li className="leading-relaxed">Enter the access token in the token field</li>
        <li className="leading-relaxed">Click <strong className="text-[var(--foreground)]">Connect</strong></li>
      </ol>
      <P>
        The URL and token are saved in <InlineCode>localStorage</InlineCode> for that browser session.
      </P>

      <Callout variant="info">
        The token is sent as a <InlineCode>Authorization: Bearer &lt;token&gt;</InlineCode> header on every request
        the Studio makes to the CLI. It is stored only in the browser and never sent anywhere else.
      </Callout>

      <H2>Connecting an MCP Client</H2>
      <P>
        Pass the token in the MCP client configuration. For Claude Desktop:
      </P>
      <CodeBlock
        lang="json"
        label="claude_desktop_config.json"
        code={JSON.stringify(
          {
            mcpServers: {
              wasper: {
                type: 'streamable-http',
                url: 'https://api-studio.example.com/mcp',
                headers: { Authorization: 'Bearer my-secret-token' },
              },
            },
          },
          null,
          2,
        )}
      />

      <H2>Systemd Service</H2>
      <P>
        Run Wasper as a persistent background service with systemd on Linux:
      </P>
      <CodeBlock
        lang="ini"
        label="/etc/systemd/system/wasper.service"
        code={`[Unit]
Description=Wasper MCP + API Studio
After=network.target

[Service]
Type=simple
User=wasper
ExecStart=/usr/local/bin/wasper \\
  --url https://petstore3.swagger.io/api/v3/openapi.json \\
  --host 0.0.0.0 \\
  --port 3388 \\
  --token my-secret-token \\
  --data-dir /var/lib/wasper

Restart=on-failure
RestartSec=5s
Environment=WASPER_DATA_DIR=/var/lib/wasper

[Install]
WantedBy=multi-user.target`}
      />
      <CodeBlock
        lang="bash"
        label="Terminal"
        code={`# Create the user and data directory
sudo useradd --system --no-create-home wasper
sudo mkdir -p /var/lib/wasper && sudo chown wasper:wasper /var/lib/wasper

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now wasper

# Check status
sudo systemctl status wasper`}
      />

      <H2>Security Notes</H2>
      <ul className="my-3 ml-5 flex flex-col gap-2 list-disc text-[13.5px] text-[var(--muted-foreground)]">
        <li className="leading-relaxed">
          <strong className="text-[var(--foreground)]">Use a long, random token.</strong> Generate one with{' '}
          <InlineCode>openssl rand -hex 32</InlineCode>.
        </li>
        <li className="leading-relaxed">
          <strong className="text-[var(--foreground)]">Always use HTTPS in production.</strong> Token auth over plain HTTP
          exposes your token to network observers.
        </li>
        <li className="leading-relaxed">
          <strong className="text-[var(--foreground)]">Use <InlineCode>--readonly</InlineCode></strong> if team members
          should be able to explore but not execute write operations against the upstream API.
        </li>
      </ul>
    </div>
  );
}

function PageDocker() {
  return (
    <div>
      <H1>Docker</H1>
      <P>
        Run Wasper in a Docker container for easy deployment on any server or cloud environment.
      </P>

      <H2>Dockerfile</H2>
      <P>
        The official image uses a minimal Alpine base. Copy and adapt this Dockerfile for your own builds:
      </P>
      <CodeBlock
        lang="dockerfile"
        label="Dockerfile"
        code={`FROM alpine:3.20

# Install wasper binary
RUN apk add --no-cache curl ca-certificates && \\
    curl -fsSL https://studio.stroke.click/install.sh | sh && \\
    apk del curl

# Data directory
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3388

ENV WASPER_DATA_DIR=/data

ENTRYPOINT ["wasper"]
CMD ["--help"]`}
      />

      <H2>docker run</H2>
      <CodeBlock
        lang="bash"
        label="Terminal"
        code={`docker run -d \\
  --name wasper \\
  -p 3388:3388 \\
  -v wasper-data:/data \\
  -e WASPER_DATA_DIR=/data \\
  ghcr.io/broisnischal/wasper:latest \\
    --url https://petstore3.swagger.io/api/v3/openapi.json \\
    --host 0.0.0.0 \\
    --token my-secret-token`}
      />

      <H2>docker-compose.yml</H2>
      <P>
        A full compose stack with Caddy for automatic HTTPS:
      </P>
      <CodeBlock
        lang="yaml"
        label="docker-compose.yml"
        code={`services:
  wasper:
    image: ghcr.io/broisnischal/wasper:latest
    restart: unless-stopped
    command:
      - --url
      - https://petstore3.swagger.io/api/v3/openapi.json
      - --host
      - "0.0.0.0"
      - --port
      - "3388"
      - --token
      - "\${WASPER_TOKEN}"
    environment:
      WASPER_DATA_DIR: /data
    volumes:
      - wasper-data:/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - wasper

volumes:
  wasper-data:
  caddy-data:
  caddy-config:`}
      />
      <CodeBlock
        lang="text"
        label="Caddyfile"
        code={`api-studio.example.com {
    reverse_proxy wasper:3388
}`}
      />
      <CodeBlock
        lang="bash"
        label=".env"
        code={`WASPER_TOKEN=your-long-random-secret-here`}
      />

      <Callout variant="tip">
        Generate a secure token with <InlineCode>openssl rand -hex 32</InlineCode> and store it in your{' '}
        <InlineCode>.env</InlineCode> file. Never commit <InlineCode>.env</InlineCode> to version control.
      </Callout>

      <H2>Health Check</H2>
      <P>
        Add a Docker health check to auto-restart the container if the server becomes unresponsive:
      </P>
      <CodeBlock
        lang="yaml"
        label="docker-compose.yml snippet"
        code={`wasper:
  # ... other config ...
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3388/api/status"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s`}
      />
    </div>
  );
}

function PageCommands() {
  return (
    <div>
      <H1>Commands</H1>
      <P>
        Wasper&apos;s primary interface is the root command. Subcommands cover utility tasks.
      </P>

      <H2>wasper</H2>
      <P>
        Start the Wasper server. This is the main command you&apos;ll use every day.
      </P>
      <CodeBlock
        lang="bash"
        label="Usage"
        code={`wasper [flags]`}
      />
      <CodeBlock
        lang="bash"
        label="Examples"
        code={`# Load a remote spec
wasper --url https://api.example.com/openapi.yaml

# Load a local file
wasper --url ./openapi.json

# Custom port + readonly
wasper --url ./openapi.yaml --port 4000 --readonly

# Self-hosted with token auth
wasper --url ./openapi.yaml --host 0.0.0.0 --token my-secret`}
      />

      <H2>Subcommands</H2>
      <Table
        headers={['Command', 'Description']}
        rows={[
          [<InlineCode>wasper version</InlineCode>, 'Print the installed version and exit.'],
          [<InlineCode>wasper help</InlineCode>, 'Print help text for any command or flag.'],
          [<InlineCode>wasper completion bash</InlineCode>, 'Generate bash shell completion script.'],
          [<InlineCode>wasper completion zsh</InlineCode>, 'Generate zsh shell completion script.'],
          [<InlineCode>wasper completion fish</InlineCode>, 'Generate fish shell completion script.'],
        ]}
      />

      <H2>Shell Completion</H2>
      <P>
        Enable tab-completion for wasper flags and subcommands:
      </P>
      <CodeBlock
        lang="bash"
        label="bash"
        code={`# Add to ~/.bashrc
eval "$(wasper completion bash)"`}
      />
      <CodeBlock
        lang="bash"
        label="zsh"
        code={`# Add to ~/.zshrc
eval "$(wasper completion zsh)"`}
      />
    </div>
  );
}

function PageFlags() {
  return (
    <div>
      <H1>Flags</H1>
      <P>
        All flags can be set on the command line. Flags take precedence over environment variables.
      </P>

      <H2>Reference</H2>
      <Table
        headers={['Flag', 'Type', 'Default', 'Description']}
        rows={[
          [
            <InlineCode>--url</InlineCode>,
            'string',
            '—',
            'URL or local file path of the OpenAPI spec to load. Supports http://, https://, and relative/absolute file paths.',
          ],
          [
            <InlineCode>--port</InlineCode>,
            'number',
            <InlineCode>3388</InlineCode>,
            'TCP port the server listens on.',
          ],
          [
            <InlineCode>--host</InlineCode>,
            'string',
            <InlineCode>localhost</InlineCode>,
            'Host/interface to bind to. Set to 0.0.0.0 to accept connections from all network interfaces.',
          ],
          [
            <InlineCode>--token</InlineCode>,
            'string',
            '—',
            'If set, all requests must include Authorization: Bearer <token>. Applies to the Studio, MCP endpoint, and proxy.',
          ],
          [
            <InlineCode>--readonly</InlineCode>,
            'boolean',
            <InlineCode>false</InlineCode>,
            'Block all non-GET upstream requests. The Studio UI and MCP server still work; only write operations to the proxied API are rejected.',
          ],
          [
            <InlineCode>--data-dir</InlineCode>,
            'string',
            'Platform default',
            'Directory for storing settings, environments, and request history. Overrides WASPER_DATA_DIR.',
          ],
          [
            <InlineCode>--version</InlineCode>,
            'boolean',
            '—',
            'Print the installed version and exit.',
          ],
          [
            <InlineCode>--help</InlineCode>,
            'boolean',
            '—',
            'Print help text and exit.',
          ],
        ]}
      />

      <H2>Combining Flags</H2>
      <CodeBlock
        lang="bash"
        label="Common combinations"
        code={`# Local development — default settings
wasper --url ./openapi.yaml

# Share with the team on port 80 behind nginx
wasper --url ./openapi.yaml --host 0.0.0.0 --port 3388 --token \${TOKEN}

# Read-only public demo
wasper --url https://petstore3.swagger.io/api/v3/openapi.json \\
       --host 0.0.0.0 --readonly

# Custom data directory (useful in Docker/CI)
wasper --url ./openapi.yaml --data-dir /tmp/wasper-data`}
      />
    </div>
  );
}

function PageEnvVars() {
  return (
    <div>
      <H1>Environment Variables</H1>
      <P>
        Environment variables provide an alternative to command-line flags, useful for systemd units, Docker
        Compose files, and CI/CD pipelines.
      </P>
      <Callout variant="info">
        Command-line flags always take precedence over environment variables when both are set.
      </Callout>

      <H2>Reference</H2>
      <Table
        headers={['Variable', 'Equivalent Flag', 'Description']}
        rows={[
          [
            <InlineCode>WASPER_DATA_DIR</InlineCode>,
            <InlineCode>--data-dir</InlineCode>,
            'Override the data directory. Wasper stores settings, environments, and logs here. Useful for Docker volumes.',
          ],
          [
            <InlineCode>OPENAPI_AGENT_DATA_DIR</InlineCode>,
            <InlineCode>--data-dir</InlineCode>,
            'Legacy alias for WASPER_DATA_DIR. Supported for backwards compatibility with older deployments. WASPER_DATA_DIR takes precedence if both are set.',
          ],
        ]}
      />

      <H2>Usage Examples</H2>
      <CodeBlock
        lang="bash"
        label="Shell / .env"
        code={`# Set a custom data directory
export WASPER_DATA_DIR=/var/lib/wasper

# Then run without the flag
wasper --url ./openapi.yaml`}
      />
      <CodeBlock
        lang="yaml"
        label="docker-compose.yml"
        code={`services:
  wasper:
    image: ghcr.io/broisnischal/wasper:latest
    environment:
      WASPER_DATA_DIR: /data
    volumes:
      - wasper-data:/data`}
      />
      <CodeBlock
        lang="ini"
        label="systemd unit (Environment= directive)"
        code={`[Service]
Environment=WASPER_DATA_DIR=/var/lib/wasper`}
      />

      <H2>Data Directory Contents</H2>
      <P>
        Once running, Wasper creates the following structure inside the data directory:
      </P>
      <CodeBlock
        lang="text"
        label="$WASPER_DATA_DIR"
        code={`$WASPER_DATA_DIR/
├── settings.json          # Server settings (AI provider, proxy, etc.)
├── environments.json      # Saved environment variable sets
├── spec-cache/            # Cached OpenAPI specs (avoids re-fetching)
│   └── <hash>.json
└── request-history/       # Stored request/response logs
    └── <date>-<id>.json`}
      />
      <Callout variant="tip">
        Back up <InlineCode>settings.json</InlineCode> and <InlineCode>environments.json</InlineCode> when migrating
        to a new server — they contain your API keys, environment variables, and configuration.
      </Callout>
    </div>
  );
}

// ─── Page renderer ────────────────────────────────────────────────────────────

const PAGE_COMPONENTS: Record<PageId, () => React.ReactNode> = {
  introduction: PageIntroduction,
  installation: PageInstallation,
  quickstart: PageQuickstart,
  'self-hosting-overview': PageSelfHostingOverview,
  'with-token-auth': PageWithTokenAuth,
  docker: PageDocker,
  commands: PageCommands,
  flags: PageFlags,
  'env-vars': PageEnvVars,
};

// ─── Main layout ─────────────────────────────────────────────────────────────

function DocsPage() {
  const [activePage, setActivePage] = useState<PageId>('introduction');

  const currentIdx = PAGE_ORDER.indexOf(activePage);
  const prevPage = currentIdx > 0 ? PAGE_ORDER[currentIdx - 1] : null;
  const nextPage = currentIdx < PAGE_ORDER.length - 1 ? PAGE_ORDER[currentIdx + 1] : null;

  const PageComponent = PAGE_COMPONENTS[activePage];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">

      {/* ── Top bar ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-0" style={{ height: 44 }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-6 items-center justify-center rounded-md bg-[var(--foreground)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-[var(--foreground)]">Wasper Docs</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#22c55e]">
            v0.3.1
          </span>
          <a
            href="https://github.com/broisnischal/wasper"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] no-underline transition-colors hover:text-[var(--foreground)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
            <ExternalLink size={10} />
          </a>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <nav
          className="flex shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] py-4"
          style={{ width: 220 }}
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-5 px-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                {section.icon}
                {section.title}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors border-0 cursor-pointer font-sans',
                    activePage === item.id
                      ? 'bg-[rgba(34,197,94,0.1)] font-medium text-[#22c55e]'
                      : 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)]',
                  )}
                >
                  {activePage === item.id && (
                    <span className="size-1 shrink-0 rounded-full bg-[#22c55e]" />
                  )}
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[780px] px-10 py-8">

            {/* Breadcrumb */}
            <div className="mb-6 flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
              <span>{getSectionTitle(activePage)}</span>
              <ChevronRight size={11} />
              <span className="text-[var(--foreground)]">{getPageLabel(activePage)}</span>
            </div>

            {/* Page */}
            <PageComponent />

            {/* Prev / Next */}
            <div className="mt-12 flex items-center justify-between border-t border-[var(--border)] pt-6">
              <div>
                {prevPage && (
                  <button
                    onClick={() => setActivePage(prevPage)}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-[13px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer font-sans"
                  >
                    <ArrowLeft size={13} />
                    <div className="text-left">
                      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted-foreground)]">Previous</div>
                      <div className="font-medium text-[var(--foreground)]">{getPageLabel(prevPage)}</div>
                    </div>
                  </button>
                )}
              </div>
              <div>
                {nextPage && (
                  <button
                    onClick={() => setActivePage(nextPage)}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-[13px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] cursor-pointer font-sans"
                  >
                    <div className="text-right">
                      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted-foreground)]">Next</div>
                      <div className="font-medium text-[var(--foreground)]">{getPageLabel(nextPage)}</div>
                    </div>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
