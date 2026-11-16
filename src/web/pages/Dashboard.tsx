import { useMemo, useState, type FormEvent } from 'react';
import { LuArrowRight, LuBot, LuCodeXml, LuPlug, LuSparkles } from 'react-icons/lu';
import type { DashboardData, Project } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { formatCompact, formatDay, formatNumber, greeting } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link, useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { ActivityList, ProjectRow } from '../ui/bits';
import { Button, Card, ErrorBlock, LoadingBlock, Tabs, cn } from '../ui/kit';

type Tab = 'recent' | 'dev' | 'drafts' | 'published' | 'paused' | 'archived';
const TAB_STATUS: Record<Exclude<Tab, 'recent'>, Project['status']> = { dev: 'en_desarrollo', drafts: 'borrador', published: 'publicado', paused: 'pausado', archived: 'archivado' };

const QUICK: { key: 'app' | 'crm' | 'data' | 'api' | 'pm'; category: string }[] = [
  { key: 'app', category: 'aplicacion-personalizada' },
  { key: 'crm', category: 'crm' },
  { key: 'data', category: 'data-analytics' },
  { key: 'api', category: 'api-rest' },
  { key: 'pm', category: 'gestion-de-proyectos' },
];

function Composer() {
  const t = useT();
  const { setSeed } = useSession();
  const { navigate } = useRouter();
  const [description, setDescription] = useState('');

  const start = (category: string | null) => {
    setSeed({ description: description.trim(), category });
    navigate('/crear');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    start(null);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-line-strong bg-surface shadow-card transition-shadow focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
      <label htmlFor="composer" className="block px-5 pt-4 text-base font-semibold">
        {t.dashboard.composerTitle}
      </label>
      <textarea
        id="composer"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t.dashboard.composerPlaceholder}
        rows={3}
        maxLength={20000}
        className="block w-full resize-none bg-transparent px-5 pt-2 pb-3 text-[15px] leading-relaxed outline-none"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3 py-2.5">
        <span className="pl-2 text-[13px] text-muted">{t.dashboard.quickTitle}</span>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {QUICK.map((quick) => (
            <button key={quick.key} type="button" onClick={() => start(quick.category)} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-ink/85 transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink">
              {t.dashboard.quick[quick.key]}
            </button>
          ))}
        </div>
        <Button type="submit" variant="primary" icon={<LuSparkles className="size-4" />}>
          {t.dashboard.composerSubmit}
        </Button>
      </div>
    </form>
  );
}

function Kpi({ label, value, hint, muted }: { label: string; value: string; hint?: string; muted?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="truncate text-[13px] text-muted">{label}</p>
      <p className={cn('mt-0.5 truncate text-2xl leading-tight font-semibold tabular tracking-[-0.01em]', muted && 'text-muted')}>{value}</p>
      {hint && <p className="truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function DashboardPage() {
  const t = useT();
  const { user } = useSession();
  const dashboard = useAsync(() => api.get<DashboardData>('/api/dashboard'), []);
  const projects = useAsync(() => api.get<{ projects: Project[] }>('/api/projects'), []);
  const [tab, setTab] = useState<Tab>('recent');

  const visible = useMemo(() => {
    const all = projects.data?.projects ?? [];
    if (tab === 'recent') return all.filter((p) => p.status !== 'archivado').slice(0, 6);
    return all.filter((p) => p.status === TAB_STATUS[tab]).slice(0, 6);
  }, [projects.data, tab]);

  if (dashboard.loading && !dashboard.data) return <LoadingBlock />;
  if (dashboard.error || !dashboard.data) return <ErrorBlock message={dashboard.error ?? ''} onRetry={dashboard.reload} />;
  const { counts, activity, ai } = dashboard.data;
  const tokens = ai.usage ? ai.usage.inputTokens + ai.usage.outputTokens : 0;

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'recent', label: t.dashboard.tabs.recent },
    { value: 'dev', label: t.dashboard.tabs.dev, count: counts.activos },
    { value: 'drafts', label: t.dashboard.tabs.drafts, count: counts.borradores },
    { value: 'published', label: t.dashboard.tabs.published, count: counts.publicados },
    { value: 'paused', label: t.dashboard.tabs.paused, count: counts.pausados },
    { value: 'archived', label: t.dashboard.tabs.archived, count: counts.archivados },
  ];

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="text-[13px] text-muted first-letter:uppercase">{formatDay(Date.now())}</p>
        <h1 className="mt-0.5 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{t.dashboard.greeting(greeting(), user?.name.split(' ')[0] ?? '')}</h1>
        <p className="mt-1 text-muted">{counts.total === 0 ? t.dashboard.summaryEmpty : t.dashboard.summary(counts.activos, counts.borradores, counts.total)}</p>
      </header>

      <Composer />

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-5 [&>*]:bg-surface max-sm:[&>*:last-child]:col-span-2">
        <Kpi label={t.dashboard.kpi.total} value={formatNumber(counts.total)} />
        <Kpi label={t.dashboard.kpi.active} value={formatNumber(counts.activos)} />
        <Kpi label={t.dashboard.kpi.published} value={formatNumber(counts.publicados)} hint={`${t.dashboard.kpi.publishedHint} · ${t.common.phase(8)}`} muted={counts.publicados === 0} />
        <Kpi label={t.dashboard.kpi.versions} value={formatNumber(counts.versiones)} hint={t.dashboard.kpi.versionsHint} />
        <Kpi
          label={t.dashboard.kpi.ai}
          value={ai.usage ? formatCompact(tokens) : '—'}
          hint={ai.connected === 0 ? t.dashboard.kpi.aiNone : ai.usage ? t.dashboard.kpi.tokens : t.dashboard.kpi.aiUnused}
          muted={!ai.usage}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-base font-semibold">{t.dashboard.projectsTitle}</h2>
            <Link to="/proyectos" className="flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
              {t.common.viewAll} <LuArrowRight className="size-3.5" />
            </Link>
          </div>
          <Tabs value={tab} tabs={tabs} onChange={(value) => setTab(value)} className="mt-3" />
          <Card className="mt-3 divide-y divide-line overflow-hidden">
            {projects.loading && !projects.data ? (
              <LoadingBlock />
            ) : visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-muted">{counts.total === 0 ? t.dashboard.summaryEmpty : t.dashboard.emptyTab}</p>
            ) : (
              visible.map((project) => <ProjectRow key={project.id} project={project} />)
            )}
          </Card>
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section>
            <h2 className="text-base font-semibold">{t.dashboard.activityTitle}</h2>
            <Card className="mt-3 max-h-[420px] overflow-y-auto py-1.5">
              {activity.length === 0 ? <p className="px-4 py-8 text-center text-muted">{t.dashboard.activityEmpty}</p> : <ActivityList entries={activity} />}
            </Card>
          </section>

          <section>
            <h2 className="text-base font-semibold">{t.dashboard.aiTitle}</h2>
            <Card className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', ai.connected > 0 ? 'bg-teal' : 'bg-line-strong')} />
                <p className="text-[13.5px]">{ai.connected > 0 && ai.primaryLabel ? t.dashboard.aiConnected(ai.connected, ai.primaryLabel) : t.dashboard.aiNone}</p>
              </div>
              <Link to="/configuracion/proveedores" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
                {t.dashboard.aiManage} <LuArrowRight className="size-3.5" />
              </Link>
            </Card>
          </section>

          <section>
            <h2 className="text-base font-semibold">{t.dashboard.shortcutsTitle}</h2>
            <Card className="mt-3 divide-y divide-line overflow-hidden">
              {[
                { to: '/modulo/aura', icon: LuBot, label: t.dashboard.shortcuts.aura, phase: 5 },
                { to: '/modulo/code-editor', icon: LuCodeXml, label: t.dashboard.shortcuts.code, phase: 4 },
                { to: '/modulo/integraciones', icon: LuPlug, label: t.dashboard.shortcuts.integrations, phase: 6 },
              ].map((shortcut) => (
                <Link key={shortcut.to} to={shortcut.to} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-subtle/60">
                  <shortcut.icon className="size-4 text-muted" />
                  <span className="flex-1">{shortcut.label}</span>
                  <span className="rounded border border-line px-1 text-[10.5px] leading-4 text-muted">{t.common.phase(shortcut.phase)}</span>
                </Link>
              ))}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
