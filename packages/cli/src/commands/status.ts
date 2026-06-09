import { readDaemonState, isProcessAlive } from '../daemon';
import { printStatus, paint } from '../ui';

export async function run() {
  const state = await readDaemonState();

  if (!state || !isProcessAlive(state.pid)) {
    printStatus({ running: false });
    process.exit(state ? 1 : 0);
  }

  // Query the live server for richer info
  interface SpecInfo { title: string; version: string; endpointCount: number; specUrl: string | null }
  let spec: SpecInfo | null = null;
  try {
    const res = await fetch(`http://localhost:${state.port}/api/server-info`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const info = await res.json() as { spec: SpecInfo | null };
      spec = info.spec;
    }
  } catch { /* server up but can't reach */ }

  printStatus({
    running: true,
    pid: state.pid,
    port: state.port,
    uptime: Date.now() - state.startedAt,
    specTitle: spec?.title ?? undefined,
    specVersion: spec?.version ?? undefined,
    endpointCount: spec?.endpointCount ?? undefined,
    specUrl: spec?.specUrl ?? undefined,
  });
}
