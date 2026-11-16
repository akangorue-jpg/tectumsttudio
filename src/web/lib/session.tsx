/**
 * Sesión de la interfaz: usuario actual, datos del entorno y estado de la IA.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Meta, ProviderView, User } from '../../core/types';
import { api, setUnauthenticatedHandler } from './api';

interface SessionValue {
  ready: boolean;
  meta: Meta | null;
  user: User | null;
  /** Proveedor con el que AURA genera hoy; null si usa el motor local. */
  ai: ProviderView | null;
  setUser(user: User | null): void;
  refreshAi(): Promise<void>;
  logout(): Promise<void>;
  /** Datos precargados al saltar del Dashboard al asistente de creación. */
  seed: { description: string; category: string | null } | null;
  setSeed(seed: SessionValue['seed']): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fuera de SessionProvider');
  return value;
}

/** El proveedor que se usa para generar: el principal conectado, o el primero disponible. */
export const activeProvider = (providers: ProviderView[]): ProviderView | null => {
  const usable = providers.filter((p) => p.connected && p.status === 'conectado');
  return usable.find((p) => p.primary) ?? usable[0] ?? null;
};

function applyTheme(theme: 'claro' | 'oscuro' | null) {
  const root = document.documentElement;
  const system = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', theme ? theme === 'oscuro' : system);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [ai, setAi] = useState<ProviderView | null>(null);
  const [seed, setSeed] = useState<SessionValue['seed']>(null);

  const refreshAi = useCallback(async () => {
    try {
      const { providers } = await api.get<{ providers: ProviderView[] }>('/api/providers');
      setAi(activeProvider(providers));
    } catch {
      setAi(null);
    }
  }, []);

  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    if (!next) setAi(null);
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => setUserState(null));
    let cancelled = false;
    (async () => {
      try {
        setMeta(await api.get<Meta>('/api/meta'));
      } catch {
        // Sin datos del entorno la interfaz igual puede mostrar el ingreso.
      }
      try {
        const { user: current } = await api.get<{ user: User }>('/api/auth/me');
        if (!cancelled) setUserState(current);
      } catch {
        if (!cancelled) setUserState(null);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(user?.theme ?? null);
  }, [user?.theme]);

  useEffect(() => {
    if (user) void refreshAi();
  }, [user?.id, refreshAi]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, [setUser]);

  const value = useMemo<SessionValue>(() => ({ ready, meta, user, ai, setUser, refreshAi, logout, seed, setSeed }), [ready, meta, user, ai, setUser, refreshAi, logout, seed]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
