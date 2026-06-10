/**
 * Interactive REPL for wasper CLI.
 *
 * Features:
 *   - Bottom-pinned 2-line prompt (status bar + input) that never scrolls away
 *   - Inline ghost-text autocomplete (→ or Tab to accept)
 *   - Compact suggestion row above the input, updates as you type
 *   - Command history (↑ / ↓)
 *   - Ctrl+C quit  ·  Ctrl+L clear screen  ·  Ctrl+U clear line  ·  Ctrl+W delete word
 *   - Patches process.stdout.write so ALL output (console.log, log tail, etc.)
 *     automatically clears the prompt, writes, then redraws below.
 *   - Spinner-style '\r' overwrites are let through directly (they'll be cleaned
 *     up on the next full-line write that ends in '\n').
 */

import { paint, isTTY } from './ui';

// ── ANSI / visual-width helpers ───────────────────────────────────────────────

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

function visualRows(line: string, cols: number): number {
  const len = stripAnsi(line).length;
  if (len === 0) return 1;
  return Math.ceil(len / cols);
}

// ── Command / sub-command catalogue ──────────────────────────────────────────

interface Suggestion {
  value: string; // what to complete to (without leading /)
  label: string; // display text
  desc: string;  // short description shown in dropdown
}

const BASE: Suggestion[] = [
  { value: 'help',     label: 'help',     desc: 'Show all commands' },
  { value: 'status',   label: 'status',   desc: 'Show server status' },
  { value: 'reload',   label: 'reload',   desc: 'Hot-reload the spec' },
  { value: 'spec',     label: 'spec',     desc: 'Load a different spec' },
  { value: 'mcp',      label: 'mcp',      desc: 'Toggle MCP endpoint' },
  { value: 'proxy',    label: 'proxy',    desc: 'Toggle HTTP proxy' },
  { value: 'ai',       label: 'ai',       desc: 'Toggle AI chat' },
  { value: 'readonly', label: 'readonly', desc: 'Toggle read-only mode' },
  { value: 'auth',     label: 'auth',     desc: 'Manage auth roles' },
  { value: 'token',    label: 'token',    desc: 'Manage access token' },
  { value: 'tail',     label: 'tail',     desc: 'Live request log' },
  { value: 'open',     label: 'open',     desc: 'Open studio in browser' },
  { value: 'update',   label: 'update',   desc: 'Update wasper' },
  { value: 'quit',     label: 'quit',     desc: 'Quit' },
];

const SUB: Record<string, Suggestion[]> = {
  auth:     [
    { value: 'auth list', label: 'list', desc: 'List auth profiles' },
    { value: 'auth use ',  label: 'use',  desc: 'Switch active profile' },
    { value: 'auth none', label: 'none', desc: 'Disable auth' },
  ],
  mcp:      [{ value: 'mcp on', label: 'on', desc: '' }, { value: 'mcp off', label: 'off', desc: '' }],
  proxy:    [{ value: 'proxy on', label: 'on', desc: '' }, { value: 'proxy off', label: 'off', desc: '' }],
  ai:       [{ value: 'ai on', label: 'on', desc: '' }, { value: 'ai off', label: 'off', desc: '' }],
  readonly: [{ value: 'readonly on', label: 'on', desc: '' }, { value: 'readonly off', label: 'off', desc: '' }],
  token:    [{ value: 'token new', label: 'new', desc: 'Generate token' }, { value: 'token off', label: 'off', desc: 'Remove token' }],
  tail:     [{ value: 'tail on', label: 'on', desc: '' }, { value: 'tail off', label: 'off', desc: '' }],
};

// ── REPL class ────────────────────────────────────────────────────────────────

export class Repl {
  private buf = '';
  private history: string[] = [];
  private histIdx = -1;
  private savedBuf = '';
  private running = false;
  private statusText = '';
  private promptDrawn = false;
  private drawingPrompt = false;
  private promptVisualRows = 0;
  private onCmd: ((cmd: string) => Promise<void>) | null = null;
  private cols = process.stdout.columns || 80;
  private dynSuggestions: Suggestion[] = [];

  constructor() {
    if (isTTY) {
      process.stdout.on('resize', () => {
        this.cols = process.stdout.columns || 80;
        if (this.running) this.redraw();
      });
    }
  }

  /** Replace dynamic completions (e.g. auth profile names). */
  setDynamicSuggestions(items: Array<{ value: string; label: string; desc: string }>) {
    this.dynSuggestions = items;
    if (this.running) this.redraw();
  }

  /** Update the status bar text. Animates in-place; never triggers full redraw. */
  setStatus(text: string) {
    this.statusText = text;
    if (this.running) this.redraw();
  }

  /** Print a line above the prompt (safe from any context). */
  print(line: string) {
    process.stdout.write(line + '\n');
  }

  /** Start the REPL. Patches stdout and enters raw mode. */
  start(onCmd: (cmd: string) => Promise<void>) {
    this.onCmd = onCmd;
    this.running = true;

    if (!isTTY || !process.stdin.setRawMode) {
      this.startSimple(onCmd);
      return;
    }

    // ── Patch process.stdout.write ────────────────────────────────────────
    // Store the real write fn so both we and the Spinner can use it.
    const origWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write;
    const self = this;

    const patched: typeof process.stdout.write = function (chunk: any, enc?: any, cb?: any): boolean {
      // During our own drawing — bypass, write directly.
      if (self.drawingPrompt) return origWrite(chunk, enc, cb);

      // Spinner / same-line overwrite (\r but no \n): let it through directly.
      // The prompt is temporarily garbled but the next \n-terminated write will
      // trigger a clean clear + redraw.
      const str: string = typeof chunk === 'string' ? chunk
        : chunk instanceof Uint8Array ? new TextDecoder().decode(chunk)
        : String(chunk);
      const isSpinnerWrite = str.startsWith('\r') && !str.includes('\n');
      if (isSpinnerWrite || !self.promptDrawn) return origWrite(chunk, enc, cb);

      // Normal write: clear prompt → write → redraw.
      self.drawingPrompt = true;

      // Move to start of prompt area (account for visual row wrapping).
      for (let i = 0; i < self.promptVisualRows - 1; i++) origWrite('\x1B[A' as any);
      origWrite('\r\x1B[J' as any); // cursor to col 0 + clear to end of screen
      self.promptDrawn = false;

      const r = origWrite(chunk, enc, cb);

      // Ensure we're at the start of a fresh line before redrawing.
      if (!str.endsWith('\n')) origWrite('\n' as any);

      // Redraw the prompt.
      const lines = self.buildPromptLines();
      self.promptVisualRows = lines.reduce((sum, l) => sum + visualRows(l, self.cols), 0);
      origWrite(lines.join('\n') as any);
      self.promptDrawn = true;

      self.drawingPrompt = false;
      return r;
    };
    (patched as any).__orig = origWrite;
    process.stdout.write = patched;

    // ── Raw mode keyboard ─────────────────────────────────────────────────
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => {
      this.handleKey(key).catch(() => {});
    });

    this.drawPrompt();
  }

  /** Detach the REPL without quitting the process. */
  stop() {
    this.running = false;
    if (this.promptDrawn) this.clearPrompt();
    if ((process.stdout.write as any).__orig) {
      process.stdout.write = (process.stdout.write as any).__orig;
    }
    try {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch { /**/ }
  }

  // ── Suggestion helpers ──────────────────────────────────────────────────────

  private getSuggestions(): Suggestion[] {
    if (!this.buf.startsWith('/')) return [];
    const raw = this.buf.slice(1);
    if (!raw) return BASE.slice(0, 6);

    const parts = raw.split(' ');
    const base = parts[0] ?? '';

    // "auth use <partial>" → match dynamic profile names
    if (raw.startsWith('auth use ') && this.dynSuggestions.length) {
      const typed = raw.slice('auth use '.length);
      return this.dynSuggestions.filter(s =>
        s.label.toLowerCase().startsWith(typed.toLowerCase()),
      );
    }

    // Sub-command context: "/mcp <partial>"
    if (parts.length >= 2 && SUB[base]) {
      return (SUB[base] ?? []).filter(s => s.value.startsWith(raw));
    }

    // Base command matching
    return BASE.filter(c => c.value.startsWith(raw));
  }

  private getGhostText(): string {
    if (!this.buf.startsWith('/')) return '';
    const suggestions = this.getSuggestions();
    if (!suggestions.length) return '';
    const first = suggestions[0]!;
    const full = '/' + first.value;
    if (full === this.buf || !full.startsWith(this.buf)) return '';
    return full.slice(this.buf.length);
  }

  // ── Prompt rendering ────────────────────────────────────────────────────────

  private buildPromptLines(): string[] {
    const lines: string[] = [];
    const suggestions = this.getSuggestions();
    const DOT = paint.dim(' · ');

    // Suggestion row (only when actively typing a slash command)
    if (this.buf.startsWith('/') && suggestions.length > 0) {
      const items = suggestions.slice(0, 5);
      const row = items.map((s, i) => {
        const label = '/' + s.label;
        const desc = s.desc ? paint.dim('  ' + s.desc) : '';
        return i === 0 ? paint.cyan(label) + desc : paint.dim(label);
      }).join(DOT);
      lines.push(`  ${row}`);
    }

    // Status bar — strip ANSI before measuring visible width
    if (this.statusText) {
      const plain = stripAnsi(this.statusText);
      const truncated = plain.length > this.cols - 4
        ? plain.slice(0, this.cols - 7) + '…'
        : plain;
      lines.push(`  ${paint.dim(truncated)}`);
    }

    // Input line with ghost text
    const ghost = this.getGhostText();
    lines.push(`  ${paint.cyan('❯')} ${this.buf}${ghost ? paint.dim(ghost) : ''}`);

    return lines;
  }

  private clearPrompt() {
    if (!this.promptDrawn) return;
    this.drawingPrompt = true;
    for (let i = 0; i < this.promptVisualRows - 1; i++) process.stdout.write('\x1B[A');
    process.stdout.write('\r\x1B[J');
    this.promptDrawn = false;
    this.drawingPrompt = false;
  }

  private drawPrompt() {
    this.drawingPrompt = true;
    const lines = this.buildPromptLines();
    this.promptVisualRows = lines.reduce((sum, l) => sum + visualRows(l, this.cols), 0);
    process.stdout.write(lines.join('\n'));
    this.promptDrawn = true;
    this.drawingPrompt = false;
  }

  private redraw() {
    this.clearPrompt();
    this.drawPrompt();
  }

  // ── Keyboard handler ────────────────────────────────────────────────────────

  private async handleKey(key: string) {
    if (!this.running) return;

    // Ctrl+C / Ctrl+D — quit
    if (key === '\x03' || key === '\x04') {
      this.stop();
      process.emit('SIGINT');
      return;
    }

    // Ctrl+L — clear screen, redraw prompt at top
    if (key === '\x0C') {
      this.drawingPrompt = true;
      process.stdout.write('\x1B[2J\x1B[H');
      this.drawingPrompt = false;
      this.promptDrawn = false;
      this.drawPrompt();
      return;
    }

    // Ctrl+U — clear input
    if (key === '\x15') { this.buf = ''; this.redraw(); return; }

    // Ctrl+W — delete word
    if (key === '\x17') {
      this.buf = this.buf.replace(/\S+\s*$/, '');
      this.redraw();
      return;
    }

    // Escape sequences (arrows etc.)
    if (key.startsWith('\x1B')) {
      if (key === '\x1B') { this.buf = ''; this.redraw(); return; }      // plain Esc
      if (key === '\x1B[A') { this.historyUp(); return; }                 // ↑
      if (key === '\x1B[B') { this.historyDown(); return; }               // ↓
      if (key === '\x1B[C') {                                              // → accept ghost
        const g = this.getGhostText();
        if (g) {
          this.buf += g;
          // Add space when completing a base command that has sub-commands
          const raw = this.buf.slice(1);
          if (SUB[raw]) this.buf += ' ';
          this.redraw();
        }
        return;
      }
      return; // ignore other escape sequences
    }

    // Tab — complete / cycle
    if (key === '\t') {
      const g = this.getGhostText();
      if (g) {
        this.buf += g;
        const raw = this.buf.slice(1);
        if (SUB[raw]) this.buf += ' ';
      } else {
        const suggestions = this.getSuggestions();
        if (suggestions[0] && '/' + suggestions[0].value !== this.buf) {
          this.buf = '/' + suggestions[0].value;
        }
      }
      this.redraw();
      return;
    }

    // Backspace
    if (key === '\x7F' || key === '\b') {
      if (this.buf.length > 0) { this.buf = this.buf.slice(0, -1); this.redraw(); }
      return;
    }

    // Enter
    if (key === '\r' || key === '\n') {
      await this.submit();
      return;
    }

    // Single-key shortcuts (only when input buffer is empty)
    if (this.buf === '') {
      switch (key.toLowerCase()) {
        case 'r': await this.dispatchImmediate('r'); return;
        case 'b': await this.dispatchImmediate('b'); return;
        case 's': await this.dispatchImmediate('s'); return;
        case 'q': await this.dispatchImmediate('q'); return;
        case '?':
        case 'h': await this.dispatchImmediate('h'); return;
        case '/':
          this.buf = '/';
          this.redraw();
          return;
      }
    }

    // Printable characters
    const printable = key.replace(/[^\x20-\x7E]/g, '');
    if (printable) { this.buf += printable; this.redraw(); }
  }

  private async submit() {
    const cmd = this.buf.trim();
    this.buf = '';
    this.clearPrompt();
    process.stdout.write('\n');
    this.promptDrawn = false;

    if (cmd) {
      this.history.unshift(cmd);
      if (this.history.length > 200) this.history.pop();
      this.histIdx = -1;
      this.savedBuf = '';
      if (this.onCmd) await this.onCmd(cmd);
    }

    this.drawPrompt();
  }

  private async dispatchImmediate(key: string) {
    this.clearPrompt();
    process.stdout.write('\n');
    this.promptDrawn = false;
    if (this.onCmd) await this.onCmd(key);
    this.drawPrompt();
  }

  private historyUp() {
    if (!this.history.length) return;
    if (this.histIdx === -1) this.savedBuf = this.buf;
    this.histIdx = Math.min(this.histIdx + 1, this.history.length - 1);
    this.buf = this.history[this.histIdx] ?? '';
    this.redraw();
  }

  private historyDown() {
    if (this.histIdx === -1) return;
    this.histIdx--;
    this.buf = this.histIdx === -1 ? this.savedBuf : (this.history[this.histIdx] ?? '');
    this.redraw();
  }

  // ── Non-TTY fallback ────────────────────────────────────────────────────────

  private startSimple(onCmd: (cmd: string) => Promise<void>) {
    process.stdout.write('  ❯ ');
    process.stdin.setEncoding('utf8');
    let line = '';
    process.stdin.on('data', async (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r') {
          const cmd = line.trim();
          line = '';
          if (cmd) await onCmd(cmd);
          process.stdout.write('  ❯ ');
        } else {
          line += ch;
        }
      }
    });
  }
}
