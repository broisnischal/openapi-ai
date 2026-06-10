import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { getHighlighter } from '../lib/highlighter';

interface Props {
  text: string;
  lang?: string;
  maxHeight?: number | string;
}

export function JsonViewer({ text, lang, maxHeight = '100%' }: Props) {
  const { theme } = useApp();
  const [html, setHtml] = useState<string>('');
  const [ready, setReady] = useState(false);
  const abortRef = useRef(0);

  // Detect language and format
  let detectedLang = lang ?? 'text';
  let formatted = text;

  if (!lang) {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
        detectedLang = 'json';
      } catch { /* keep as text */ }
    } else if (trimmed.startsWith('<')) {
      detectedLang = 'xml';
    } else if (trimmed.startsWith('---\n') || trimmed.startsWith('- ')) {
      detectedLang = 'yaml';
    }
  }

  const shikiTheme = theme === 'light' ? 'github-light' : 'github-dark-dimmed';

  useEffect(() => {
    const id = ++abortRef.current;
    getHighlighter().then(hl => {
      if (id !== abortRef.current) return;
      const out = hl.codeToHtml(formatted, { lang: detectedLang, theme: shikiTheme });
      setHtml(out);
      setReady(true);
    }).catch((e) => { console.error('[Shiki]', e); setReady(true); });
  }, [formatted, shikiTheme, detectedLang]);

  const containerStyle: React.CSSProperties = {
    flex: 1, overflow: 'auto', maxHeight,
    fontFamily: 'GeistMono, ui-monospace, monospace',
    fontSize: 12.5, lineHeight: 1.65,
  };

  // Fallback while Shiki loads
  if (!ready) {
    return (
      <pre style={{ ...containerStyle, padding: '12px 16px', margin: 0, color: 'var(--muted-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {formatted}
      </pre>
    );
  }

  if (!html) {
    return (
      <pre style={{ ...containerStyle, padding: '12px 16px', margin: 0, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {formatted}
      </pre>
    );
  }

  return (
    <div
      className="shiki-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
      style={containerStyle}
    />
  );
}
