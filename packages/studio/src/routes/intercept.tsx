import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { Plus, Trash2, Edit2, ArrowRightLeft, X, Check, ToggleLeft, ToggleRight } from 'lucide-react';

export const Route = createFileRoute('/intercept')({ component: InterceptPage });

interface InterceptRule {
  id: string;
  enabled: number;
  name: string;
  sort_order: number;
  match_path: string;
  match_method: string;
  target_host: string;
  strip_prefix: string;
  add_prefix: string;
  add_headers: string;
  created_at: number;
}

interface HeaderPair { key: string; value: string; }

interface RuleForm {
  name: string;
  match_method: string;
  match_path: string;
  target_host: string;
  strip_prefix: string;
  add_prefix: string;
  headers: HeaderPair[];
}

const EMPTY_FORM: RuleForm = {
  name: '',
  match_method: '*',
  match_path: '',
  target_host: '',
  strip_prefix: '',
  add_prefix: '',
  headers: [],
};

const METHODS = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_COLORS: Record<string, string> = {
  '*': '#8b5cf6', GET: '#22c55e', POST: '#f59e0b',
  PUT: '#3b82f6', PATCH: '#06b6d4', DELETE: '#ef4444',
};

function methodBadge(m: string) {
  const color = METHOD_COLORS[m] ?? '#8b5cf6';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: 'GeistMono, monospace',
      background: `${color}22`, color, borderRadius: 4, padding: '2px 6px',
    }}>
      {m || '*'}
    </span>
  );
}

function formToBody(f: RuleForm) {
  const add_headers: Record<string, string> = {};
  for (const { key, value } of f.headers) {
    if (key.trim()) add_headers[key.trim()] = value;
  }
  return {
    name: f.name,
    match_method: f.match_method,
    match_path: f.match_path,
    target_host: f.target_host,
    strip_prefix: f.strip_prefix,
    add_prefix: f.add_prefix,
    add_headers,
  };
}

function ruleToForm(r: InterceptRule): RuleForm {
  let headers: HeaderPair[] = [];
  try {
    const parsed = JSON.parse(r.add_headers) as Record<string, string>;
    headers = Object.entries(parsed).map(([key, value]) => ({ key, value }));
  } catch { /**/ }
  return {
    name: r.name,
    match_method: r.match_method || '*',
    match_path: r.match_path,
    target_host: r.target_host,
    strip_prefix: r.strip_prefix,
    add_prefix: r.add_prefix,
    headers,
  };
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
  background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
  border: '1px solid var(--border)', color: 'var(--foreground)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--muted-foreground)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

function RuleForm({
  initial, onSave, onCancel, saving,
}: {
  initial: RuleForm;
  onSave: (f: RuleForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuleForm>(initial);
  const set = (patch: Partial<RuleForm>) => setForm(f => ({ ...f, ...patch }));

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      padding: 20, background: 'var(--background)', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Row 1: name + method */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 14 }}>
        <div>
          <label style={LABEL_STYLE}>Rule name</label>
          <input style={INPUT_STYLE} placeholder="e.g. Forward to staging" value={form.name} onChange={e => set({ name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Match method</label>
          <select
            value={form.match_method}
            onChange={e => set({ match_method: e.target.value })}
            style={{ ...INPUT_STYLE }}
          >
            {METHODS.map(m => <option key={m} value={m}>{m === '*' ? '* (any)' : m}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2: match path */}
      <div>
        <label style={LABEL_STYLE}>Match path prefix</label>
        <input style={INPUT_STYLE} placeholder="e.g. /api/v1  (leave empty to match all)" value={form.match_path} onChange={e => set({ match_path: e.target.value })} />
      </div>

      {/* Row 3: target host */}
      <div>
        <label style={LABEL_STYLE}>Target host <span style={{ color: '#ef4444' }}>*</span></label>
        <input style={INPUT_STYLE} placeholder="e.g. https://staging.example.com" value={form.target_host} onChange={e => set({ target_host: e.target.value })} />
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
          Requests matching the rule are forwarded to this host instead of the spec server.
        </div>
      </div>

      {/* Row 4: path rewrite */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={LABEL_STYLE}>Strip prefix</label>
          <input style={INPUT_STYLE} placeholder="e.g. /api/v1" value={form.strip_prefix} onChange={e => set({ strip_prefix: e.target.value })} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Add prefix</label>
          <input style={INPUT_STYLE} placeholder="e.g. /v2" value={form.add_prefix} onChange={e => set({ add_prefix: e.target.value })} />
        </div>
      </div>

      {/* Row 5: extra headers */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ ...LABEL_STYLE, margin: 0 }}>Inject headers</label>
          <button
            onClick={() => set({ headers: [...form.headers, { key: '', value: '' }] })}
            style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', marginLeft: 2 }}
          >
            + Add header
          </button>
        </div>
        {form.headers.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...INPUT_STYLE, flex: '0 0 40%' }}
              placeholder="Header-Name"
              value={h.key}
              onChange={e => {
                const hs = [...form.headers];
                hs[i] = { ...hs[i], key: e.target.value };
                set({ headers: hs });
              }}
            />
            <input
              style={{ ...INPUT_STYLE, flex: 1 }}
              placeholder="value"
              value={h.value}
              onChange={e => {
                const hs = [...form.headers];
                hs[i] = { ...hs[i], value: e.target.value };
                set({ headers: hs });
              }}
            />
            <button
              onClick={() => set({ headers: form.headers.filter((_, j) => j !== i) })}
              style={{ padding: '0 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.target_host.trim()}
        >
          {saving ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Check size={12} />}
          Save rule
        </button>
      </div>
    </div>
  );
}

function InterceptPage() {
  const [rules, setRules] = useState<InterceptRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const data = await apiClient<InterceptRule[]>('/api/intercept');
      setRules(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form: RuleForm) => {
    setSaving(true);
    try {
      await apiClient('/api/intercept', { method: 'POST', body: JSON.stringify(formToBody(form)) });
      setShowForm(false);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, form: RuleForm) => {
    setSaving(true);
    try {
      await apiClient(`/api/intercept/${id}`, { method: 'PUT', body: JSON.stringify(formToBody(form)) });
      setEditingId(null);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const handleToggle = async (rule: InterceptRule) => {
    try {
      await apiClient(`/api/intercept/${rule.id}`, { method: 'PUT', body: JSON.stringify({ enabled: rule.enabled === 0 }) });
      await load();
    } catch (e) { setError(String(e)); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this intercept rule?')) return;
    try {
      await apiClient(`/api/intercept/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
          <ArrowRightLeft size={16} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>Request Intercept</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 3, lineHeight: 1.5 }}>
            Forward proxy requests to a different host, rewrite paths, and inject headers.
            Rules are evaluated in order; the first match wins.
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => { setShowForm(true); setEditingId(null); }}
          disabled={showForm}
        >
          <Plus size={13} />
          New rule
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* New rule form */}
      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <RuleForm
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <span className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      ) : rules.length === 0 && !showForm ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          border: '1px dashed var(--border)', borderRadius: 12,
          color: 'var(--muted-foreground)',
        }}>
          <ArrowRightLeft size={28} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No intercept rules</div>
          <div style={{ fontSize: 12.5, marginBottom: 16 }}>
            Rules let you forward requests to a different host or rewrite paths on the fly.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={13} /> Add your first rule
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map(rule => (
            <div key={rule.id}>
              {editingId === rule.id ? (
                <RuleForm
                  initial={ruleToForm(rule)}
                  onSave={form => handleUpdate(rule.id, form)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : (
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 10,
                  padding: '14px 16px', background: 'var(--background)',
                  opacity: rule.enabled ? 1 : 0.55,
                  transition: 'opacity 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(rule)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: rule.enabled ? 'var(--primary)' : 'var(--muted-foreground)', padding: 0, flexShrink: 0 }}
                      title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>

                    {/* Name */}
                    <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 120, color: 'var(--foreground)' }}>
                      {rule.name || <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Unnamed rule</span>}
                    </span>

                    {/* Match */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {methodBadge(rule.match_method || '*')}
                      <span style={{ fontSize: 12, fontFamily: 'GeistMono, monospace', color: 'var(--muted-foreground)' }}>
                        {rule.match_path || '*'}
                      </span>
                    </div>

                    {/* Arrow */}
                    <span style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>→</span>

                    {/* Target */}
                    <span style={{ fontSize: 12, fontFamily: 'GeistMono, monospace', color: 'var(--foreground)', flexShrink: 0, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rule.target_host || '—'}
                    </span>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingId(rule.id)} title="Edit">
                        <Edit2 size={12} />
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(rule.id)} title="Delete" style={{ color: '#ef4444' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Path rewrite + header badges */}
                  {(rule.strip_prefix || rule.add_prefix || rule.add_headers !== '{}') && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {rule.strip_prefix && (
                        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--foreground) 6%, transparent)', borderRadius: 5, padding: '2px 8px', fontFamily: 'GeistMono, monospace' }}>
                          strip: {rule.strip_prefix}
                        </span>
                      )}
                      {rule.add_prefix && (
                        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--foreground) 6%, transparent)', borderRadius: 5, padding: '2px 8px', fontFamily: 'GeistMono, monospace' }}>
                          prefix: {rule.add_prefix}
                        </span>
                      )}
                      {(() => {
                        try {
                          const h = JSON.parse(rule.add_headers) as Record<string, string>;
                          const keys = Object.keys(h);
                          if (keys.length > 0) return (
                            <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--foreground) 6%, transparent)', borderRadius: 5, padding: '2px 8px' }}>
                              +{keys.length} header{keys.length > 1 ? 's' : ''}
                            </span>
                          );
                        } catch { /**/ }
                        return null;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
