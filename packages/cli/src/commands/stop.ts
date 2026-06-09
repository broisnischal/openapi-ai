import { readDaemonState, clearDaemonState, isProcessAlive } from '../daemon';
import { paint } from '../ui';

export async function run() {
  const state = await readDaemonState();

  if (!state) {
    console.log(`\n  ${paint.dim('○')}  ${paint.bold('OpenAPI Agent')}  ·  ${paint.yellow('No running instance found')}\n`);
    process.exit(1);
  }

  if (!isProcessAlive(state.pid)) {
    await clearDaemonState();
    console.log(`\n  ${paint.dim('○')}  Process ${state.pid} is no longer running. Cleaned up state.\n`);
    process.exit(0);
  }

  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    console.log(`\n  ${paint.red('✗')}  Failed to stop process ${state.pid}\n`);
    process.exit(1);
  }

  // Wait up to 3s for process to die
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(100);
    if (!isProcessAlive(state.pid)) break;
  }

  await clearDaemonState();
  console.log(`\n  ${paint.green('✓')}  ${paint.bold('Stopped OpenAPI Agent')}  ${paint.dim(`(was PID ${state.pid})`)}\n`);
}
