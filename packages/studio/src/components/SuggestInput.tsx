import { useRef, useState } from 'react';

// Text input with a filtered suggestion dropdown — used for header names,
// header values (content types…), and anywhere a known-vocabulary helps.
export function SuggestInput({ value, onChange, suggestions, placeholder, className, onEnter }: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const matches = q
    ? suggestions.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 12)
    : suggestions.slice(0, 12);
  const show = open && matches.length > 0;

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0" style={{ flex: className?.includes('flex-[2]') ? 2 : undefined }}>
      <input
        className={className ?? 'input w-full h-7 text-[12.5px] font-mono'}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (!show) {
            if (e.key === 'Enter') onEnter?.();
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[hi] ?? matches[0]!); }
          else if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'Tab' && matches[hi]) pick(matches[hi]!);
        }}
      />
      {show && (
        <div className="suggest-pop">
          {matches.map((s, i) => (
            <button
              key={s}
              className={`suggest-item ${i === hi ? 'active' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHi(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
