import { dbPut, dbGetAll, dbDel } from './storage';

export interface EnvVar { key: string; value: string; enabled: boolean; }
export interface Environment {
  id: string; name: string; color: string; vars: EnvVar[];
  /** Default headers applied to every request sent with this environment. */
  headers?: EnvVar[];
}

const STORE = 'environments';
const LS_ACTIVE = 'env_active_id';

// Spec-derived variables — always resolved regardless of active environment.
// Set by the explorer when a spec loads; cleared when no spec is active.
let _specVars: Record<string, string> = {};
export function setSpecVars(vars: Record<string, string>) { _specVars = vars; }
export function getSpecVars(): Record<string, string> { return _specVars; }

export function getActiveEnvId(): string | null {
  try { return localStorage.getItem(LS_ACTIVE); } catch { return null; }
}
export function setActiveEnvId(id: string | null) {
  try { id ? localStorage.setItem(LS_ACTIVE, id) : localStorage.removeItem(LS_ACTIVE); } catch { /**/ }
}

export function listEnvironments(): Promise<Environment[]> { return dbGetAll<Environment>(STORE); }
export function saveEnvironment(e: Environment): Promise<void> { return dbPut(STORE, e); }
export function deleteEnvironment(id: string): Promise<void> { return dbDel(STORE, id); }

// Built-in dynamic variables — evaluated fresh on each resolve call
const DYNAMIC_VARS: Record<string, () => string> = {
  '$guid':          () => crypto.randomUUID(),
  '$timestamp':     () => String(Math.floor(Date.now() / 1000)),
  '$isoTimestamp':  () => new Date().toISOString(),
  '$randomInt':     () => String(Math.floor(Math.random() * 1000)),
  '$randomFloat':   () => (Math.random() * 100).toFixed(4),
  '$randomString':  () => Math.random().toString(36).slice(2, 10),
  '$randomBoolean': () => String(Math.random() > 0.5),
  '$randomEmail':   () => `user${Math.floor(Math.random() * 9999)}@example.com`,
};

export const DYNAMIC_VAR_NAMES = Object.keys(DYNAMIC_VARS);

export function resolveVars(text: string, env: Environment | null): string {
  if (!text) return text;
  let out = text;
  for (const [key, fn] of Object.entries(DYNAMIC_VARS)) {
    if (out.includes(`{{${key}}}`)) out = out.replaceAll(`{{${key}}}`, fn());
  }
  // Spec-derived vars (e.g. baseUrl) — env vars can override if the user defines the same key
  for (const [key, val] of Object.entries(_specVars)) {
    if (val && out.includes(`{{${key}}}`)) out = out.replaceAll(`{{${key}}}`, val);
  }
  if (env) {
    for (const v of env.vars) {
      if (v.enabled && v.key) out = out.replaceAll(`{{${v.key}}}`, v.value);
    }
  }
  return out;
}

export const ENV_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#f97316'];
