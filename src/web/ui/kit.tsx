/**
 * Componentes base de la interfaz (al estilo shadcn/ui: Tailwind + variantes, sin dependencias de runtime).
 */
import { clsx, type ClassValue } from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';
import { twMerge } from 'tailwind-merge';
import { useT } from '../i18n';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---------- Botones ----------

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-strong shadow-card',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle',
  soft: 'bg-brand-soft text-brand-ink hover:bg-brand-soft/70',
  ghost: 'text-muted hover:text-ink hover:bg-subtle',
  danger: 'bg-danger text-white hover:opacity-90',
} as const;
const BUTTON_SIZES = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:opacity-55',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- Formularios ----------

const CONTROL = 'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink transition-shadow focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-subtle disabled:text-muted';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-9', className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'py-2 leading-relaxed', className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-9 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-danger-ink">{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(value: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-subtle p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('rounded-[5px] px-2.5 py-1 text-[13px] transition-colors', value === option.value ? 'bg-surface font-medium text-ink shadow-card' : 'text-muted hover:text-ink')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Presentación ----------

const BADGE_TONES = {
  neutral: 'bg-subtle text-muted',
  brand: 'bg-brand-soft text-brand-ink',
  teal: 'bg-teal-soft text-teal-ink',
  ok: 'bg-ok-soft text-ok-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger-ink',
} as const;
export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', BADGE_TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-line bg-surface shadow-card', className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <LuLoaderCircle aria-hidden className={cn('size-5 animate-[spin-slow_0.8s_linear_infinite]', className)} />;
}

export function LoadingBlock({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-muted" role="status">
      <Spinner />
      <span>{label ?? t.common.loading}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center" role="alert">
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
        <LuTriangleAlert className="size-5" />
      </span>
      <div>
        <p className="font-medium">{t.common.loadError}</p>
        <p className="mt-0.5 text-muted">{message}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>{t.common.retry}</Button>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-ink [&>svg]:size-5">{icon}</span>}
      <div className="max-w-sm">
        <p className="font-medium">{title}</p>
        {text && <p className="mt-1 text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, className }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange(value: T): void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-5 overflow-x-auto border-b border-line', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm transition-colors', active ? 'border-brand font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cn('tabular rounded-full px-1.5 text-xs', active ? 'bg-brand-soft text-brand-ink' : 'bg-subtle text-muted')}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, text, actions }: { title: string; text?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
        {text && <p className="mt-1 max-w-[70ch] text-muted">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({ tone = 'brand', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', BADGE_TONES[tone], className)}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
