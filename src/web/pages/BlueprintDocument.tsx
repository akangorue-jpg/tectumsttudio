/**
 * Project Blueprint como documento técnico: 14 secciones con índice lateral.
 */
import type { ReactNode } from 'react';
import { LuCheck } from 'react-icons/lu';
import type { BlueprintContent } from '../../core/types';
import { useT } from '../i18n';
import { Badge, cn, type Tone } from '../ui/kit';

const PRIORITY_TONE: Record<string, Tone> = { esencial: 'brand', importante: 'teal', opcional: 'neutral' };
const IMPACT_TONE: Record<string, Tone> = { alto: 'danger', medio: 'warn', bajo: 'neutral' };

const SECTION_KEYS = ['descripcion', 'objetivos', 'arquitectura', 'modulos', 'funcionalidades', 'roles', 'datos', 'navegacion', 'tecnologias', 'integraciones', 'diseno', 'cronograma', 'riesgos', 'criterios'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

function Section({ id, number, title, children }: { id: SectionKey; number: number; title: string; children: ReactNode }) {
  return (
    <section id={`bp-${id}`} className="scroll-mt-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="flex items-baseline gap-3 text-[17px] font-semibold tracking-[-0.01em]">
        <span className="w-6 shrink-0 text-[13px] font-medium text-muted tabular">{String(number).padStart(2, '0')}</span>
        {title}
      </h3>
      <div className="mt-3 sm:pl-9">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="flex flex-col gap-1.5">
    {items.map((item) => (
      <li key={item} className="flex gap-2.5 leading-snug">
        <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="bg-subtle text-[12.5px] text-muted">
            {head.map((label) => (
              <th key={label} className="px-3 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}

const Sub = ({ children }: { children: ReactNode }) => <p className="mb-1.5 text-[13px] font-medium text-muted">{children}</p>;

/** Extrae la cantidad de semanas de una duración como "2 semanas" para dibujar el cronograma a escala. */
const weeksOf = (duration: string) => {
  const match = /(\d+(?:[.,]\d+)?)/.exec(duration);
  return match ? Math.max(0.5, Number(match[1]!.replace(',', '.'))) : 1;
};

export function BlueprintDocument({ content }: { content: BlueprintContent }) {
  const t = useT();
  const b = t.blueprint;
  const totalWeeks = content.cronograma.reduce((sum, stage) => sum + weeksOf(stage.duracionEstimada), 0);
  const features = content.modulos.flatMap((mod) => mod.funcionalidades.map((feature) => ({ feature, mod })));
  let offset = 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label={b.index} className="hidden lg:block">
        <div className="sticky top-4">
          <p className="mb-2 text-[13px] font-medium text-muted">{b.index}</p>
          <ol className="flex flex-col border-l border-line">
            {SECTION_KEYS.map((key, index) => (
              <li key={key}>
                <a
                  href={`#bp-${key}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(`bp-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="-ml-px flex gap-2 border-l border-transparent py-1 pl-3 text-[13px] text-muted transition-colors hover:border-brand hover:text-ink"
                >
                  <span className="tabular">{String(index + 1).padStart(2, '0')}</span>
                  {b.sections[key]}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="flex min-w-0 flex-col gap-6">
        <Section id="descripcion" number={1} title={b.sections.descripcion}>
          <p className="text-[13px] text-muted">{content.resumen.tipoSolucion}</p>
          <p className="mt-1.5 max-w-[75ch] leading-relaxed">{content.resumen.descripcionFuncional}</p>
        </Section>

        <Section id="objetivos" number={2} title={b.sections.objetivos}>
          <Bullets items={content.objetivos} />
        </Section>

        <Section id="arquitectura" number={3} title={b.sections.arquitectura}>
          <p className="font-medium">{content.arquitectura.estilo}</p>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <div>
              <Sub>{b.layers}</Sub>
              <ol className="flex flex-col gap-1.5">
                {content.arquitectura.capas.map((capa) => (
                  <li key={capa.nombre} className="rounded-md border border-line bg-surface px-3 py-2">
                    <p className="font-medium">{capa.nombre}</p>
                    <p className="text-[13px] text-muted">{capa.descripcion}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <Sub>{b.decisions}</Sub>
              <Bullets items={content.arquitectura.decisiones} />
            </div>
          </div>
        </Section>

        <Section id="modulos" number={4} title={b.sections.modulos}>
          <div className="grid gap-3 md:grid-cols-2">
            {content.modulos.map((mod) => (
              <div key={mod.nombre} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{mod.nombre}</p>
                  <div className="flex gap-1.5">
                    <Badge tone={PRIORITY_TONE[mod.prioridad]}>{b.priority[mod.prioridad]}</Badge>
                    {mod.origen === 'implicito' && <Badge>{b.origin.implicito}</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-[13px] text-muted">{mod.descripcion}</p>
                <p className="mt-2 text-xs text-muted">{b.featuresCount(mod.funcionalidades.length)}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="funcionalidades" number={5} title={b.sections.funcionalidades}>
          <Table head={[b.th.feature, b.th.module, b.th.priority, b.th.origin]}>
            {features.map(({ feature, mod }) => (
              <tr key={`${mod.nombre}-${feature}`}>
                <td>{feature}</td>
                <td className="text-muted">{mod.nombre}</td>
                <td>
                  <Badge tone={PRIORITY_TONE[mod.prioridad]}>{b.priority[mod.prioridad]}</Badge>
                </td>
                <td className="text-muted">{b.origin[mod.origen]}</td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section id="roles" number={6} title={b.sections.roles}>
          {content.rolesUsuarios.length === 0 ? (
            <p className="text-muted">{b.noRoles}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {content.rolesUsuarios.map((role) => (
                <div key={role.rol} className="rounded-lg border border-line bg-surface p-4">
                  <p className="font-semibold">{role.rol}</p>
                  <p className="text-[13px] text-muted">{role.descripcion}</p>
                  {role.permisos.length > 0 && (
                    <ul className="mt-2.5 flex flex-col gap-1 text-[13.5px]">
                      {role.permisos.map((permiso) => (
                        <li key={permiso} className="flex gap-2">
                          <LuCheck className="mt-1 size-3.5 shrink-0 text-teal-ink" />
                          {permiso}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section id="datos" number={7} title={b.sections.datos}>
          {content.modeloDatos.length === 0 ? (
            <p className="text-muted">{b.noEntities}</p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {content.modeloDatos.map((entity) => (
                <div key={entity.entidad} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="border-b border-line bg-subtle px-3.5 py-2">
                    <p className="font-mono text-[13.5px] font-medium">{entity.entidad}</p>
                    <p className="text-[13px] text-muted">{entity.descripcion}</p>
                  </div>
                  <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-3.5 py-2 font-mono text-[12.5px] leading-6">
                    {entity.campos.map((campo) => (
                      <div key={campo.nombre} className="contents">
                        <dt className="truncate">{campo.nombre}</dt>
                        <dd className="text-muted">{campo.tipo}</dd>
                      </div>
                    ))}
                  </dl>
                  {entity.relaciones.length > 0 && (
                    <p className="border-t border-line px-3.5 py-2 text-[13px] text-muted">
                      <span className="font-medium">{b.relations}:</span> {entity.relaciones.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section id="navegacion" number={8} title={b.sections.navegacion}>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {content.navegacion.map((group) => (
              <div key={group.seccion}>
                <p className="font-medium">{group.seccion}</p>
                <ul className="mt-1.5 flex flex-col border-l border-line-strong">
                  {group.pantallas.map((screen) => (
                    <li key={screen} className="py-0.5 pl-3 text-[13.5px] text-muted">
                      {screen}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="tecnologias" number={9} title={b.sections.tecnologias}>
          <Table head={[b.th.layer, b.th.technology, b.th.reason]}>
            {content.tecnologias.map((tech) => (
              <tr key={`${tech.capa}-${tech.tecnologia}`}>
                <td className="whitespace-nowrap text-muted">{tech.capa}</td>
                <td className="font-medium">{tech.tecnologia}</td>
                <td className="text-muted">{tech.motivo}</td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section id="integraciones" number={10} title={b.sections.integraciones}>
          {content.integraciones.length === 0 ? (
            <p className="text-muted">{b.noIntegrations}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {content.integraciones.map((integration) => (
                <li key={integration.nombre} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{integration.nombre}</p>
                    <p className="text-[13px] text-muted">{integration.proposito}</p>
                  </div>
                  <Badge tone={integration.estado === 'requerida' ? 'brand' : 'neutral'}>{b.integration[integration.estado]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="diseno" number={11} title={b.sections.diseno}>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[110px_minmax(0,1fr)]">
            <dt className="text-[13px] text-muted">{b.style}</dt>
            <dd>{content.diseno.estilo}</dd>
            <dt className="text-[13px] text-muted">{b.palette}</dt>
            <dd>{content.diseno.paleta}</dd>
            <dt className="text-[13px] text-muted">{b.guidelines}</dt>
            <dd>
              <Bullets items={content.diseno.lineamientos} />
            </dd>
          </dl>
        </Section>

        <Section id="cronograma" number={12} title={b.sections.cronograma}>
          <ol className="flex flex-col gap-3">
            {content.cronograma.map((stage, index) => {
              const span = weeksOf(stage.duracionEstimada);
              const left = (offset / totalWeeks) * 100;
              const width = (span / totalWeeks) * 100;
              offset += span;
              return (
                <li key={stage.etapa} className="grid gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div>
                    <p className="font-medium">
                      <span className="mr-2 text-muted tabular">{index + 1}.</span>
                      {stage.etapa}
                    </p>
                    <p className="text-[13px] text-muted">{stage.entregables.join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-2.5 flex-1 rounded-full bg-subtle">
                      <span className={cn('absolute inset-y-0 rounded-full', index % 2 === 0 ? 'bg-brand' : 'bg-teal')} style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[13px] text-muted tabular">{stage.duracionEstimada}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[13px] text-muted">{b.estimateNote}</p>
        </Section>

        <Section id="riesgos" number={13} title={b.sections.riesgos}>
          <ul className="flex flex-col gap-2.5">
            {content.riesgos.map((risk) => (
              <li key={risk.riesgo} className="rounded-lg border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 basis-64 font-medium">{risk.riesgo}</p>
                  <Badge tone={IMPACT_TONE[risk.impacto]} dot>
                    {b.impact[risk.impacto]}
                  </Badge>
                </div>
                <p className="mt-1 text-[13.5px] text-muted">
                  <span className="font-medium">{b.mitigation}:</span> {risk.mitigacion}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="criterios" number={14} title={b.sections.criterios}>
          <ul className="flex flex-col gap-2">
            {content.criteriosAceptacion.map((criterion) => (
              <li key={criterion} className="flex gap-3 leading-snug">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-line-strong" aria-hidden />
                {criterion}
              </li>
            ))}
          </ul>
        </Section>
      </article>
    </div>
  );
}
