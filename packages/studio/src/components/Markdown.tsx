import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';

let highlighterPromise: Promise<import('shiki').Highlighter> | null = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({ themes: ['github-dark-dimmed', 'github-light'], langs: ['json', 'bash', 'typescript', 'javascript', 'yaml', 'xml', 'html', 'text', 'python', 'go', 'rust', 'sql'] }),
    );
  }
  return highlighterPromise;
}
getHighlighter();

function FencedCode({ lang, body }: { lang: string; body: string }) {
  const { theme } = useApp();
  const [html, setHtml] = useState('');
  const idRef = useRef(0);
  const shikiTheme = theme === 'light' ? 'github-light' : 'github-dark-dimmed';
  useEffect(() => {
    const id = ++idRef.current;
    const safeLang = ['json','bash','typescript','javascript','yaml','xml','html','python','go','rust','sql'].includes(lang) ? lang : 'text';
    getHighlighter().then(hl => {
      if (id !== idRef.current) return;
      setHtml(hl.codeToHtml(body, { lang: safeLang, theme: shikiTheme }));
    }).catch(() => {});
  }, [body, lang, shikiTheme]);

  const blockStyle: React.CSSProperties = {
    borderRadius: lang ? '0 6px 6px 6px' : 6,
    overflow: 'hidden',
    border: '1px solid var(--border)',
  };

  return (
    <div style={{ position: 'relative', marginBottom: 10, marginTop: 4 }}>
      {lang && (
        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'GeistMono, monospace', background: 'color-mix(in srgb, var(--foreground) 8%, transparent)', padding: '3px 10px', borderRadius: '6px 6px 0 0', borderBottom: '1px solid var(--border)', display: 'inline-block' }}>
          {lang}
        </div>
      )}
      {/* Split render paths — React forbids dangerouslySetInnerHTML + children on same element */}
      {html
        ? <div className="md-code-block" style={blockStyle} dangerouslySetInnerHTML={{ __html: html }} />
        : (
          <div className="md-code-block" style={blockStyle}>
            <pre style={{ background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', padding: '10px 14px', margin: 0 }}>
              <code style={{ fontFamily: 'GeistMono, monospace', fontSize: 12.5, lineHeight: 1.65, color: 'var(--foreground)' }}>{body}</code>
            </pre>
          </div>
        )
      }
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // match inline code, bold, italic
  const re = /(`[^`\n]+`|\*\*(?:[^*]|\*(?!\*))+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw[0] === '`') {
      parts.push(
        <code key={i++} style={{
          background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
          padding: '1px 5px', borderRadius: 3,
          fontFamily: 'GeistMono, monospace', fontSize: '0.87em',
          color: 'var(--foreground)',
        }}>
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('**')) {
      parts.push(<strong key={i++} style={{ fontWeight: 600 }}>{renderInline(raw.slice(2, -2))}</strong>);
    } else {
      parts.push(<em key={i++}>{raw.slice(1, -1)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ content }: { content: string }) {
  const els: React.ReactNode[] = [];

  // Extract fenced code blocks first (they may contain blank lines)
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

  let key = 0;

  for (const seg of segments) {
    if (seg.t === 'code') {
      els.push(<FencedCode key={key++} lang={seg.lang} body={seg.body} />);
      continue;
    }

    // Group consecutive lines into blocks separated by blank lines
    const lines = seg.body.split('\n');
    const blocks: string[][] = [];
    let cur: string[] = [];
    for (const line of lines) {
      if (line.trim() === '') {
        if (cur.length > 0) { blocks.push(cur); cur = []; }
      } else {
        cur.push(line);
      }
    }
    if (cur.length > 0) blocks.push(cur);

    for (const block of blocks) {
      if (!block.length) continue;
      const first = block[0];

      // Heading
      const hm = first.match(/^(#{1,3})\s+(.+)$/);
      if (hm && block.length === 1) {
        const lvl = hm[1].length as 1 | 2 | 3;
        const sz = { 1: 17, 2: 15, 3: 13.5 }[lvl];
        const fw = lvl === 1 ? 700 : 600;
        els.push(
          <div key={key++} style={{ fontSize: sz, fontWeight: fw, marginBottom: 6, marginTop: key > 1 ? 14 : 0, color: 'var(--foreground)' }}>
            {renderInline(hm[2])}
          </div>
        );
        continue;
      }

      // Horizontal rule
      if (block.length === 1 && /^---+$/.test(first.trim())) {
        els.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />);
        continue;
      }

      // Unordered list
      if (block.every(l => /^[-*+]\s/.test(l))) {
        els.push(
          <ul key={key++} style={{ paddingLeft: 18, marginBottom: 8, marginTop: 0 }}>
            {block.map((l, i) => (
              <li key={i} style={{ marginBottom: 3, lineHeight: 1.65 }}>
                {renderInline(l.replace(/^[-*+]\s+/, ''))}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list
      if (block.every(l => /^\d+[.)]\s/.test(l))) {
        els.push(
          <ol key={key++} style={{ paddingLeft: 18, marginBottom: 8, marginTop: 0 }}>
            {block.map((l, i) => (
              <li key={i} style={{ marginBottom: 3, lineHeight: 1.65 }}>
                {renderInline(l.replace(/^\d+[.)]\s+/, ''))}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Blockquote
      if (block.every(l => l.startsWith('> '))) {
        els.push(
          <blockquote key={key++} style={{
            borderLeft: '3px solid var(--border)', paddingLeft: 12,
            margin: '4px 0 8px', color: 'var(--muted-foreground)',
          }}>
            {block.map((l, i) => (
              <p key={i} style={{ margin: 0, lineHeight: 1.65 }}>{renderInline(l.replace(/^>\s+/, ''))}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Paragraph
      els.push(
        <p key={key++} style={{ marginBottom: 8, marginTop: 0, lineHeight: 1.7, color: 'var(--foreground)' }}>
          {renderInline(block.join('\n'))}
        </p>
      );
    }
  }

  return <div style={{ fontSize: 13 }}>{els}</div>;
}
