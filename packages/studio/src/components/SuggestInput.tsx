import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.trim().toLowerCase();
  const matches = q
    ? suggestions.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 12)
    : suggestions.slice(0, 12);
  const show = open && matches.length > 0;

  useEffect(() => {
    if (!show || !inputRef.current) return;
    const update = () => {
      const r = inputRef.current!.getBoundingClientRect();
      setPopStyle({ top: r.bottom + 3, left: r.left, minWidth: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show]);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className="relative flex-1 min-w-0" style={{ flex: className?.includes('flex-[2]') ? 2 : undefined }}>
      <input
        ref={inputRef}
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
      {show && createPortal(
        <div className="suggest-pop" style={{ position: 'fixed', zIndex: 9999, ...popStyle }}>
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
        </div>,
        document.body,
      )}
    </div>
  );
}
