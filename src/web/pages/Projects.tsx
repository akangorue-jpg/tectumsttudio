import { useMemo, useState } from 'react';
import { LuFolderPlus, LuPlus, LuSearch } from 'react-icons/lu';
import { categoryLabel } from '../../core/catalog';
import type { Project, ProjectStatus } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { ProjectMenu } from '../ui/ProjectMenu';
import { ProjectRow } from '../ui/bits';
import { Button, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Tabs } from '../ui/kit';

type Filter = 'todos' | ProjectStatus;
const FILTERS: ProjectStatus[] = ['en_desarrollo', 'borrador', 'publicado', 'pausado', 'archivado'];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function ProjectsPage() {
  const t = useT();
  const { navigate } = useRouter();
  const list = useAsync(() => api.get<{ projects: Project[] }>('/api/projects'), []);
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');

  const projects = list.data?.projects ?? [];
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return projects.filter((project) => {
      if (filter !== 'todos' && project.status !== filter) return false;
      if (!q) return true;
      return normalize([project.name, ...project.categories.map(categoryLabel)].join(' ')).includes(q);
    });
  }, [projects, filter, query]);

  const replace = (updated: Project) => list.setData({ projects: projects.map((p) => (p.id === updated.id ? updated : p)) });
  const remove = (id: string) => list.setData({ projects: projects.filter((p) => p.id !== id) });
  const createButton = (
    <Button variant="primary" icon={<LuPlus className="size-4" />} onClick={() => navigate('/crear')}>
      {t.nav.create}
    </Button>
  );

  if (list.loading && !list.data) return <LoadingBlock />;
  if (list.error) return <ErrorBlock message={list.error} onRetry={list.reload} />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.projects.title} text={t.projects.count(projects.length)} actions={createButton} />

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={<LuFolderPlus />} title={t.projects.emptyTitle} text={t.projects.emptyText} action={createButton} />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <Tabs
              value={filter}
              onChange={(value) => setFilter(value)}
              className="min-w-0 flex-1"
              tabs={[
                { value: 'todos' as Filter, label: t.projects.all, count: projects.length },
                ...FILTERS.map((status) => ({ value: status as Filter, label: t.status[status], count: projects.filter((p) => p.status === status).length })),
              ]}
            />
            <div className="relative w-full sm:w-72">
              <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.projects.searchPlaceholder} aria-label={t.projects.searchPlaceholder} className="pl-9" />
            </div>
          </div>
          <Card className="divide-y divide-line">
            {visible.length === 0 ? (
              <p className="px-4 py-12 text-center text-muted">{t.projects.emptyFiltered}</p>
            ) : (
              visible.map((project) => <ProjectRow key={project.id} project={project} trailing={<ProjectMenu project={project} onChanged={replace} onDeleted={() => remove(project.id)} />} />)
            )}
          </Card>
        </>
      )}
    </div>
  );
}
