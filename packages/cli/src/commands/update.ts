import { join } from 'path';
import { homedir } from 'os';
import { chmod, rename, unlink, mkdir, readFile, writeFile } from 'fs/promises';
import { VERSION, PACKAGE_NAME, REPO, isCompiledBinary, compareSemver } from '../version';
import { Spinner, paint } from '../ui';

const CHECK_FILE = join(homedir(), '.wasper', 'update-check.json');
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // once a day

interface CheckState { lastCheck: number; latest: string; }

// ─── Version lookup ───────────────────────────────────────────────────────────

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Throttled background check used by `start` — at most once per day.
 * Returns the newer version string when an update exists, else null.
 * Never throws, never blocks startup (callers fire-and-forget).
 */
export async function checkForUpdate(): Promise<string | null> {
  if (process.env.WASPER_NO_UPDATE_CHECK) return null;
  let state: CheckState | null = null;
  try { state = JSON.parse(await readFile(CHECK_FILE, 'utf-8')) as CheckState; } catch { /* first run */ }

  let latest = state?.latest ?? null;
  if (!state || Date.now() - state.lastCheck > CHECK_INTERVAL) {
    latest = await fetchLatestVersion();
    if (latest) {
      await mkdir(join(homedir(), '.wasper'), { recursive: true }).catch(() => {});
      await writeFile(CHECK_FILE, JSON.stringify({ lastCheck: Date.now(), latest }), 'utf-8').catch(() => {});
    }
  }

  if (latest && compareSemver(latest, VERSION) > 0) return latest;
  return null;
}

export function printUpdateNotice(latest: string) {
  console.log(`  ${paint.yellow('▲')}  Update available ${paint.dim(VERSION)} → ${paint.green(latest)}  ${paint.dim('·')}  run ${paint.bold('wasper update')}\n`);
}

// ─── Self-update ──────────────────────────────────────────────────────────────

function binaryAssetName(): string {
  const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `wasper-${os}-${arch}${os === 'windows' ? '.exe' : ''}`;
}

async function updateCompiledBinary(latest: string): Promise<void> {
  const exe = process.execPath;
  const asset = binaryAssetName();
  const url = `https://github.com/${REPO}/releases/download/v${latest}/${asset}`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}) — ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 1024 * 100) throw new Error('Downloaded file is suspiciously small — aborting');

  // The standard self-replace dance: write next to ourselves, swap via rename
  const tmp = `${exe}.update`;
  const old = `${exe}.old`;
  await Bun.write(tmp, bytes);
  await chmod(tmp, 0o755);
  await rename(exe, old);
  try {
    await rename(tmp, exe);
  } catch (e) {
    await rename(old, exe).catch(() => {}); // roll back
    throw e;
  }
  await unlink(old).catch(() => {}); // locked on Windows — cleaned up next run
}

async function updatePackageInstall(): Promise<void> {
  // Prefer bun, fall back to npm — whichever ecosystem installed us
  const tryRun = async (cmd: string[]) => {
    try {
      const p = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
      const code = await p.exited;
      return code === 0;
    } catch {
      return false;
    }
  };
  if (await tryRun(['bun', 'add', '-g', `${PACKAGE_NAME}@latest`])) return;
  if (await tryRun(['npm', 'install', '-g', `${PACKAGE_NAME}@latest`])) return;
  throw new Error('Neither `bun add -g` nor `npm install -g` succeeded. Update manually.');
}

export async function performUpdate(opts: { quiet?: boolean } = {}): Promise<boolean> {
  const spinner = new Spinner();
  if (!opts.quiet) spinner.start('Checking for updates…');

  const latest = await fetchLatestVersion();
  if (!latest) {
    spinner.stop('✗', 'Could not reach the npm registry', 'red');
    return false;
  }
  if (compareSemver(latest, VERSION) <= 0) {
    spinner.stop('✓', `Already up to date  ${paint.dim('v' + VERSION)}`, 'green');
    return false;
  }

  spinner.stop();
  if (!opts.quiet) spinner.start(`Updating ${paint.dim(VERSION)} → ${paint.green(latest)}…`);
  try {
    if (isCompiledBinary()) await updateCompiledBinary(latest);
    else await updatePackageInstall();
    spinner.stop('✓', `Updated to ${paint.bold('v' + latest)}  ${paint.dim('— restart any running servers to use it')}`, 'green');
    await writeFile(CHECK_FILE, JSON.stringify({ lastCheck: Date.now(), latest }), 'utf-8').catch(() => {});
    return true;
  } catch (e) {
    spinner.stop('✗', `Update failed: ${e instanceof Error ? e.message : String(e)}`, 'red');
    return false;
  }
}

export async function run() {
  console.log();
  await performUpdate();
  console.log();
}
