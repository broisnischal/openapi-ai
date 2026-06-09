#!/usr/bin/env bun
/**
 * openapi-agent CLI
 *
 *   openapi-agent [--url <spec>] [--port 3388]   start (foreground)
 *   openapi-agent start --background              start in background
 *   openapi-agent stop                            stop background server
 *   openapi-agent status                          show server status
 *   openapi-agent reload                          hot-reload spec
 */

// Strip Node/Bun exec + script path, get the actual user args
const rawArgs = process.argv.slice(2);

// Determine subcommand — first non-flag arg
const subcommand = rawArgs.find(a => !a.startsWith('-')) ?? 'start';

switch (subcommand) {
  case 'stop':
    await import('./src/commands/stop.ts').then(m => m.run());
    break;

  case 'status':
    await import('./src/commands/status.ts').then(m => m.run());
    break;

  case 'reload':
    await import('./src/commands/reload.ts').then(m => m.run());
    break;

  case 'start':
  default:
    await import('./src/commands/start.ts').then(m => m.run());
    break;
}
