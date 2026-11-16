import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LuArrowLeft, LuArrowRight, LuBot, LuCircleCheck, LuCog, LuDownload, LuFileText, LuPaperclip, LuRefreshCw, LuSquarePen, LuTriangleAlert } from 'react-icons/lu';
import { categoryLabel } from '../../core/catalog';
import type { Activity, Blueprint, Project, ProjectDetail, ProjectSpec } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatBytes, formatDate, formatDateTime } from '../lib/format';
import { errorMessage, useAsync, useDismiss } from '../lib/hooks';
import { Link, useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { ProjectMenu } from '../ui/ProjectMenu';
import { StageTrack } from '../ui/StageTrack';
import { ActivityList, StatusBadge } from '../ui/bits';
import { Badge, Button, Card, EmptyState, ErrorBlock, IconButton, LoadingBlock, Notice, Select, Tabs, type Tone } from '../ui/kit';
import { ConfirmDialog, useToast } from '../ui/overlay';
import { BlueprintDocument } from './BlueprintDocument';

type Tab = 'overview' | 'blueprint' | 'activity';

// ---------- Resumen ----------

function configEntries(spec: ProjectSpec, s: ReturnType<typeof useT>['wizard']['step3']): [string, string][] {
  const needs = (value: ProjectSpec['needsAuth']) => (value === 'auto' ? '' : s.needs[value]);
  const entries: [string, string][] = [
    [s.audience, spec.audience],
    [s.approxUsers, spec.approxUsers],
    [s.roles, spec.roles.join(', ')],
    [s.main, spec.mainFeatures.join(' · ')],
    [s.secondary, spec.secondaryFeatures.join(' · ')],
    [s.integrations, spec.integrations.join(', ')],
    [s.needsAuth, needs(spec.needsAuth)],
    [s.needsApi, needs(spec.needsApi)],
    [s.needsDashboard, needs(spec.needsDashboard)],
    [s.needsExport, needs(spec.needsExport)],
    [s.appType, spec.appType],
    [s.tech, spec.techPrefs.join(', ')],
    [s.database, spec.database],
    [s.visual, spec.visualPrefs],
    [s.currency, spec.currency],
    [s.timezone, spec.timezone],
  ];
  return entries.filter(([, value]) => value.trim().length > 0);
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Overview({ detail, onOpenBlueprint }: { detail: ProjectDetail; onOpenBlueprint(): void }) {
  const t = useT();
  const p = t.project;
  const { navigate } = useRouter();
  const { meta } = useSession();
  const toast = useToast();
  const { project, attachments, blueprints } = detail;
  const next = p.next[project.stage];
  const config = configEntries(project.spec, t.wizard.step3);
  const current = blueprints.find((b) => b.status === 'aprobado') ?? blueprints[0];
  const technologies = current && project.stage === 'aprobado' ? current.content.tecnologias : [];

  const download = async (id: string) => {
    try {
      const response = await api.download(`/api/attachments/${id}/content`);
      if (!response.blob) return;
      const url = URL.createObjectURL(response.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.filename ?? 'archivo';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand/35 bg-brand-soft px-5 py-4">
          <div className="min-w-0 flex-1 basis-72">
            <p className="font-semibold text-brand-ink">{next.title}</p>
            <p className="mt-0.5 text-[13.5px] text-ink/80">{next.text}</p>
          </div>
          <Button variant="primary" onClick={() => (project.stage === 'blueprint' || project.stage === 'aprobado' ? onOpenBlueprint() : navigate(`/proyectos/${project.id}/especificacion`))}>
            {next.cta}
            <LuArrowRight className="size-4" />
          </Button>
        </div>

        <Panel
          title={p.description}
          action={
            <Link to={`/proyectos/${project.id}/especificacion`} className="flex items-center gap-1.5 text-[13px] font-medium text-brand-ink hover:underline">
              <LuSquarePen className="size-3.5" />
              {t.projects.actions.editSpec}
            </Link>
          }
        >
          {project.spec.description ? <p className="max-w-[75ch] leading-relaxed whitespace-pre-wrap">{project.spec.description}</p> : <p className="text-muted">{p.noDescription}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
            <span className="mr-1 text-[13px] text-muted">{p.categories}</span>
            {project.categories.length > 0 ? project.categories.map((id) => <Badge key={id}>{categoryLabel(id)}</Badge>) : <Badge>{project.spec.unsure ? p.unsure : t.projects.noCategory}</Badge>}
          </div>
        </Panel>

        <Panel title={p.config}>
          {config.length === 0 ? (
            <p className="text-muted">{p.configEmpty}</p>
          ) : (
            <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[200px_minmax(0,1fr)]">
              {config.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[13px] text-muted">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <Panel title={p.attachments}>
          {attachments.length === 0 ? (
            <p className="text-muted">{p.attachmentsEmpty}</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <LuPaperclip className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                  <span className="shrink-0 text-xs text-muted tabular">{formatBytes(attachment.size)}</span>
                  {meta?.mode !== 'demo' && (
                    <IconButton label={`${p.download} ${attachment.name}`} onClick={() => void download(attachment.id)} className="size-7">
                      <LuDownload className="size-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        <Panel title={p.info}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2.5 text-[13.5px]">
            <dt className="text-muted">{p.created}</dt>
            <dd>{formatDate(project.createdAt)}</dd>
            <dt className="text-muted">{p.updated}</dt>
            <dd>{formatDateTime(project.updatedAt)}</dd>
            <dt className="text-muted">{p.versions}</dt>
            <dd className="tabular">{blueprints.length}</dd>
            <dt className="text-muted">{p.repo}</dt>
            <dd className="text-muted">
              {p.repoNone} · {t.common.phase(6)}
            </dd>
          </dl>
        </Panel>
        <Panel title={p.technologies}>
          {technologies.length === 0 ? (
            <p className="text-muted">{p.technologiesEmpty}</p>
          ) : (
            <dl className="flex flex-col gap-2 text-[13.5px]">
              {technologies.map((tech) => (
                <div key={`${tech.capa}-${tech.tecnologia}`}>
                  <dt className="text-xs text-muted">{tech.capa}</dt>
                  <dd>{tech.tecnologia}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </aside>
    </div>
  );
}

// ---------- Blueprint ----------

const BLUEPRINT_TONE: Record<Blueprint['status'], Tone> = { borrador: 'warn', aprobado: 'ok', reemplazado: 'neutral' };

function RegenerateButton({ busy, onGenerate }: { busy: boolean; onGenerate(engine: 'auto' | 'local'): void }) {
  const t = useT();
  const { ai } = useSession();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const icon = <LuRefreshCw className="size-4" />;
  if (!ai) {
    return (
      <Button loading={busy} icon={icon} onClick={() => onGenerate('local')}>
        {busy ? t.blueprint.regenerating : t.blueprint.regenerate}
      </Button>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Button loading={busy} icon={icon} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {busy ? t.blueprint.regenerating : t.blueprint.regenerate}
      </Button>
      {open && (
        <div role="menu" className="absolute top-10 right-0 z-30 w-64 animate-[rise_0.12s_ease-out] rounded-lg border border-line bg-surface p-1 shadow-pop">
          {(
            [
              ['auto', t.blueprint.regenerateAi(ai.label), <LuBot key="i" />],
              ['local', t.blueprint.regenerateLocal, <LuCog key="i" />],
            ] as const
          ).map(([engine, label, itemIcon]) => (
            <button
              key={engine}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onGenerate(engine);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm hover:bg-subtle [&>svg]:size-4 [&>svg]:text-muted"
            >
              {itemIcon}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlueprintPanel({ detail, onDetail }: { detail: ProjectDetail; onDetail(detail: ProjectDetail): void }) {
  const t = useT();
  const b = t.blueprint;
  const toast = useToast();
  const { navigate } = useRouter();
  const { project, blueprints } = detail;
  const latest = blueprints[0];
  const [selectedId, setSelectedId] = useState<string | null>(latest?.id ?? null);
  const [busy, setBusy] = useState<'approve' | 'generate' | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => setSelectedId(latest?.id ?? null), [latest?.id]);
  const selected = blueprints.find((blueprint) => blueprint.id === selectedId) ?? latest;

  const editSpec = (
    <Button icon={<LuSquarePen className="size-4" />} onClick={() => navigate(`/proyectos/${project.id}/especificacion`)}>
      {b.editSpec}
    </Button>
  );

  if (!selected || !latest) {
    return (
      <Card>
        <EmptyState
          icon={<LuFileText />}
          title={b.emptyTitle}
          text={b.emptyText}
          action={
            <Button variant="primary" onClick={() => navigate(`/proyectos/${project.id}/especificacion`)}>
              {b.emptyCta}
            </Button>
          }
        />
      </Card>
    );
  }

  const generate = async (engine: 'auto' | 'local') => {
    setBusy('generate');
    try {
      const next = await api.post<ProjectDetail>(`/api/projects/${project.id}/blueprints`, { engine });
      onDetail(next);
      toast.ok(b.regenerated(next.blueprints[0]?.version ?? 0));
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const approve = async () => {
    setBusy('approve');
    try {
      onDetail(await api.post<ProjectDetail>(`/api/blueprints/${selected.id}/approve`));
      toast.ok(b.approved);
      setConfirm(false);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const isLatest = selected.id === latest.id;
  const stale = isLatest && project.specUpdatedAt > selected.createdAt;
  const source = selected.model ? `${b.source[selected.source]} · ${selected.model}` : b.source[selected.source];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{b.documentTitle}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{selected.content.resumen.nombre}</h2>
              <Badge tone={BLUEPRINT_TONE[selected.status]} dot>
                {b.status[selected.status]}
              </Badge>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {b.version(selected.version)} · {formatDateTime(selected.createdAt)} · {source}
              {selected.approvedAt ? ` · ${b.approvedOn(formatDate(selected.approvedAt))}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {blueprints.length > 1 && (
              <Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} aria-label={t.project.versions} className="w-auto">
                {blueprints.map((blueprint) => (
                  <option key={blueprint.id} value={blueprint.id}>
                    {b.versionOption(blueprint.version, b.status[blueprint.status])}
                  </option>
                ))}
              </Select>
            )}
            {editSpec}
            <RegenerateButton busy={busy === 'generate'} onGenerate={(engine) => void generate(engine)} />
            {isLatest && selected.status === 'borrador' && (
              <Button variant="primary" icon={<LuCircleCheck className="size-4" />} onClick={() => setConfirm(true)} disabled={busy !== null}>
                {b.approve}
              </Button>
            )}
          </div>
        </div>
        {selected.notes.map((note) => (
          <Notice key={note} tone="warn" icon={<LuTriangleAlert />}>
            {note}
          </Notice>
        ))}
        {stale && (
          <Notice tone="warn" icon={<LuTriangleAlert />}>
            {b.stale}
          </Notice>
        )}
        {!isLatest && <Notice tone="neutral">{b.notLatest(selected.version)}</Notice>}
        {isLatest && selected.status === 'aprobado' && (
          <Notice tone="ok" icon={<LuCircleCheck />}>
            {t.project.next.aprobado.text}
          </Notice>
        )}
      </Card>

      <BlueprintDocument content={selected.content} />

      <ConfirmDialog open={confirm} title={b.approveTitle} text={b.approveText} confirmLabel={b.approve} busy={busy === 'approve'} onConfirm={() => void approve()} onClose={() => setConfirm(false)} />
    </div>
  );
}

// ---------- Página ----------

export function ProjectDetailPage({ id, initialTab }: { id: string; initialTab?: Tab }) {
  const t = useT();
  const { navigate } = useRouter();
  const { refreshAi } = useSession();
  const detail = useAsync(() => api.get<ProjectDetail>(`/api/projects/${id}`), [id]);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const activity = useAsync(() => (tab === 'activity' ? api.get<{ activity: Activity[] }>(`/api/projects/${id}/activity`) : Promise.resolve({ activity: [] as Activity[] })), [id, tab, detail.data?.project.updatedAt]);

  useEffect(() => setTab(initialTab ?? 'overview'), [id, initialTab]);
  useEffect(() => {
    void refreshAi();
  }, [refreshAi]);

  const tabs = useMemo(
    () => [
      { value: 'overview' as Tab, label: t.project.tabs.overview },
      { value: 'blueprint' as Tab, label: t.project.tabs.blueprint, count: detail.data?.blueprints.length || undefined },
      { value: 'activity' as Tab, label: t.project.tabs.activity },
    ],
    [t, detail.data?.blueprints.length],
  );

  if (detail.loading && !detail.data) return <LoadingBlock />;
  if (detail.error || !detail.data) {
    return (
      <Card>
        <EmptyState
          title={t.project.notFoundTitle}
          text={detail.error ?? t.project.notFoundText}
          action={
            <Button onClick={() => navigate('/proyectos')} icon={<LuArrowLeft className="size-4" />}>
              {t.project.backToList}
            </Button>
          }
        />
      </Card>
    );
  }
  const { project } = detail.data;
  const setProject = (updated: Project) => detail.setData({ ...detail.data!, project: updated });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/proyectos" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <LuArrowLeft className="size-3.5" />
          {t.projects.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-[24px] leading-tight font-semibold tracking-[-0.02em] break-words">{project.name}</h1>
          <StatusBadge status={project.status} />
          <div className="flex-1" />
          <ProjectMenu project={project} onChanged={setProject} onDeleted={() => navigate('/proyectos')} />
        </div>
      </div>

      <Card className="overflow-x-auto px-3 py-5 sm:px-6">
        <StageTrack stage={project.stage} className="min-w-[560px]" />
      </Card>

      <Tabs value={tab} tabs={tabs} onChange={(value) => setTab(value)} />

      {tab === 'overview' && <Overview detail={detail.data} onOpenBlueprint={() => setTab('blueprint')} />}
      {tab === 'blueprint' && <BlueprintPanel detail={detail.data} onDetail={detail.setData} />}
      {tab === 'activity' && (
        <Card className="py-1.5">
          {activity.loading && !activity.data ? (
            <LoadingBlock />
          ) : activity.data && activity.data.activity.length > 0 ? (
            <ActivityList entries={activity.data.activity} showActor />
          ) : (
            <p className="px-4 py-10 text-center text-muted">{t.project.activityEmpty}</p>
          )}
        </Card>
      )}
    </div>
  );
}
