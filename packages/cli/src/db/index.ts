import { Database } from 'bun:sqlite';
import { SCHEMA } from './schema';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const DATA_DIR = join(import.meta.dir, '../../data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'openapi-agent.db');

export const db = new Database(DB_PATH, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = OFF;');

// Migrate away from old multi-spec schema if present
const hasOldSchema = db
  .query("SELECT name FROM sqlite_master WHERE type='table' AND name='specs'")
  .get() !== null;
if (hasOldSchema) {
  db.exec('DROP TABLE IF EXISTS tools; DROP TABLE IF EXISTS specs; DROP TABLE IF EXISTS auth_configs; DROP TABLE IF EXISTS request_logs;');
}

db.exec(SCHEMA);

export interface InterceptRuleRow {
  id: string;
  enabled: number; // 0 or 1
  name: string;
  sort_order: number;
  match_path: string;
  match_method: string;
  target_host: string;
  strip_prefix: string;
  add_prefix: string;
  add_headers: string; // JSON
  created_at: number;
}

export interface AuthConfigRow {
  id: string;
  type: string;
  config: string;
  token_cache: string | null;
  updated_at: number;
}

export interface AuthProfileRow {
  id: string;
  name: string;
  description: string;
  type: string;
  config: string;       // JSON
  token_cache: string | null;
  is_active: number;    // 0 or 1
  created_at: number;
}

export interface LogRow {
  id: string;
  source: string;
  tool_name: string | null;
  method: string;
  url: string;
  request_headers: string | null;
  request_body: string | null;
  status_code: number | null;
  response_headers: string | null;
  response_body: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: number;
}

export const dbQueries = {
  getAuthConfig: () =>
    db.query("SELECT * FROM auth_config WHERE id = 'default'").get() as AuthConfigRow | null,

  setAuthConfig: (type: string, config: object) =>
    db.query(`INSERT INTO auth_config (id, type, config, updated_at)
              VALUES ('default', ?, ?, unixepoch())
              ON CONFLICT(id) DO UPDATE SET type = excluded.type, config = excluded.config, updated_at = unixepoch()`)
      .run(type, JSON.stringify(config)),

  updateTokenCache: (tokenCache: object | null) =>
    db.query("UPDATE auth_config SET token_cache = ? WHERE id = 'default'")
      .run(tokenCache ? JSON.stringify(tokenCache) : null),

  getRecentLogs: (limit = 500) =>
    db.query('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ?').all(limit) as LogRow[],

  insertLog: (data: Omit<LogRow, 'created_at'>) =>
    db.query(`INSERT INTO request_logs
              (id, source, tool_name, method, url, request_headers, request_body,
               status_code, response_headers, response_body, latency_ms, error)
              VALUES ($id, $source, $tool_name, $method, $url, $request_headers, $request_body,
               $status_code, $response_headers, $response_body, $latency_ms, $error)`)
      .run({
        $id: data.id,
        $source: data.source,
        $tool_name: data.tool_name,
        $method: data.method,
        $url: data.url,
        $request_headers: data.request_headers,
        $request_body: data.request_body,
        $status_code: data.status_code,
        $response_headers: data.response_headers,
        $response_body: data.response_body,
        $latency_ms: data.latency_ms,
        $error: data.error,
      }),

  clearLogs: () => db.query('DELETE FROM request_logs').run(),

  getRules: (): InterceptRuleRow[] =>
    db.query('SELECT * FROM intercept_rules ORDER BY sort_order, created_at').all() as InterceptRuleRow[],

  insertRule: (rule: Omit<InterceptRuleRow, 'created_at'>) =>
    db.query(`INSERT INTO intercept_rules (id,enabled,name,sort_order,match_path,match_method,target_host,strip_prefix,add_prefix,add_headers)
      VALUES ($id,$enabled,$name,$sort_order,$match_path,$match_method,$target_host,$strip_prefix,$add_prefix,$add_headers)`)
      .run({ $id: rule.id, $enabled: rule.enabled, $name: rule.name, $sort_order: rule.sort_order,
        $match_path: rule.match_path, $match_method: rule.match_method, $target_host: rule.target_host,
        $strip_prefix: rule.strip_prefix, $add_prefix: rule.add_prefix, $add_headers: rule.add_headers }),

  updateRule: (id: string, patch: Partial<Omit<InterceptRuleRow, 'id' | 'created_at'>>) => {
    const cols = Object.keys(patch).map(k => `${k} = $${k}`).join(', ');
    const params: Record<string, string | number> = { $id: id };
    for (const [k, v] of Object.entries(patch)) params[`$${k}`] = v as string | number;
    db.query(`UPDATE intercept_rules SET ${cols} WHERE id = $id`).run(params);
  },

  deleteRule: (id: string) =>
    db.query('DELETE FROM intercept_rules WHERE id = ?').run(id),

  getSettings: (): { value: string } | null =>
    db.query<{ value: string }, []>("SELECT value FROM settings WHERE key='app' LIMIT 1").get() ?? null,

  setSettings: (value: Record<string, unknown>): void => {
    db.run(
      "INSERT INTO settings(key,value) VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify(value)],
    );
  },

  getProfiles: (): AuthProfileRow[] =>
    db.query('SELECT * FROM auth_profiles ORDER BY name COLLATE NOCASE').all() as AuthProfileRow[],

  getActiveProfile: (): AuthProfileRow | null =>
    db.query('SELECT * FROM auth_profiles WHERE is_active = 1 LIMIT 1').get() as AuthProfileRow | null,

  insertProfile: (p: Omit<AuthProfileRow, 'created_at'>) =>
    db.query(`INSERT INTO auth_profiles (id,name,description,type,config,token_cache,is_active)
      VALUES ($id,$name,$description,$type,$config,$token_cache,$is_active)`)
      .run({ $id: p.id, $name: p.name, $description: p.description, $type: p.type,
        $config: p.config, $token_cache: p.token_cache, $is_active: p.is_active }),

  updateProfile: (id: string, patch: Partial<Omit<AuthProfileRow, 'id' | 'created_at'>>) => {
    const cols = Object.keys(patch).map(k => `${k} = $${k}`).join(', ');
    const params: Record<string, string | number | null> = { $id: id };
    for (const [k, v] of Object.entries(patch)) params[`$${k}`] = v as string | number | null;
    db.query(`UPDATE auth_profiles SET ${cols} WHERE id = $id`).run(params);
  },

  deleteProfile: (id: string) =>
    db.query('DELETE FROM auth_profiles WHERE id = ?').run(id),

  activateProfile: (id: string) => {
    const profile = db.query('SELECT * FROM auth_profiles WHERE id = ?').get(id) as AuthProfileRow | null;
    if (!profile) return;
    db.query('UPDATE auth_profiles SET is_active = 0').run();
    db.query('UPDATE auth_profiles SET is_active = 1 WHERE id = ?').run(id);
    // Copy profile config to auth_config as the active auth
    db.query('INSERT OR REPLACE INTO auth_config (id, type, config) VALUES (1, $type, $config)')
      .run({ $type: profile.type, $config: profile.config });
  },
};

export { randomUUID };
