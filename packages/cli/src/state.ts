import { fetchAndParseSpec, parseSpecText } from './openapi/parser';
import type { ParsedSpec, ParsedOperation } from './openapi/types';

export interface AppState {
  spec: ParsedSpec;
  operations: ParsedOperation[];
  specUrl?: string;
}

let _state: AppState | null = null;

export function hasState(): boolean {
  return _state !== null;
}

export function getState(): AppState {
  if (!_state) throw new Error('No spec loaded');
  return _state;
}

export async function loadSpec(url: string): Promise<AppState> {
  const spec = await fetchAndParseSpec(url);
  _state = { spec, operations: spec.operations, specUrl: url };
  return _state;
}

export function loadSpecFromText(text: string, filename?: string): AppState {
  const spec = parseSpecText(text, undefined, filename?.replace(/\.[^.]+$/, ''));
  _state = { spec, operations: spec.operations };
  return _state;
}
