import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useApp } from '../context';
import { getHighlighter } from '../lib/highlighter';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function CopyIcon({ done }: { done: boolean }) {
  if (done) return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8h6M9 6l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LANG_COLORS: Record<string, string> = {
  typescript: '#3178c6', javascript: '#f0db4f', python: '#3572a5',
  rust: '#dea584', go: '#00acd7', bash: '#89e051', sh: '#89e051',
  json: '#40a9ff', yaml: '#cb171e', sql: '#e38c00', html: '#e44d26',
  xml: '#e44d26', css: '#563d7c',
};

function FencedCode({ lang, body }: { lang: string; body: string }) {
  const { theme } = useApp();
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const idRef = useRef(0);
  const shikiTheme = theme === 'light' ? 'github-light' : 'github-dark-dimmed';

  useEffect(() => {
    const id = ++idRef.current;
    const safeLang = ['json', 'bash', 'typescript', 'javascript', 'yaml', 'xml', 'html', 'python', 'go', 'rust', 'sql'].includes(lang) ? lang : 'text';
    getHighlighter().then(hl => {
      if (id !== idRef.current) return;
      setHtml(hl.codeToHtml(body, { lang: safeLang, theme: shikiTheme }));
    }).catch(() => {});
  }, [body, lang, shikiTheme]);

  const copy = () => {
    navigator.clipboard.writeText(body).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Detect single-line HTTP endpoint: `METHOD /path`
  const trimmed = body.trim();
  const httpMatch = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*)$/i);
  const isEndpoint = httpMatch && HTTP_METHODS.has(httpMatch[1].toUpperCase());

  const openInExplorer = () => {
    if (!httpMatch) return;
    sessionStorage.setItem('explorer_pending_log', JSON.stringify({
      method: httpMatch[1].toUpperCase(),
      url: httpMatch[2],
      title: `${httpMatch[1].toUpperCase()} ${httpMatch[2]}`,
    }));
    navigate({ to: '/explorer' });
  };

  const effectiveLang = lang || 'text';
  const langColor = LANG_COLORS[effectiveLang.toLowerCase()];

  return (
    <div
      style={{ position: 'relative', marginBottom: 12, marginTop: 4 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
        borderRadius: '8px 8px 0 0',
        border: '1px solid var(--border)',
        borderBottom: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)',
        padding: '5px 10px',
        gap: 8,
      }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'GeistMono, monospace',
          color: langColor ?? 'var(--muted-foreground)',
          fontWeight: langColor ? 600 : 400,
          letterSpacing: '0.02em',
        }}>
          {effectiveLang}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
          {isEndpoint && (
            <button
              type="button"
              onClick={openInExplorer}
              title="Open in Explorer"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
                color: 'var(--foreground)', fontSize: 10, fontWeight: 500,
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 14%, transparent)')}
              onMouseOut={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 8%, transparent)')}
            >
              <ExploreIcon />
              Open in Explorer
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            title={copied ? 'Copied!' : 'Copy code'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 22, borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
              color: copied ? 'var(--success)' : 'var(--muted-foreground)',
              cursor: 'pointer', transition: 'color 0.15s, background 0.1s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 14%, transparent)')}
            onMouseOut={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 8%, transparent)')}
          >
            <CopyIcon done={copied} />
          </button>
        </div>
      </div>

      {/* Code body */}
      <div style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden', border: '1px solid var(--border)', borderTop: 'none' }}>
        {html
          ? <div className="md-code-block" dangerouslySetInnerHTML={{ __html: html }} />
          : (
            <pre style={{ background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', padding: '10px 14px', margin: 0 }}>
              <code style={{ fontFamily: 'GeistMono, monospace', fontSize: 12.5, lineHeight: 1.65, color: 'var(--foreground)' }}>{body}</code>
            </pre>
          )
        }
      </div>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // match links, inline code, bold, italic
  const re = /(\[([^\]]+)\]\(([^)]+)\)|`[^`\n]+`|\*\*(?:[^*]|\*(?!\*))+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('[') && m[2] && m[3]) {
      parts.push(
        <a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--foreground)', textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 }}>
          {renderInline(m[2])}
        </a>
      );
    } else if (raw[0] === '`') {
      parts.push(
        <code key={i++} style={{
          background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
          padding: '1px 6px', borderRadius: 4,
          fontFamily: 'GeistMono, monospace', fontSize: '0.85em',
          color: 'var(--foreground)', border: '1px solid color-mix(in srgb, var(--foreground) 12%, transparent)',
        }}>
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('**')) {
      parts.push(<strong key={i++} style={{ fontWeight: 650 }}>{renderInline(raw.slice(2, -2))}</strong>);
    } else {
      parts.push(<em key={i++}>{raw.slice(1, -1)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderLines(lines: string[], keyRef: { k: number }): React.ReactNode[] {
  const els: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    const hm = trimmed.match(/^(#{1,6})\s+([\s\S]+)$/);
    if (hm) {
      const lvl = hm[1].length;
      const sz = [18, 15.5, 13.5, 12.5, 12, 11.5][lvl - 1] ?? 11.5;
      const fw = lvl <= 2 ? 700 : 600;
      const mt = els.length > 0 ? (lvl <= 2 ? 18 : 12) : 0;
      const mb = lvl <= 2 ? 8 : 5;
      const borderBottom = lvl <= 2 ? '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)' : undefined;
      els.push(
        <div key={keyRef.k++} style={{ fontSize: sz, fontWeight: fw, marginTop: mt, marginBottom: mb, color: 'var(--foreground)', borderBottom, paddingBottom: borderBottom ? 6 : undefined }}>
          {renderInline(hm[2])}
        </div>
      );
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      els.push(<hr key={keyRef.k++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />);
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quotes: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quotes.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      els.push(
        <blockquote key={keyRef.k++} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12, margin: '4px 0 8px', color: 'var(--muted-foreground)' }}>
          {quotes.map((q, qi) => <p key={qi} style={{ margin: 0, lineHeight: 1.65 }}>{renderInline(q)}</p>)}
        </blockquote>
      );
      continue;
    }

    if (/^[-*+]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      els.push(
        <ul key={keyRef.k++} style={{ paddingLeft: 18, marginBottom: 8, marginTop: 2 }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: 3, lineHeight: 1.65 }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      els.push(
        <ol key={keyRef.k++} style={{ paddingLeft: 18, marginBottom: 8, marginTop: 2 }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ marginBottom: 3, lineHeight: 1.65 }}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l));
      if (dataRows.length > 0) {
        const parseRow = (row: string) => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const [header, ...body] = dataRows;
        els.push(
          <div key={keyRef.k++} style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              {header && (
                <thead>
                  <tr>
                    {parseRow(header).map((cell, ci) => (
                      <th key={ci} style={{ borderBottom: '2px solid var(--border)', padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                    {parseRow(row).map((cell, ci) => (
                      <td key={ci} style={{ padding: '4px 10px', color: 'var(--foreground-secondary, var(--foreground))' }}>
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) break;
      if (/^#{1,6}\s/.test(l)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) break;
      if (l.startsWith('>')) break;
      if (/^[-*+]\s/.test(l)) break;
      if (/^\d+[.)]\s/.test(l)) break;
      if (l.startsWith('|')) break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      els.push(
        <p key={keyRef.k++} style={{ marginBottom: 8, marginTop: 0, lineHeight: 1.7, color: 'var(--foreground)' }}>
          {renderInline(paraLines.join('\n'))}
        </p>
      );
    }
  }

  return els;
}

export function Markdown({ content }: { content: string }) {
  const segments: Array<{ t: 'code'; lang: string; body: string } | { t: 'text'; body: string }> = [];
  const codeRe = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let pos = 0;
  let cm: RegExpExecArray | null;

  while ((cm = codeRe.exec(content)) !== null) {
    if (cm.index > pos) segments.push({ t: 'text', body: content.slice(pos, cm.index) });
    segments.push({ t: 'code', lang: cm[1], body: cm[2].replace(/\n$/, '') });
    pos = codeRe.lastIndex;
  }
  if (pos < content.length) segments.push({ t: 'text', body: content.slice(pos) });

  const keyRef = { k: 0 };
  const els: React.ReactNode[] = [];

  for (const seg of segments) {
    if (seg.t === 'code') {
      els.push(<FencedCode key={keyRef.k++} lang={seg.lang} body={seg.body} />);
      continue;
    }
    els.push(...renderLines(seg.body.split('\n'), keyRef));
  }

  return <div style={{ fontSize: 13 }}>{els}</div>;
}
