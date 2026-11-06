import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me } from '../../shared/types';

// Refreshing the page (F5) logs you out, like in the original version. Set to false to disable.
const LOGOUT_ON_RELOAD = true;

interface AuthValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (m: Me | null) => void;
}
const AuthCtx = createContext<AuthValue>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>('/api/me')); } catch { setMe(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (LOGOUT_ON_RELOAD && nav?.type === 'reload') { try { await api('/api/logout', 'POST'); } catch { /* ignore */ } }
      await refresh();
    })();
  }, [refresh]);

  return <AuthCtx.Provider value={{ me, loading, refresh, setMe }}>{children}</AuthCtx.Provider>;
}
