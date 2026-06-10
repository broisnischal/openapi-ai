#!/usr/bin/env bun
/**
 * wasper CLI
 *
 *   wasper [--url <spec>] [--port 3388]   start (foreground, auto-resumes last spec)
 *   wasper start --background              start in background
 *   wasper stop                            stop background server
 *   wasper status                          show server status
 *   wasper reload                          hot-reload spec
 *   wasper ls                              list saved specs
 *   wasper use <number|url>                start with a saved spec
 *   wasper rm  <number|url>                remove a spec from history
 *
 * Self-hosting:
 *   wasper start --origin https://agent.example.com --token <secret>
 *   (also via env: WASPER_HOST / _PORT / _ORIGIN / _TOKEN / _SPEC_URL)
 */

// Strip Node/Bun exec + script path, get the actual user args
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  const { VERSION } = await import('./src/version.ts');
  console.log(VERSION);
  process.exit(0);
}

// Determine subcommand — first non-flag arg
const subcommand = rawArgs.find(a => !a.startsWith('-')) ?? 'start';

switch (subcommand) {
  case 'stop':
    await import('./src/commands/stop.ts').then(m => m.run());
    break;

  case 'update':
    await import('./src/commands/update.ts').then(m => m.run());
    break;

  case 'status':
    await import('./src/commands/status.ts').then(m => m.run());
    break;

  case 'reload':
    await import('./src/commands/reload.ts').then(m => m.run());
    break;

  case 'ls':
  case 'list':
    await import('./src/commands/ls.ts').then(m => m.run());
    break;

  case 'use':
    await import('./src/commands/use.ts').then(m => m.run());
    break;

  case 'rm':
  case 'remove':
    await import('./src/commands/rm.ts').then(m => m.run());
    break;

  case 'start':
  default:
    await import('./src/commands/start.ts').then(m => m.run());
    break;
}
