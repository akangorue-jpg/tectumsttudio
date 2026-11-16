import { LuArrowRight, LuPlus, LuSparkles } from 'react-icons/lu';
import type { Project, ProjectStage } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Link, useRouter } from '../lib/router';
import { CategoryList } from '../ui/bits';
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '../ui/kit';

const STAGES: ProjectStage[] = ['especificacion', 'interpretacion', 'blueprint', 'aprobado'];

const target = (project: Project) => (project.stage === 'blueprint' || project.stage === 'aprobado' ? `/proyectos/${project.id}/blueprint` : `/proyectos/${project.id}/especificacion`);

export function BuilderPage() {
  const t = useT();
  const { navigate } = useRouter();
  const list = useAsync(() => api.get<{ projects: Project[] }>('/api/projects'), []);
  const createButton = (
    <Button variant="primary" icon={<LuPlus className="size-4" />} onClick={() => navigate('/crear')}>
      {t.nav.create}
    </Button>
  );

  if (list.loading && !list.data) return <LoadingBlock />;
  if (list.error) return <ErrorBlock message={list.error} onRetry={list.reload} />;
  const projects = (list.data?.projects ?? []).filter((p) => p.status !== 'archivado');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.builder.title} text={t.builder.text} actions={createButton} />

      <Card className="p-5">
        <h2 className="font-semibold">{t.builder.howTitle}</h2>
        <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {t.builder.how.map((step, index) => (
            <li key={step} className="flex gap-3 border-t-2 border-brand/30 pt-2.5">
              <span className="text-[13px] font-semibold text-brand-ink tabular">{index + 1}</span>
              <span className="text-[13.5px] leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={<LuSparkles />} title={t.builder.emptyTitle} text={t.builder.emptyText} action={createButton} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage) => {
            const column = t.builder.columns[stage];
            const items = projects.filter((p) => p.stage === stage);
            return (
              <section key={stage} className="flex min-w-0 flex-col gap-2.5">
                <h2 className="flex items-center justify-between text-[13px] font-medium text-muted">
                  {column.title}
                  <span className="rounded-full bg-subtle px-1.5 text-xs tabular">{items.length}</span>
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-muted">{column.empty}</p>
                ) : (
                  items.map((project) => (
                    <Card key={project.id} className="p-3.5">
                      <Link to={`/proyectos/${project.id}`} className="block truncate font-medium hover:text-brand-ink">
                        {project.name}
                      </Link>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        <CategoryList project={project} max={1} />
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">{timeAgo(project.updatedAt)}</span>
                        <Link to={target(project)} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
                          {column.cta} <LuArrowRight className="size-3.5" />
                        </Link>
                      </div>
                    </Card>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
