/**
 * Página de un módulo que todavía no está habilitado. Dice con claridad qué falta,
 * en qué fase llega y qué se puede hacer hoy; no simula funcionalidad.
 */
import { LuCircleDashed, LuConstruction } from 'react-icons/lu';
import { useT, type ModuleSlug } from '../i18n';
import { Badge, Card, Notice, PageHeader } from '../ui/kit';

export function ModulePage({ slug }: { slug: ModuleSlug }) {
  const t = useT();
  const item = t.module.items[slug];
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={item.title} text={item.summary} actions={<Badge tone="warn">{t.module.status(item.phase)}</Badge>} />
      <Notice tone="neutral" icon={<LuConstruction />}>
        {t.module.honest}
      </Notice>
      <Card className="p-5">
        <h2 className="font-semibold">{t.module.planned}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {item.planned.map((entry) => (
            <li key={entry} className="flex gap-2.5 leading-snug">
              <LuCircleDashed className="mt-0.5 size-4 shrink-0 text-muted" />
              {entry}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">{t.module.today}</h2>
        <p className="mt-2 leading-relaxed">{item.today}</p>
      </Card>
    </div>
  );
}
