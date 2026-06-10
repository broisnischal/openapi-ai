#!/usr/bin/env bun
// Build standalone executables for every supported platform.
// Usage: bun scripts/build-binaries.ts [--current]   (--current = host platform only)

import { $ } from 'bun';
import { mkdirSync } from 'fs';
import pkg from '../package.json';

const ALL_TARGETS = [
  { target: 'bun-linux-x64', suffix: 'linux-x64' },
  { target: 'bun-linux-arm64', suffix: 'linux-arm64' },
  { target: 'bun-darwin-x64', suffix: 'darwin-x64' },
  { target: 'bun-darwin-arm64', suffix: 'darwin-arm64' },
  { target: 'bun-windows-x64', suffix: 'windows-x64.exe' },
];

const currentOnly = process.argv.includes('--current');
const targets = currentOnly
  ? ALL_TARGETS.filter(t => {
      const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      return t.suffix.startsWith(`${os}-${arch}`);
    })
  : ALL_TARGETS;

mkdirSync('dist/bin', { recursive: true });
console.log(`Building wasper v${pkg.version} → dist/bin/\n`);

for (const { target, suffix } of targets) {
  const out = `dist/bin/wasper-${suffix}`;
  console.log(`  ${target} → ${out}`);
  await $`bun build --compile --minify --target=${target} ./cli.ts --outfile ${out}`.quiet();
}

console.log(`\nDone. Upload these as GitHub release assets on tag v${pkg.version} —`);
console.log('the self-updater downloads them from releases/download/v<version>/<asset>.');
