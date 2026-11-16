import { useMemo, useState } from 'react';
import type { Activity } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { dayKey, formatDay } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { ActivityList } from '../ui/bits';
import { Card, ErrorBlock, LoadingBlock, PageHeader, Tabs } from '../ui/kit';

type Filter = 'all' | 'user' | 'agent' | 'alerts';

const matches = (entry: Activity, filter: Filter) =>
  filter === 'all' || (filter === 'user' && entry.actor === 'usuario') || (filter === 'agent' && entry.actor !== 'usuario') || (filter === 'alerts' && entry.level !== 'info');

export function HistoryPage() {
  const t = useT();
  const history = useAsync(() => api.get<{ activity: Activity[] }>('/api/activity', { limit: '200' }), []);
  const [filter, setFilter] = useState<Filter>('all');

  const days = useMemo(() => {
    const groups: { key: string; label: string; entries: Activity[] }[] = [];
    for (const entry of history.data?.activity ?? []) {
      if (!matches(entry, filter)) continue;
      const key = dayKey(entry.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(entry);
      else groups.push({ key, label: formatDay(entry.createdAt), entries: [entry] });
    }
    return groups;
  }, [history.data, filter]);

  if (history.loading && !history.data) return <LoadingBlock />;
  if (history.error) return <ErrorBlock message={history.error} onRetry={history.reload} />;
  const total = history.data?.activity.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.history.title} text={t.history.text} />
      <Tabs
        value={filter}
        onChange={(value) => setFilter(value)}
        tabs={(['all', 'user', 'agent', 'alerts'] as const).map((value) => ({ value, label: t.history.filters[value] }))}
      />
      {days.length === 0 ? (
        <Card>
          <p className="px-4 py-12 text-center text-muted">{total === 0 ? t.history.empty : t.history.emptyFiltered}</p>
        </Card>
      ) : (
        days.map((day) => (
          <section key={day.key}>
            <h2 className="mb-2 text-[13px] font-medium text-muted first-letter:uppercase">{day.label}</h2>
            <Card className="py-1.5">
              <ActivityList entries={day.entries} showActor />
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
