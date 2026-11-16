import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
  setData(next: T): void;
}

/** Carga datos al montar y cada vez que cambian las dependencias. Ignora respuestas obsoletas. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    load()
      .then((result) => {
        if (id !== request.current) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (id !== request.current) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload, setData };
}

export const errorMessage = (cause: unknown) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : 'Ocurrió un error inesperado.';

/** Cierra menús y popovers al hacer clic fuera o presionar Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}
