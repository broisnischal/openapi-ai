import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import {
  Save, Plug, CheckCircle, XCircle, Check, Plus, Trash2, Edit2,
  User, Key,
} from 'lucide-react';

export const Route = createFileRoute('/auth')({ component: AuthPage });

type AuthType =
  | 'none' | 'bearer' | 'basic'
  | 'apikey_header' | 'apikey_query' | 'apikey_cookie'
  | 'oauth2_cc' | 'oidc' | 'custom';

interface AuthConfig {
  type: AuthType; token?: string; username?: string; password?: string;
  headerName?: string; apiKey?: string; queryParam?: string; cookieName?: string;
  tokenUrl?: string; clientId?: string; clientSecret?: string; scope?: string;
  openIdConnectUrl?: string; customHeaders?: Record<string, string>;
}

interface AuthProfile {
  id: string;
  name: string;
  description: string;
  type: string;
  config: string; // JSON
  is_active: number;
  created_at: number;
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
  background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
  border: '1px solid var(--border)', color: 'var(--foreground)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'none',          label: 'None' },
  { value: 'bearer',        label: 'Bearer Token' },
  { value: 'basic',         label: 'HTTP Basic' },
  { value: 'apikey_header', label: 'API Key — Header' },
  { value: 'apikey_query',  label: 'API Key — Query Param' },
  { value: 'apikey_cookie', label: 'API Key — Cookie' },
  { value: 'oauth2_cc',     label: 'OAuth2 Client Credentials' },
  { value: 'oidc',          label: 'OpenID Connect' },
  { value: 'custom',        label: 'Custom Headers' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function AuthFields({
  authType, config, customTxt,
  onChange, onCustomChange,
}: {
  authType: AuthType;
  config: AuthConfig;
  customTxt: string;
  onChange: (k: keyof AuthConfig, v: string) => void;
  onCustomChange: (v: string) => void;
}) {
  if (authType === 'none') return null;
  return (
    <div style={{ marginTop: 14 }}>
      {authType === 'bearer' && (
        <Field label="Bearer Token">
          <input style={INPUT} type="password" placeholder="eyJhbGciOiJ…" value={config.token ?? ''} onChange={e => onChange('token', e.target.value)} />
        </Field>
      )}
      {authType === 'basic' && (
        <>
          <Field label="Username"><input style={INPUT} placeholder="username" value={config.username ?? ''} onChange={e => onChange('username', e.target.value)} /></Field>
          <Field label="Password"><input style={INPUT} type="password" placeholder="password" value={config.password ?? ''} onChange={e => onChange('password', e.target.value)} /></Field>
        </>
      )}
      {(authType === 'apikey_header' || authType === 'apikey_query' || authType === 'apikey_cookie') && (
        <>
          <Field label={authType === 'apikey_header' ? 'Header Name' : authType === 'apikey_query' ? 'Query Param' : 'Cookie Name'}>
            <input style={INPUT}
              placeholder={authType === 'apikey_header' ? 'X-API-Key' : authType === 'apikey_query' ? 'api_key' : 'session'}
              value={(authType === 'apikey_header' ? config.headerName : authType === 'apikey_query' ? config.queryParam : config.cookieName) ?? ''}
              onChange={e => onChange(authType === 'apikey_header' ? 'headerName' : authType === 'apikey_query' ? 'queryParam' : 'cookieName', e.target.value)}
            />
          </Field>
          <Field label="API Key"><input style={INPUT} type="password" placeholder="your-api-key" value={config.apiKey ?? ''} onChange={e => onChange('apiKey', e.target.value)} /></Field>
        </>
      )}
      {(authType === 'oauth2_cc' || authType === 'oidc') && (
        <>
          {authType === 'oidc' && (
            <Field label="OpenID Connect Discovery URL">
              <input style={INPUT} placeholder="https://auth.example.com/.well-known/openid-configuration" value={config.openIdConnectUrl ?? ''} onChange={e => onChange('openIdConnectUrl', e.target.value)} />
            </Field>
          )}
          {authType === 'oauth2_cc' && (
            <Field label="Token URL">
              <input style={INPUT} placeholder="https://auth.example.com/oauth/token" value={config.tokenUrl ?? ''} onChange={e => onChange('tokenUrl', e.target.value)} />
            </Field>
          )}
          <Field label="Client ID"><input style={INPUT} placeholder="client_id" value={config.clientId ?? ''} onChange={e => onChange('clientId', e.target.value)} /></Field>
          <Field label="Client Secret"><input style={INPUT} type="password" placeholder="client_secret" value={config.clientSecret ?? ''} onChange={e => onChange('clientSecret', e.target.value)} /></Field>
          <Field label="Scope (optional)"><input style={INPUT} placeholder="read write" value={config.scope ?? ''} onChange={e => onChange('scope', e.target.value)} /></Field>
        </>
      )}
      {authType === 'custom' && (
        <Field label="Custom Headers (JSON)">
          <textarea style={{ ...INPUT, resize: 'vertical' } as React.CSSProperties} rows={5} placeholder={'{\n  "X-Custom-Header": "value"\n}'} value={customTxt} onChange={e => onCustomChange(e.target.value)} />
        </Field>
      )}
    </div>
  );
}

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    none: 'var(--muted-foreground)', bearer: 'var(--foreground-secondary)', basic: 'var(--foreground-secondary)',
    apikey_header: 'var(--success)', apikey_query: 'var(--success)', apikey_cookie: 'var(--success)',
    oauth2_cc: 'var(--warning)', oidc: 'var(--warning)', custom: 'var(--muted-foreground)',
  };
  const color = colors[type] ?? 'var(--muted-foreground)';
  const label = AUTH_TYPES.find(a => a.value === type)?.label ?? type;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, background: `${color}22`, color, borderRadius: 5, padding: '2px 7px' }}>
      {label}
    </span>
  );
}

interface ProfileFormData {
  name: string;
  description: string;
  type: AuthType;
  config: AuthConfig;
  customTxt: string;
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ProfileFormData;
  onSave: (data: ProfileFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [authType, setAuthType] = useState<AuthType>(initial.type);
  const [config, setConfig] = useState<AuthConfig>(initial.config);
  const [customTxt, setCustomTxt] = useState(initial.customTxt);

  const changeType = (t: AuthType) => { setAuthType(t); setConfig({ type: t }); };
  const onChange = (k: keyof AuthConfig, v: string) => setConfig(p => ({ ...p, [k]: v }));

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 18, background: 'var(--background)', marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Field label="Profile name *">
          <input style={INPUT} placeholder='e.g. "Admin token"' value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <input style={INPUT} placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
      </div>
      <Field label="Auth type">
        <select style={INPUT} value={authType} onChange={e => changeType(e.target.value as AuthType)}>
          {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <AuthFields authType={authType} config={config} customTxt={customTxt} onChange={onChange} onCustomChange={setCustomTxt} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave({ name, description, type: authType, config, customTxt })} disabled={saving || !name.trim()}>
          {saving ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Check size={12} />}
          Save profile
        </button>
      </div>
    </div>
  );
}

const BLANK_PROFILE_FORM: ProfileFormData = { name: '', description: '', type: 'bearer' as AuthType, config: { type: 'bearer' as AuthType }, customTxt: '{}' };

function AuthPage() {
  // Active auth state
  const [authType, setAuthType] = useState<AuthType>('none');
  const [config, setConfig] = useState<AuthConfig>({ type: 'none' });
  const [customTxt, setCustomTxt] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // Profiles state
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const loadAuth = () =>
    apiClient<{ type: AuthType; config: AuthConfig }>('/api/auth')
      .then(d => {
        setAuthType(d.type as AuthType);
        setConfig({ ...d.config, type: d.type as AuthType });
        if (d.config.customHeaders) setCustomTxt(JSON.stringify(d.config.customHeaders, null, 2));
      }).catch(() => {});

  const loadProfiles = () =>
    apiClient<AuthProfile[]>('/api/auth/profiles')
      .then(setProfiles).catch(() => {});

  useEffect(() => { loadAuth(); loadProfiles(); }, []);

  const set = (k: keyof AuthConfig, v: string) => setConfig(p => ({ ...p, [k]: v }));
  const changeType = (t: AuthType) => { setAuthType(t); setConfig({ type: t }); setTestResult(null); };

  const saveActive = async () => {
    setSaving(true);
    const final: AuthConfig = { ...config };
    if (authType === 'custom') { try { final.customHeaders = JSON.parse(customTxt); } catch { /**/ } }
    try {
      await apiClient('/api/auth', { method: 'PUT', body: JSON.stringify({ type: authType, config: final }) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { /**/ } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await apiClient<{ ok: boolean; status?: number; error?: string }>('/api/auth/test', { method: 'POST' });
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, error: e instanceof Error ? e.message : 'Test failed' }); }
    finally { setTesting(false); }
  };

  const createProfile = async (form: ProfileFormData) => {
    setProfileSaving(true);
    const final: AuthConfig = { ...form.config };
    if (form.type === 'custom') { try { final.customHeaders = JSON.parse(form.customTxt); } catch { /**/ } }
    try {
      await apiClient('/api/auth/profiles', { method: 'POST', body: JSON.stringify({ name: form.name, description: form.description, type: form.type, config: final }) });
      setShowNewForm(false);
      await loadProfiles();
    } catch { /**/ } finally { setProfileSaving(false); }
  };

  const updateProfile = async (id: string, form: ProfileFormData) => {
    setProfileSaving(true);
    const final: AuthConfig = { ...form.config };
    if (form.type === 'custom') { try { final.customHeaders = JSON.parse(form.customTxt); } catch { /**/ } }
    try {
      await apiClient(`/api/auth/profiles/${id}`, { method: 'PUT', body: JSON.stringify({ name: form.name, description: form.description, type: form.type, config: final }) });
      setEditingId(null);
      await loadProfiles();
    } catch { /**/ } finally { setProfileSaving(false); }
  };

  const deleteProfile = async (id: string) => {
    if (!confirm('Delete this auth profile?')) return;
    try { await apiClient(`/api/auth/profiles/${id}`, { method: 'DELETE' }); await loadProfiles(); } catch { /**/ }
  };

  const activateProfile = async (profile: AuthProfile) => {
    setActivating(profile.id);
    try {
      await apiClient(`/api/auth/profiles/${profile.id}/activate`, { method: 'POST' });
      await loadAuth();
      await loadProfiles();
    } catch { /**/ } finally { setActivating(null); }
  };

  const activeProfile = profiles.find(p => p.is_active === 1);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--background)' }}>
      <div className="page-header">
        <h1>Authentication</h1>
        <p>Credentials applied to all proxied and AI-executed requests.</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 640 }}>

        {/* Active Auth */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={14} style={{ color: 'var(--muted-foreground)' }} />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Active Auth</span>
            {activeProfile && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                from profile: <strong>{activeProfile.name}</strong>
              </span>
            )}
          </div>
          <div style={{ padding: '16px 18px' }}>
            <Field label="Type">
              <select style={INPUT} value={authType} onChange={e => changeType(e.target.value as AuthType)}>
                {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </Field>
            <AuthFields authType={authType} config={config} customTxt={customTxt} onChange={set} onCustomChange={setCustomTxt} />

            {testResult && (
              <div style={{ marginBottom: 14, padding: '9px 13px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: testResult.ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                {testResult.ok ? <CheckCircle size={14} style={{ color: 'var(--success)' }} /> : <XCircle size={14} style={{ color: 'var(--destructive)' }} />}
                <span style={{ color: testResult.ok ? 'var(--success)' : 'var(--destructive)' }}>
                  {testResult.ok ? `Connected — HTTP ${testResult.status}` : (testResult.error ?? `HTTP ${testResult.status}`)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={saveActive} disabled={saving} style={{ gap: 6 }}>
                {saved ? <Check size={13} /> : <Save size={13} />}
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={test} disabled={testing} style={{ gap: 6 }}>
                <Plug size={13} />
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>

        {/* Saved Profiles */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={14} style={{ color: 'var(--muted-foreground)' }} />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Saved Profiles</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginLeft: 2 }}>
              — switch identities via Studio or the AI
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowNewForm(true); setEditingId(null); }} disabled={showNewForm} style={{ marginLeft: 'auto', gap: 5 }}>
              <Plus size={12} /> Add profile
            </button>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {showNewForm && (
              <ProfileForm initial={BLANK_PROFILE_FORM} onSave={createProfile} onCancel={() => setShowNewForm(false)} saving={profileSaving} />
            )}
            {profiles.length === 0 && !showNewForm ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted-foreground)', fontSize: 13 }}>
                No profiles saved. Add one to let the AI switch authentication roles.
              </div>
            ) : (
              profiles.map(p => {
                const parsedConfig = (() => { try { return JSON.parse(p.config) as AuthConfig; } catch { return {} as AuthConfig; } })();
                const customHeaders = parsedConfig.customHeaders ? JSON.stringify(parsedConfig.customHeaders, null, 2) : '{}';
                if (editingId === p.id) {
                  return (
                    <ProfileForm
                      key={p.id}
                      initial={{ name: p.name, description: p.description, type: p.type as AuthType, config: parsedConfig, customTxt: customHeaders }}
                      onSave={form => updateProfile(p.id, form)}
                      onCancel={() => setEditingId(null)}
                      saving={profileSaving}
                    />
                  );
                }
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {p.is_active === 1 && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px rgba(34,197,94,0.5)', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>{p.name}</span>
                        {typeBadge(p.type)}
                      </div>
                      {p.description && <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 2 }}>{p.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      {p.is_active !== 1 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => activateProfile(p)}
                          disabled={activating === p.id}
                          style={{ fontSize: 11.5 }}
                        >
                          {activating === p.id ? <span className="spinner" style={{ width: 10, height: 10 }} /> : 'Activate'}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingId(p.id)} title="Edit"><Edit2 size={12} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => deleteProfile(p.id)} title="Delete" style={{ color: '#ef4444' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
