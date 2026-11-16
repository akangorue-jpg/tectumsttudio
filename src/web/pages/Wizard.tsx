/**
 * Asistente «Crear nuevo proyecto»: tipo de proyecto → descripción → configuración → interpretación.
 * El borrador se guarda en cada paso, así que se puede salir y retomar sin perder trabajo.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { LuArrowLeft, LuArrowRight, LuCheck, LuCircleHelp, LuInfo, LuPaperclip, LuSearch, LuSparkles, LuTrash2, LuUpload } from 'react-icons/lu';
import { CATALOG } from '../../core/catalog';
import { APPROX_USERS, emptySpec, type ProjectSpec, type TriState } from '../../core/schemas';
import type { Attachment, Interpretation, ProjectDetail } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { errorMessage } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { TagInput } from '../ui/TagInput';
import { Button, ErrorBlock, Field, IconButton, Input, LoadingBlock, Notice, Segmented, Select, Spinner, Textarea, cn } from '../ui/kit';
import { useToast } from '../ui/overlay';
import { InterpretationView } from './Interpretation';

const MAX_CATEGORIES = 6;
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

interface Form {
  name: string;
  categories: string[];
  spec: ProjectSpec;
}

function Stepper({ step, reached, onStep }: { step: number; reached: number; onStep(step: number): void }) {
  const t = useT();
  return (
    <ol className="flex gap-1.5 sm:gap-3">
      {t.wizard.steps.map((label, index) => {
        const state = index === step ? 'current' : index <= reached ? 'done' : 'pending';
        return (
          <li key={label} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={index > reached}
              onClick={() => onStep(index)}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex w-full flex-col gap-1.5 border-t-2 pt-2 text-left transition-colors', state === 'current' ? 'border-brand' : state === 'done' ? 'border-brand/40 hover:border-brand' : 'border-line')}
            >
              <span className={cn('flex items-center gap-1.5 text-xs tabular', state === 'pending' ? 'text-muted' : 'text-brand-ink')}>
                {state === 'done' ? <LuCheck className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className={cn('truncate text-[13px]', state === 'current' ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeading({ title, text }: { title: string; text?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      {text && <p className="mt-1 max-w-[68ch] text-muted">{text}</p>}
    </div>
  );
}

// ---------- Paso 1: tipo de proyecto ----------

function CategoryStep({ form, update }: { form: Form; update(patch: Partial<Form>): void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const groups = useMemo(() => CATALOG.map((group) => ({ ...group, items: group.items.filter((item) => !q || normalize(`${item.label} ${group.label}`).includes(q)) })).filter((group) => group.items.length > 0), [q]);
  const full = form.categories.length >= MAX_CATEGORIES;

  const toggle = (id: string) => {
    const selected = form.categories.includes(id);
    if (!selected && full) return;
    update({ categories: selected ? form.categories.filter((c) => c !== id) : [...form.categories, id], spec: { ...form.spec, unsure: false } });
  };
  const toggleUnsure = () => update({ categories: [], spec: { ...form.spec, unsure: !form.spec.unsure } });

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t.wizard.step1.title} text={t.wizard.step1.text} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.wizard.step1.search} aria-label={t.wizard.step1.search} className="pl-9" />
        </div>
        <span className="text-[13px] text-muted">{full ? t.wizard.step1.limit : t.wizard.step1.selected(form.categories.length)}</span>
      </div>

      <button
        type="button"
        aria-pressed={form.spec.unsure}
        onClick={toggleUnsure}
        className={cn('flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors', form.spec.unsure ? 'border-brand bg-brand-soft' : 'border-dashed border-line-strong hover:border-brand hover:bg-brand-soft/50')}
      >
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', form.spec.unsure ? 'bg-brand text-white' : 'bg-subtle text-muted')}>
          <LuCircleHelp className="size-[18px]" />
        </span>
        <span>
          <span className="block font-medium">{t.wizard.step1.unsureTitle}</span>
          <span className="block text-[13px] text-muted">{t.wizard.step1.unsureText}</span>
        </span>
      </button>

      {groups.length === 0 && <p className="py-6 text-center text-muted">{t.wizard.step1.noResults}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <h3 className="font-semibold">{group.label}</h3>
            <p className="text-[13px] text-muted">{group.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const selected = form.categories.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && full}
                    onClick={() => toggle(item.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[13px] transition-colors disabled:opacity-45',
                      selected ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface hover:border-brand hover:text-brand-ink',
                    )}
                  >
                    {selected && <LuCheck className="size-3.5" strokeWidth={3} />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Paso 2: descripción y adjuntos ----------

function Attachments({ attachments, uploading, onFiles, onRemove }: { attachments: Attachment[]; uploading: boolean; onFiles(files: File[]): void; onRemove(id: string): void }) {
  const t = useT();
  const { meta } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const mb = Math.round((meta?.limits.attachmentBytes ?? 15 * 1024 * 1024) / (1024 * 1024));

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <p className="text-[13px] font-medium">{t.wizard.step2.attachTitle}</p>
        <p className="text-[13px] text-muted">{t.wizard.step2.attachText(mb)}</p>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn('flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-lg border border-dashed px-4 py-5 text-[13.5px] transition-colors', over ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface')}
      >
        {uploading ? <Spinner className="size-4 text-muted" /> : <LuUpload className="size-4 text-muted" />}
        <span className="text-muted">{uploading ? t.wizard.step2.uploading : t.wizard.step2.attachDrop}</span>
        {!uploading && (
          <button type="button" onClick={() => input.current?.click()} className="font-medium text-brand-ink hover:underline">
            {t.wizard.step2.attachButton}
          </button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          accept=".pdf,.xlsx,.xls,.csv,.tsv,.json,.txt,.md,.docx,.doc,.pptx,.png,.jpg,.jpeg,.webp,.gif"
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {attachments.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3 px-3 py-2">
              <LuPaperclip className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{attachment.name}</span>
              <span className="shrink-0 text-xs text-muted tabular">{formatBytes(attachment.size)}</span>
              <IconButton label={t.common.remove(attachment.name)} onClick={() => onRemove(attachment.id)} className="size-7">
                <LuTrash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Notice tone="neutral" icon={<LuInfo />}>
        {t.wizard.step2.attachNote} {meta?.mode === 'demo' && t.wizard.step2.attachDemo}
      </Notice>
    </div>
  );
}

function DescriptionStep({ form, update, attachments }: { form: Form; update(patch: Partial<Form>): void; attachments: ReactNode }) {
  const t = useT();
  const words = form.spec.description.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t.wizard.step2.title} />
      <Field label={t.wizard.step2.nameLabel} htmlFor="wizard-name" className="max-w-xl">
        <Input id="wizard-name" value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder={t.wizard.step2.namePlaceholder} maxLength={120} />
      </Field>
      <Field
        label={t.wizard.step2.descLabel}
        htmlFor="wizard-description"
        hint={
          <span className="flex justify-between gap-4">
            <span>{t.wizard.step2.hint}</span>
            <span className="shrink-0 tabular">{t.wizard.step2.words(words)}</span>
          </span>
        }
      >
        <Textarea
          id="wizard-description"
          value={form.spec.description}
          onChange={(event) => update({ spec: { ...form.spec, description: event.target.value } })}
          placeholder={t.wizard.step2.placeholder}
          rows={9}
          maxLength={20000}
          className="min-h-48 resize-y text-[15px]"
          autoFocus
        />
      </Field>
      {attachments}
    </div>
  );
}

// ---------- Paso 3: configuración adicional ----------

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-line pt-5 md:grid-cols-[180px_minmax(0,1fr)]">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ConfigStep({ form, update }: { form: Form; update(patch: Partial<Form>): void }) {
  const t = useT();
  const s = t.wizard.step3;
  const spec = form.spec;
  const set = <K extends keyof ProjectSpec>(key: K, value: ProjectSpec[K]) => update({ spec: { ...spec, [key]: value } });
  const needs: { value: TriState; label: string }[] = [
    { value: 'auto', label: s.needs.auto },
    { value: 'si', label: s.needs.si },
    { value: 'no', label: s.needs.no },
  ];
  const zone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);
  const wide = 'sm:col-span-2';

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={s.title} text={s.text} />
      <Group title={s.groups.people}>
        <Field label={s.audience} htmlFor="cfg-audience" className={wide}>
          <Input id="cfg-audience" value={spec.audience} onChange={(e) => set('audience', e.target.value)} placeholder={s.audiencePh} maxLength={500} />
        </Field>
        <Field label={s.approxUsers} htmlFor="cfg-users">
          <Select id="cfg-users" value={spec.approxUsers} onChange={(e) => set('approxUsers', e.target.value as ProjectSpec['approxUsers'])}>
            {APPROX_USERS.map((value) => (
              <option key={value} value={value}>
                {value || s.approxUnknown}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.roles} htmlFor="cfg-roles" hint={s.tagHint}>
          <TagInput id="cfg-roles" values={spec.roles} onChange={(v) => set('roles', v)} max={20} maxLength={80} />
        </Field>
      </Group>
      <Group title={s.groups.features}>
        <Field label={s.main} htmlFor="cfg-main" hint={s.tagHint} className={wide}>
          <TagInput id="cfg-main" values={spec.mainFeatures} onChange={(v) => set('mainFeatures', v)} max={40} maxLength={200} />
        </Field>
        <Field label={s.secondary} htmlFor="cfg-secondary" hint={s.tagHint} className={wide}>
          <TagInput id="cfg-secondary" values={spec.secondaryFeatures} onChange={(v) => set('secondaryFeatures', v)} max={40} maxLength={200} />
        </Field>
        <Field label={s.integrations} htmlFor="cfg-integrations" hint={s.tagHint} className={wide}>
          <TagInput id="cfg-integrations" values={spec.integrations} onChange={(v) => set('integrations', v)} max={30} maxLength={80} />
        </Field>
        {(
          [
            ['needsAuth', s.needsAuth],
            ['needsApi', s.needsApi],
            ['needsDashboard', s.needsDashboard],
            ['needsExport', s.needsExport],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{label}</span>
            <Segmented label={label} value={spec[key]} options={needs} onChange={(value) => set(key, value)} />
          </div>
        ))}
      </Group>
      <Group title={s.groups.tech}>
        <Field label={s.appType} htmlFor="cfg-type">
          <Input id="cfg-type" value={spec.appType} onChange={(e) => set('appType', e.target.value)} placeholder={s.appTypePh} maxLength={200} />
        </Field>
        <Field label={s.database} htmlFor="cfg-db">
          <Input id="cfg-db" value={spec.database} onChange={(e) => set('database', e.target.value)} placeholder={s.databasePh} maxLength={60} />
        </Field>
        <Field label={s.tech} htmlFor="cfg-tech" hint={s.tagHint} className={wide}>
          <TagInput id="cfg-tech" values={spec.techPrefs} onChange={(v) => set('techPrefs', v)} max={20} maxLength={60} />
        </Field>
      </Group>
      <Group title={s.groups.look}>
        <Field label={s.visual} htmlFor="cfg-visual" className={wide}>
          <Textarea id="cfg-visual" value={spec.visualPrefs} onChange={(e) => set('visualPrefs', e.target.value)} placeholder={s.visualPh} rows={2} maxLength={1000} />
        </Field>
      </Group>
      <Group title={s.groups.region}>
        <Field label={s.language} htmlFor="cfg-language">
          <Select id="cfg-language" value={spec.language} onChange={(e) => set('language', e.target.value)}>
            {['Español', 'Inglés', 'Portugués'].map((language) => (
              <option key={language}>{language}</option>
            ))}
          </Select>
        </Field>
        <Field label={s.currency} htmlFor="cfg-currency">
          <Input id="cfg-currency" value={spec.currency} onChange={(e) => set('currency', e.target.value)} placeholder={s.currencyPh} maxLength={20} />
        </Field>
        <Field label={s.timezone} htmlFor="cfg-zone">
          <Input id="cfg-zone" value={spec.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder={zone} list="cfg-zones" maxLength={60} />
          <datalist id="cfg-zones">
            {[...new Set([zone, 'America/Asuncion', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/Mexico_City', 'America/Bogota', 'Europe/Madrid', 'UTC'])].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>
      </Group>
    </div>
  );
}

// ---------- Contenedor ----------

export function WizardPage({ projectId }: { projectId?: string }) {
  const t = useT();
  const toast = useToast();
  const { navigate } = useRouter();
  const { seed, setSeed, refreshAi } = useSession();

  const [id, setId] = useState<string | null>(projectId ?? null);
  const [form, setForm] = useState<Form>(() => ({
    name: '',
    categories: seed?.category ? [seed.category] : [],
    spec: { ...emptySpec(), description: seed?.description ?? '' },
  }));
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [loading, setLoading] = useState(!!projectId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const dirty = useRef(false);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (seed) setSeed(null);
    void refreshAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(async ({ project, attachments: files }) => {
        if (cancelled) return;
        setForm({ name: project.name === 'Proyecto sin título' ? '' : project.name, categories: project.categories, spec: project.spec });
        setAttachments(files);
        if (project.stage === 'interpretacion') {
          const result = await api.post<{ interpretation: Interpretation }>(`/api/projects/${projectId}/interpret`);
          if (cancelled) return;
          setInterpretation(result.interpretation);
          setStep(3);
          setReached(3);
        } else {
          const start = project.categories.length > 0 || project.spec.unsure || project.spec.description ? 1 : 0;
          setStep(start);
          setReached(project.spec.description ? 2 : start);
        }
      })
      .catch((cause: unknown) => !cancelled && setLoadError(errorMessage(cause)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const update = (patch: Partial<Form>) => {
    dirty.current = true;
    setStepError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  /** Guarda el borrador (lo crea si todavía no existe) y devuelve su id. */
  const save = async (current: Form = form): Promise<string> => {
    const payload = { categories: current.categories, spec: current.spec, ...(current.name.trim() ? { name: current.name.trim() } : {}) };
    if (!idRef.current) {
      const detail = await api.post<ProjectDetail>('/api/projects', payload);
      setId(detail.project.id);
      idRef.current = detail.project.id;
    } else if (dirty.current) {
      await api.patch<ProjectDetail>(`/api/projects/${idRef.current}`, payload);
    }
    dirty.current = false;
    return idRef.current!;
  };

  const interpret = async (current: Form = form) => {
    const projectIdNow = await save(current);
    const result = await api.post<{ interpretation: Interpretation }>(`/api/projects/${projectIdNow}/interpret`);
    setInterpretation(result.interpretation);
  };

  const guard = async (action: () => Promise<void>) => {
    setBusy(true);
    setStepError(null);
    try {
      await action();
    } catch (cause) {
      setStepError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const goTo = (target: number) => {
    setStep(target);
    setReached((value) => Math.max(value, target));
    document.getElementById('contenido')?.scrollTo({ top: 0 });
  };
  const hasInput = form.spec.description.trim().length > 0 || form.categories.length > 0;

  const next = () =>
    guard(async () => {
      if (step >= 1 && !hasInput) {
        setStepError(t.wizard.step2.needInput);
        return;
      }
      if (step === 2) {
        await interpret();
        goTo(3);
        return;
      }
      await save();
      goTo(step + 1);
    });

  const skipToInterpretation = () =>
    guard(async () => {
      if (!hasInput) {
        setStepError(t.wizard.step2.needInput);
        return;
      }
      await interpret();
      goTo(3);
    });

  const saveAndExit = () =>
    guard(async () => {
      const saved = await save();
      toast.ok(t.wizard.saved);
      navigate(`/proyectos/${saved}`);
    });

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const projectIdNow = await save();
      for (const file of files) {
        const { attachment } = await api.upload<{ attachment: Attachment }>(`/api/projects/${projectIdNow}/attachments`, file.name, file);
        setAttachments((list) => [...list, attachment]);
      }
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  };
  const removeAttachment = async (attachmentId: string) => {
    try {
      await api.del(`/api/attachments/${attachmentId}`);
      setAttachments((list) => list.filter((a) => a.id !== attachmentId));
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  };

  const updateInterpretation = (patch: Partial<Form>) =>
    guard(async () => {
      const merged = { ...form, ...patch };
      dirty.current = true;
      setForm(merged);
      await interpret(merged);
    });

  const generate = async () => {
    setGenerating(true);
    await guard(async () => {
      const projectIdNow = await save();
      await api.post<ProjectDetail>(`/api/projects/${projectIdNow}/blueprints`, {});
      navigate(`/proyectos/${projectIdNow}/blueprint`);
    });
    setGenerating(false);
  };

  if (loading) return <LoadingBlock />;
  if (loadError) return <ErrorBlock message={loadError} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">{projectId ? t.wizard.editTitle : t.wizard.title}</h1>
        {(id || hasInput) && (
          <Button variant="ghost" size="sm" onClick={() => void saveAndExit()} disabled={busy}>
            {t.wizard.saveExit}
          </Button>
        )}
      </div>
      <Stepper step={step} reached={reached} onStep={(target) => (target === 3 && (!interpretation || dirty.current) ? void skipToInterpretation() : goTo(target))} />

      <div className="min-h-64">
        {step === 0 && <CategoryStep form={form} update={update} />}
        {step === 1 && <DescriptionStep form={form} update={update} attachments={<Attachments attachments={attachments} uploading={uploading} onFiles={(files) => void upload(files)} onRemove={(attachmentId) => void removeAttachment(attachmentId)} />} />}
        {step === 2 && <ConfigStep form={form} update={update} />}
        {step === 3 &&
          (interpretation ? (
            <InterpretationView interpretation={interpretation} categories={form.categories} answers={form.spec.answers} busy={busy} onAnswers={(answers) => void updateInterpretation({ spec: { ...form.spec, answers } })} onAddCategory={(category) => void updateInterpretation({ categories: [...form.categories, category], spec: { ...form.spec, unsure: false } })} />
          ) : (
            <LoadingBlock label={t.wizard.step4.loading} />
          ))}
      </div>

      {stepError && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
          {stepError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button onClick={() => (step === 0 ? navigate(id ? `/proyectos/${id}` : '/') : goTo(step - 1))} disabled={busy} icon={<LuArrowLeft className="size-4" />}>
          {step === 0 ? t.common.cancel : t.common.back}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {step === 1 && (
            <Button variant="ghost" onClick={() => void skipToInterpretation()} disabled={busy}>
              {t.wizard.skipConfig}
            </Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={() => void next()} loading={busy}>
              {step === 2 ? t.wizard.interpret : t.common.continue}
              {!busy && <LuArrowRight className="size-4" />}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => void generate()} loading={busy} disabled={!interpretation} icon={<LuSparkles className="size-4" />}>
              {generating ? t.wizard.step4.generating : t.wizard.step4.generate}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
