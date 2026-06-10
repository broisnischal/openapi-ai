import { join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';

const DIR = join(homedir(), '.wasper');
const STATE_FILE = join(DIR, 'server.json');

export interface DaemonState {
  pid: number;
  port: number;
  specUrl: string | null;
  startedAt: number;
  host?: string;
  origin?: string | null;
  token?: string | null;
}

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

export async function writeDaemonState(s: DaemonState): Promise<void> {
  await ensureDir();
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2), 'utf-8');
}

export async function readDaemonState(): Promise<DaemonState | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw) as DaemonState;
  } catch {
    return null;
  }
}

export async function clearDaemonState(): Promise<void> {
  try { await unlink(STATE_FILE); } catch { /* */ }
}

export function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export interface DaemonOptions {
  host?: string;
  origin?: string | null;
  token?: string | null;
  features?: { mcp: boolean; proxy: boolean; ai: boolean; readonly: boolean };
}

export async function spawnDaemon(specUrl: string | null, port: number, opts: DaemonOptions = {}): Promise<number> {
  // Build args for the detached child (same script, no --background flag)
  const args: string[] = [];
  if (specUrl) { args.push('--url', specUrl); }
  args.push('--port', String(port));
  if (opts.host)   args.push('--host', opts.host);
  if (opts.origin) args.push('--origin', opts.origin);
  if (opts.token)  args.push('--token', opts.token);
  if (opts.features) {
    if (!opts.features.mcp)   args.push('--no-mcp');
    if (!opts.features.proxy) args.push('--no-proxy');
    if (!opts.features.ai)    args.push('--no-ai');
    if (opts.features.readonly) args.push('--readonly');
  }
  args.push('--_daemon'); // internal: skip interactive keyboard

  const logDir = DIR;
  await ensureDir();
  const logPath = join(logDir, 'server.log');

  const child = Bun.spawn([process.execPath, Bun.main, ...args], {
    detached: true,
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', Bun.file(logPath), Bun.file(logPath)],
  });

  // Let parent exit without waiting for child
  child.unref();

  return child.pid;
}
