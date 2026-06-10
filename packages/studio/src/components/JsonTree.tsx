import React, { useMemo, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

// ── Collapsible JSON tree (Insomnia-style fold/unfold) ───────────────────────

const COLORS = {
  key: 'var(--json-key, #79b8ff)',
  string: 'var(--json-string, #9ecbff)',
  number: 'var(--json-number, #f8c555)',
  boolean: 'var(--json-bool, #b392f0)',
  null: 'var(--placeholder-foreground)',
  punct: 'var(--muted-foreground)',
};

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span style={{ color: COLORS.null }}>null</span>;
  switch (typeof value) {
    case 'string': return <span style={{ color: COLORS.string }}>"{value.length > 2000 ? value.slice(0, 2000) + '…' : value}"</span>;
    case 'number': return <span style={{ color: COLORS.number }}>{String(value)}</span>;
    case 'boolean': return <span style={{ color: COLORS.boolean }}>{String(value)}</span>;
    default: return <span style={{ color: COLORS.null }}>{String(value)}</span>;
  }
}

interface NodeProps {
  k: string | null;          // key in parent (null = root / array item label shown as index)
  value: unknown;
  depth: number;
  path: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  isLast: boolean;
}

const PAGE = 100; // children rendered per "show more" page for huge arrays/objects

function Node({ k, value, depth, path, expanded, toggle, isLast }: NodeProps) {
  const [page, setPage] = useState(1);
  const isObj = value !== null && typeof value === 'object';
  const comma = isLast ? '' : ',';
  const indent = { paddingLeft: depth * 18 };

  const keyLabel = k !== null && (
    <>
      <span style={{ color: COLORS.key }}>"{k}"</span>
      <span style={{ color: COLORS.punct }}>: </span>
    </>
  );

  if (!isObj) {
    return (
      <div style={indent} className="jt-row">
        <span className="jt-caret-space" />
        {keyLabel}
        <Primitive value={value} />
        <span style={{ color: COLORS.punct }}>{comma}</span>
      </div>
    );
  }

  const isArr = Array.isArray(value);
  const entries = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const open = expanded.has(path);
  const [openCh, closeCh] = isArr ? ['[', ']'] : ['{', '}'];
  const count = entries.length;

  if (!open) {
    return (
      <div style={indent} className="jt-row jt-clickable" onClick={() => toggle(path)}>
        <span className="jt-caret"><ChevronRight size={11} /></span>
        {keyLabel}
        <span style={{ color: COLORS.punct }}>{openCh} … {closeCh}</span>
        <span className="jt-count">{count} {isArr ? (count === 1 ? 'item' : 'items') : (count === 1 ? 'key' : 'keys')}</span>
        <span style={{ color: COLORS.punct }}>{comma}</span>
      </div>
    );
  }

  const visible = entries.slice(0, page * PAGE);

  return (
    <>
      <div style={indent} className="jt-row jt-clickable" onClick={() => toggle(path)}>
        <span className="jt-caret"><ChevronDown size={11} /></span>
        {keyLabel}
        <span style={{ color: COLORS.punct }}>{openCh}</span>
      </div>
      {visible.map(([ck, cv], i) => (
        <Node
          key={ck}
          k={isArr ? null : ck}
          value={cv}
          depth={depth + 1}
          path={`${path}.${ck}`}
          expanded={expanded}
          toggle={toggle}
          isLast={i === entries.length - 1}
        />
      ))}
      {visible.length < entries.length && (
        <div style={{ paddingLeft: (depth + 1) * 18 }} className="jt-row">
          <button className="jt-more" onClick={() => setPage(p => p + 1)}>
            … {entries.length - visible.length} more
          </button>
        </div>
      )}
      <div style={indent} className="jt-row">
        <span className="jt-caret-space" />
        <span style={{ color: COLORS.punct }}>{closeCh}{comma}</span>
      </div>
    </>
  );
}

function collectPaths(value: unknown, path: string, depth: number, maxDepth: number, out: Set<string>) {
  if (value === null || typeof value !== 'object' || depth > maxDepth) return;
  out.add(path);
  const entries = Array.isArray(value)
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  for (const [k, v] of entries) collectPaths(v, `${path}.${k}`, depth + 1, maxDepth, out);
}

export interface JsonTreeControls { expandAll: () => void; collapseAll: () => void; }

export function JsonTree({ data, controlsRef }: { data: unknown; controlsRef?: React.MutableRefObject<JsonTreeControls | null> }) {
  // Default: expand the first two levels
  const initial = useMemo(() => {
    const s = new Set<string>();
    collectPaths(data, '$', 0, 1, s);
    return s;
  }, [data]);
  const [expanded, setExpanded] = useState<Set<string>>(initial);
  const [, setVersion] = useState(0);

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const expandAll = () => {
    const s = new Set<string>();
    collectPaths(data, '$', 0, 50, s);
    setExpanded(s);
    setVersion(v => v + 1);
  };
  const collapseAll = () => setExpanded(new Set());

  useEffect(() => {
    if (controlsRef) controlsRef.current = { expandAll, collapseAll };
  });

  return (
    <div className="flex-1 overflow-auto py-2 px-3 font-mono text-[12.5px] leading-[1.7]">
      <Node k={null} value={data} depth={0} path="$" expanded={expanded} toggle={toggle} isLast />
    </div>
  );
}
