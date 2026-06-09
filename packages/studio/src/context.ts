import { createContext, useContext } from 'react';

interface AppCtx {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
  connected: boolean;
}

export const AppContext = createContext<AppCtx>({
  theme: 'dark', toggleTheme: () => {},
  cmdOpen: false, setCmdOpen: () => {},
  connected: false,
});

export function useApp() { return useContext(AppContext); }
