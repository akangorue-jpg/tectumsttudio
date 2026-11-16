import { useState, type KeyboardEvent } from 'react';
import { LuX } from 'react-icons/lu';
import { useT } from '../i18n';
import { cn } from './kit';

/** Lista editable de valores cortos (roles, funcionalidades, integraciones…). */
export function TagInput({ id, values, onChange, placeholder, max = 30, maxLength = 120 }: { id: string; values: string[]; onChange(values: string[]): void; placeholder?: string; max?: number; maxLength?: number }) {
  const t = useT();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim().replace(/,$/, '').trim();
    setDraft('');
    if (!value || values.length >= max) return;
    if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={cn('flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-1.5 py-1 transition-shadow focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15')}>
      {values.map((value) => (
        <span key={value} className="inline-flex max-w-full items-center gap-1 rounded bg-subtle py-0.5 pr-1 pl-2 text-[13px]">
          <span className="truncate">{value}</span>
          <button type="button" aria-label={t.common.remove(value)} onClick={() => onChange(values.filter((v) => v !== value))} className="rounded p-0.5 text-muted hover:bg-line hover:text-ink">
            <LuX className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : undefined}
        className="h-6 min-w-32 flex-1 bg-transparent px-1.5 text-sm outline-none"
      />
    </div>
  );
}
