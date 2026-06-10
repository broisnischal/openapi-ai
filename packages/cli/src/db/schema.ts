export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS auth_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    type TEXT NOT NULL DEFAULT 'none',
    config TEXT NOT NULL DEFAULT '{}',
    token_cache TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'mcp',
    tool_name TEXT,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    request_headers TEXT,
    request_body TEXT,
    status_code INTEGER,
    response_headers TEXT,
    response_body TEXT,
    latency_ms INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_logs_created ON request_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS intercept_rules (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    match_path TEXT NOT NULL DEFAULT '',
    match_method TEXT NOT NULL DEFAULT '',
    target_host TEXT NOT NULL DEFAULT '',
    strip_prefix TEXT NOT NULL DEFAULT '',
    add_prefix TEXT NOT NULL DEFAULT '',
    add_headers TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_rules_order ON intercept_rules(sort_order, created_at);

  CREATE TABLE IF NOT EXISTS auth_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'none',
    config TEXT NOT NULL DEFAULT '{}',
    token_cache TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS saved_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Untitled',
    folder TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL DEFAULT '',
    headers TEXT NOT NULL DEFAULT '[]',
    params TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL DEFAULT '',
    body_type TEXT NOT NULL DEFAULT 'none',
    raw_type TEXT NOT NULL DEFAULT 'text/plain',
    form_rows TEXT NOT NULL DEFAULT '[]',
    auth TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_saved_folder ON saved_requests(folder, created_at DESC);

  CREATE TABLE IF NOT EXISTS spec_history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    version TEXT,
    endpoint_count INTEGER,
    last_used INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_spec_history_last_used ON spec_history(last_used DESC);

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Untitled Workflow',
    description TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows(updated_at DESC);

  CREATE TABLE IF NOT EXISTS capture_bins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`;
