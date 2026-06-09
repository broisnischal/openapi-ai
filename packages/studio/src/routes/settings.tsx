import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';
import { Save, Check } from 'lucide-react';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

type AIProvider = 'anthropic' | 'openai' | 'ollama' | 'mistral' | 'github-copilot' | 'gemini' | 'groq' | 'custom';

interface Settings {
  proxy: { enabled: boolean; type: 'http' | 'https' | 'socks5'; host: string; port: number; username: string; password: string; };
  ai: { provider: AIProvider; apiKey: string; model: string; baseUrl: string; };
  request: { timeout: number; followRedirects: boolean; sslVerify: boolean; };
}

const PROVIDER_CONFIGS: Record<AIProvider, {
  label: string; defaultModel: string; modelHint: string;
  needsKey: boolean; keyPlaceholder: string;
  showBaseUrl: boolean; baseUrlLabel: string; baseUrlPlaceholder: string; baseUrlHint: string;
}> = {
  anthropic:        { label: 'Anthropic (Claude)',         defaultModel: 'claude-haiku-4-5-20251001', modelHint: 'e.g. claude-opus-4-8, claude-sonnet-4-6', needsKey: true,  keyPlaceholder: 'sk-ant-…',                      showBaseUrl: false, baseUrlLabel: '',                        baseUrlPlaceholder: '',                           baseUrlHint: '' },
  openai:           { label: 'OpenAI',                     defaultModel: 'gpt-4o-mini',               modelHint: 'e.g. gpt-4o, gpt-4o-mini, o1-mini',       needsKey: true,  keyPlaceholder: 'sk-…',                          showBaseUrl: true,  baseUrlLabel: 'Custom Endpoint (optional)', baseUrlPlaceholder: 'https://api.openai.com',      baseUrlHint: 'Leave empty to use https://api.openai.com' },
  ollama:           { label: 'Ollama (local)',              defaultModel: 'llama3',                    modelHint: 'e.g. llama3, mistral, codellama',          needsKey: false, keyPlaceholder: '',                              showBaseUrl: true,  baseUrlLabel: 'Base URL',                  baseUrlPlaceholder: 'http://localhost:11434',      baseUrlHint: 'Ollama server address' },
  mistral:          { label: 'Mistral AI',                  defaultModel: 'mistral-small-latest',      modelHint: 'e.g. mistral-small-latest, mistral-large-latest', needsKey: true, keyPlaceholder: '',                       showBaseUrl: true,  baseUrlLabel: 'Custom Endpoint (optional)', baseUrlPlaceholder: 'https://api.mistral.ai',      baseUrlHint: 'Leave empty to use https://api.mistral.ai' },
  'github-copilot': { label: 'GitHub Copilot',             defaultModel: 'gpt-4o',                    modelHint: 'e.g. gpt-4o, gpt-3.5-turbo',              needsKey: true,  keyPlaceholder: 'github_pat_…',                  showBaseUrl: true,  baseUrlLabel: 'Custom Endpoint (optional)', baseUrlPlaceholder: 'https://api.githubcopilot.com', baseUrlHint: 'Leave empty to use https://api.githubcopilot.com' },
  gemini:           { label: 'Google Gemini',               defaultModel: 'gemini-1.5-flash',          modelHint: 'e.g. gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash', needsKey: true, keyPlaceholder: 'AIza…',         showBaseUrl: false, baseUrlLabel: '',                        baseUrlPlaceholder: '',                           baseUrlHint: '' },
  groq:             { label: 'Groq',                        defaultModel: 'llama-3.1-70b-versatile',   modelHint: 'e.g. llama-3.1-70b-versatile, mixtral-8x7b-32768', needsKey: true,  keyPlaceholder: 'gsk_…',             showBaseUrl: true,  baseUrlLabel: 'Custom Endpoint (optional)', baseUrlPlaceholder: 'https://api.groq.com/openai', baseUrlHint: 'Leave empty to use https://api.groq.com/openai' },
  custom:           { label: 'Custom (OpenAI-compatible)',  defaultModel: '',                          modelHint: 'Model name to pass to your API',          needsKey: true,  keyPlaceholder: 'Bearer token or API key (optional)', showBaseUrl: true,  baseUrlLabel: 'Base URL',                  baseUrlPlaceholder: 'https://your-endpoint.com',  baseUrlHint: 'Your OpenAI-compatible API endpoint' },
};

const DEF: Settings = {
  proxy: { enabled: false, type: 'http', host: '', port: 8080, username: '', password: '' },
  ai: { provider: 'anthropic', apiKey: '', model: 'claude-haiku-4-5-20251001', baseUrl: '' },
  request: { timeout: 30000, followRedirects: true, sslVerify: true },
};

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--placeholder-foreground)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        transition: 'background 0.2s', padding: 0, position: 'relative',
        background: checked ? 'var(--accent)' : 'var(--elevated)',
      }}
    >
      <span style={{
        display: 'block', width: 14, height: 14, borderRadius: '50%',
        background: '#fff', position: 'absolute', top: 3,
        left: checked ? 19 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function SettingsPage() {
  const [s, setS] = useState<Settings>(DEF);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient<Settings>('/api/settings')
      .then(d => setS({ ...DEF, ...d, proxy: { ...DEF.proxy, ...d.proxy }, ai: { ...DEF.ai, ...d.ai }, request: { ...DEF.request, ...d.request } }))
      .catch(() => {});
  }, []);

  const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) =>
    setS(prev => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const handleProviderChange = (p: AIProvider) =>
    set('ai', { provider: p, model: PROVIDER_CONFIGS[p].defaultModel, baseUrl: '' });

  const save = async () => {
    setSaving(true);
    try {
      await apiClient('/api/settings', { method: 'PUT', body: JSON.stringify(s) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--background)' }}>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure proxy, AI provider, and request defaults.</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 600 }}>

        <Section title="AI Provider" desc="Power the AI assistant and endpoint search.">
          <Field label="Provider">
            <select className="select" value={s.ai.provider} onChange={e => handleProviderChange(e.target.value as AIProvider)}>
              {(Object.keys(PROVIDER_CONFIGS) as AIProvider[]).map(p => (
                <option key={p} value={p}>{PROVIDER_CONFIGS[p].label}</option>
              ))}
            </select>
          </Field>
          {PROVIDER_CONFIGS[s.ai.provider].needsKey && (
            <Field label="API Key" hint="Stored locally, never sent to third parties.">
              <input
                className="input" type="password"
                placeholder={PROVIDER_CONFIGS[s.ai.provider].keyPlaceholder}
                value={s.ai.apiKey}
                onChange={e => set('ai', { apiKey: e.target.value })}
                style={{ fontFamily: 'GeistMono, monospace' }}
              />
            </Field>
          )}
          <Field label="Model" hint={PROVIDER_CONFIGS[s.ai.provider].modelHint}>
            <input
              className="input"
              placeholder={PROVIDER_CONFIGS[s.ai.provider].defaultModel || 'model-name'}
              value={s.ai.model}
              onChange={e => set('ai', { model: e.target.value })}
              style={{ fontFamily: 'GeistMono, monospace' }}
            />
          </Field>
          {PROVIDER_CONFIGS[s.ai.provider].showBaseUrl && (
            <Field
              label={PROVIDER_CONFIGS[s.ai.provider].baseUrlLabel}
              hint={PROVIDER_CONFIGS[s.ai.provider].baseUrlHint}
            >
              <input
                className="input"
                placeholder={PROVIDER_CONFIGS[s.ai.provider].baseUrlPlaceholder}
                value={s.ai.baseUrl}
                onChange={e => set('ai', { baseUrl: e.target.value })}
                style={{ fontFamily: 'GeistMono, monospace' }}
              />
            </Field>
          )}
        </Section>

        <Section title="Proxy" desc="Route requests through an HTTP or SOCKS5 proxy.">
          <Field label="Enable Proxy">
            <Toggle checked={s.proxy.enabled} onChange={v => set('proxy', { enabled: v })} />
          </Field>
          {s.proxy.enabled && (
            <>
              <Field label="Type">
                <select className="select" value={s.proxy.type} onChange={e => set('proxy', { type: e.target.value as Settings['proxy']['type'] })}>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Host">
                    <input className="input" placeholder="localhost" value={s.proxy.host} onChange={e => set('proxy', { host: e.target.value })} style={{ fontFamily: 'GeistMono, monospace' }} />
                  </Field>
                </div>
                <div>
                  <Field label="Port">
                    <input className="input" type="number" placeholder="8080" value={s.proxy.port} onChange={e => set('proxy', { port: +e.target.value })} style={{ width: 100, fontFamily: 'GeistMono, monospace' }} />
                  </Field>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Username">
                    <input className="input" placeholder="user" value={s.proxy.username} onChange={e => set('proxy', { username: e.target.value })} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Password">
                    <input className="input" type="password" placeholder="pass" value={s.proxy.password} onChange={e => set('proxy', { password: e.target.value })} />
                  </Field>
                </div>
              </div>
            </>
          )}
        </Section>

        <Section title="Request Defaults" desc="Applied to all outgoing requests.">
          <Field label="Timeout (ms)">
            <input className="input" type="number" value={s.request.timeout} onChange={e => set('request', { timeout: +e.target.value })} style={{ width: 130, fontFamily: 'GeistMono, monospace' }} />
          </Field>
          <div style={{ display: 'flex', gap: 32 }}>
            <Field label="Follow Redirects">
              <Toggle checked={s.request.followRedirects} onChange={v => set('request', { followRedirects: v })} />
            </Field>
            <Field label="Verify SSL">
              <Toggle checked={s.request.sslVerify} onChange={v => set('request', { sslVerify: v })} />
            </Field>
          </div>
        </Section>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ gap: 7 }}>
          {saved ? <Check size={13} /> : <Save size={13} />}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
