import { useEffect, useState } from 'react';
import { X, Copy, Check, Code2 } from 'lucide-react';
import { JsonViewer } from './JsonViewer';
import { CODE_TARGETS, type CodeRequest } from '../lib/codegen';
import { cn } from '../lib/utils';

// "Copy as code" dialog — generates the request in cURL / fetch / axios / …
export function CodeModal({ request, onClose }: { request: CodeRequest; onClose: () => void }) {
  const [targetId, setTargetId] = useState<string>(() => {
    try { return localStorage.getItem('codegen_target') || 'curl'; } catch { return 'curl'; }
  });
  const [copied, setCopied] = useState(false);

  const target = CODE_TARGETS.find(t => t.id === targetId) ?? CODE_TARGETS[0]!;
  let code = '';
  let genError: string | null = null;
  try { code = target.generate(request); } catch (e) { genError = e instanceof Error ? e.message : String(e); }

  useEffect(() => {
    try { localStorage.setItem('codegen_target', targetId); } catch { /* */ }
  }, [targetId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="cmd-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className="w-full mx-4 bg-[var(--popover)] border border-[var(--border-strong)] rounded-xl overflow-hidden flex flex-col"
        style={{ maxWidth: 760, maxHeight: '78vh', boxShadow: 'var(--shadow)', animation: 'dialog-in 0.12s ease' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <Code2 size={14} className="text-[var(--muted-foreground)]" />
          <h2 className="text-[13.5px] font-semibold text-[var(--foreground)] flex-1 m-0">Copy request as code</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={13} /></button>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-[var(--border)] flex-shrink-0 overflow-x-auto">
          {CODE_TARGETS.map(t => (
            <button
              key={t.id}
              className={cn('btn btn-ghost btn-sm text-[12px] flex-shrink-0', targetId === t.id && 'bg-[var(--primary-dim)] text-[var(--primary)]')}
              onClick={() => setTargetId(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm gap-1.5 text-[12px] ml-auto flex-shrink-0" onClick={copy}>
            {copied ? <Check size={12} className="text-[var(--primary)]" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="flex-1 overflow-auto min-h-[200px]">
          {genError
            ? <div className="p-4 text-[12.5px] text-[var(--destructive)]">{genError}</div>
            : <JsonViewer text={code} lang={target.lang} />}
        </div>
      </div>
    </div>
  );
}
