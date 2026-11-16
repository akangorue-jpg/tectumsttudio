/**
 * Piezas compartidas entre pantallas: marca, estado y fila de proyecto, actividad.
 */
import type { ReactNode } from 'react';
import { LuBot, LuCircleAlert, LuCog, LuTriangleAlert, LuUser } from 'react-icons/lu';
import { categoryLabel } from '../../core/catalog';
import type { Activity, Project, ProjectStatus } from '../../core/types';
import { useT } from '../i18n';
import { formatDateTime, timeAgo } from '../lib/format';
import { Link } from '../lib/router';
import { StageMeter } from './StageTrack';
import { Badge, cn, type Tone } from './kit';

/** Isotipo: un techo (tectum, en latín) sobre su base. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
        <rect width="28" height="28" rx="7" className="fill-brand" />
        <path d="M6.5 15.5 14 8l7.5 7.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 20h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
      </svg>
      {!compact && (
        <span className="text-[15px] leading-none font-semibold tracking-[0.02em]">
          TECTUM <span className="font-normal text-muted">STUDIO</span>
          <span className="sr-only">{t.brand.name}</span>
        </span>
      )}
    </span>
  );
}

const STATUS_TONE: Record<ProjectStatus, Tone> = { borrador: 'neutral', en_desarrollo: 'brand', publicado: 'ok', pausado: 'warn', archivado: 'neutral' };

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const t = useT();
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {t.status[status]}
    </Badge>
  );
}

export function CategoryList({ project, max = 2 }: { project: Project; max?: number }) {
  const t = useT();
  if (project.categories.length === 0) return <span>{project.spec.unsure ? t.project.unsure : t.projects.noCategory}</span>;
  const rest = project.categories.length - max;
  return (
    <span>
      {project.categories.slice(0, max).map(categoryLabel).join(', ')}
      {rest > 0 && ` ${t.projects.more(rest)}`}
    </span>
  );
}

/** Fila de proyecto para listados: nombre, tipo, estado y etapa. */
export function ProjectRow({ project, trailing }: { project: Project; trailing?: ReactNode }) {
  const t = useT();
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/60">
      <Link to={`/proyectos/${project.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 outline-offset-4">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate font-medium text-ink group-hover:text-brand-ink">{project.name}</span>
          <span className="block truncate text-[13px] text-muted">
            <CategoryList project={project} /> · {t.projects.updated(timeAgo(project.updatedAt))}
          </span>
        </span>
        <StageMeter stage={project.stage} className="w-52 shrink-0" />
        <span className="w-28 shrink-0">
          <StatusBadge status={project.status} />
        </span>
      </Link>
      {trailing}
    </div>
  );
}

function ActivityIcon({ entry }: { entry: Activity }) {
  if (entry.level === 'error') return <LuCircleAlert className="size-4 text-danger-ink" />;
  if (entry.level === 'advertencia') return <LuTriangleAlert className="size-4 text-warn-ink" />;
  if (entry.actor === 'aura') return <LuBot className="size-4 text-brand-ink" />;
  if (entry.actor === 'sistema') return <LuCog className="size-4 text-teal-ink" />;
  return <LuUser className="size-4 text-muted" />;
}

export function ActivityList({ entries, showActor }: { entries: Activity[]; showActor?: boolean }) {
  const t = useT();
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 px-4 py-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle">
            <ActivityIcon entry={entry} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-snug break-words">{entry.summary}</p>
            <p className="mt-0.5 text-xs text-muted" title={formatDateTime(entry.createdAt)}>
              {showActor && `${t.history.actor[entry.actor]} · `}
              {timeAgo(entry.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
