import pkg from '../package.json';

/** Single source of truth — package.json's version, embedded at build time. */
export const VERSION: string = (pkg as { version: string }).version;

export const PACKAGE_NAME = 'wasper';
export const REPO = 'broisnischal/wasper';

/** True when running as a `bun build --compile` standalone executable. */
export function isCompiledBinary(): boolean {
  // Compiled executables serve their modules from the embedded $bunfs filesystem
  return Bun.main.includes('$bunfs') || Bun.main.startsWith('B:~');
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
