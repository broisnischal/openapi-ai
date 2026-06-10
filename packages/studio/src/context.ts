import { createContext, useContext } from 'react';
import type { Environment } from './lib/env';

export interface Features {
  mcp: boolean;
  proxy: boolean;
  ai: boolean;
  readonly: boolean;
}

interface AppCtx {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
  connected: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  envs: Environment[];
  activeEnvId: string | null;
  setActiveEnvId: (id: string | null) => void;
  reloadEnvs: () => void;
  features: Features;
  setFeatures: (f: Features) => void;
  wsConnected: boolean;
}

const DEFAULT_FEATURES: Features = { mcp: true, proxy: true, ai: true, readonly: false };

export const AppContext = createContext<AppCtx>({
  theme: 'dark', toggleTheme: () => {},
  cmdOpen: false, setCmdOpen: () => {},
  connected: false,
  sidebarCollapsed: false, toggleSidebar: () => {},
  envs: [], activeEnvId: null, setActiveEnvId: () => {}, reloadEnvs: () => {},
  features: DEFAULT_FEATURES, setFeatures: () => {},
  wsConnected: false,
});

export function useApp() { return useContext(AppContext); }
export { DEFAULT_FEATURES };
