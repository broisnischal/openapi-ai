import type { Highlighter } from 'shiki';

let promise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!promise) {
    promise = import('shiki').then(({ createHighlighter, createJavaScriptRegexEngine }) =>
      createHighlighter({
        themes: ['github-dark-dimmed', 'github-light'],
        langs: ['json', 'bash', 'typescript', 'javascript', 'yaml', 'xml', 'html', 'text', 'python', 'go', 'rust', 'sql'],
        engine: createJavaScriptRegexEngine(),
      }),
    );
  }
  return promise;
}

if (typeof window !== 'undefined') getHighlighter();
