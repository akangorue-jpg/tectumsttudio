/**
 * Enrutador mínimo. En el servidor usa la History API (URLs reales); en el modo demostración,
 * donde la página vive dentro de un marco aislado, mantiene la ruta en memoria.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

export type RouterMode = 'history' | 'memory';

interface RouterValue {
  path: string;
  mode: RouterMode;
  navigate(to: string, options?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue>({ path: '/', mode: 'memory', navigate: () => {} });
const MEMORY_KEY = 'tectum-studio-ruta';

function initialPath(mode: RouterMode): string {
  if (mode === 'history') return window.location.pathname || '/';
  try {
    return window.sessionStorage.getItem(MEMORY_KEY) || '/';
  } catch {
    return '/';
  }
}

export function RouterProvider({ mode, children }: { mode: RouterMode; children: ReactNode }) {
  const [path, setPath] = useState(() => initialPath(mode));

  useEffect(() => {
    if (mode !== 'history') return;
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mode]);

  const navigate = useCallback(
    (to: string, options: { replace?: boolean } = {}) => {
      if (mode === 'history') {
        if (options.replace) window.history.replaceState(null, '', to);
        else window.history.pushState(null, '', to);
      } else {
        try {
          window.sessionStorage.setItem(MEMORY_KEY, to);
        } catch {
          // La ruta queda sólo en memoria.
        }
      }
      setPath(to);
      document.getElementById('contenido')?.scrollTo({ top: 0 });
    },
    [mode],
  );

  const value = useMemo(() => ({ path, mode, navigate }), [path, mode, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

/** Compara una ruta con un patrón tipo "/proyectos/:id" y devuelve sus parámetros, o null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

export function Link({ to, className, children, onNavigate, title }: { to: string; className?: string; children: ReactNode; onNavigate?: () => void; title?: string }) {
  const { navigate, mode } = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate?.();
    navigate(to);
  };
  return (
    <a href={mode === 'history' ? to : '#'} onClick={onClick} className={className} title={title}>
      {children}
    </a>
  );
}
