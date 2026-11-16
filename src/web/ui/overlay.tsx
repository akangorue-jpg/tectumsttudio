import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCircleCheck, LuCircleAlert, LuX } from 'react-icons/lu';
import { useT } from '../i18n';
import { Button, IconButton, cn } from './kit';

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }: { open: boolean; onClose(): void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select');
    (focusable ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center dark:bg-black/60" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cn('w-full animate-[rise_0.16s_ease-out] rounded-xl border border-line bg-surface shadow-pop outline-none', width)}>
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label={t.common.close} onClick={onClose} className="-mt-1 -mr-2">
            <LuX className="size-4" />
          </IconButton>
        </div>
        <div className="px-5 pt-2 pb-5 text-muted">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm(): void; onClose(): void }) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}

// ---------- Avisos (toasts) ----------

interface Toast {
  id: number;
  tone: 'ok' | 'error';
  message: string;
}
interface ToastApi {
  ok(message: string): void;
  error(message: string): void;
}
const ToastContext = createContext<ToastApi>({ ok: () => {}, error: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  const value = useMemo<ToastApi>(() => ({ ok: (message) => push('ok', message), error: (message) => push('error', message) }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex max-w-md animate-[rise_0.18s_ease-out] items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 shadow-pop" role={toast.tone === 'error' ? 'alert' : 'status'}>
            {toast.tone === 'ok' ? <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-ok-ink" /> : <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-danger-ink" />}
            <span className="text-sm">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
