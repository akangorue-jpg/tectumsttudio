/**
 * Paso 4 del asistente: cómo interpretó AURA el requerimiento y qué preguntas quedan abiertas.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { LuInfo, LuMessageCircleQuestion, LuPlus } from 'react-icons/lu';
import { categoryLabel } from '../../core/catalog';
import type { Interpretation } from '../../core/types';
import { useT } from '../i18n';
import { Link } from '../lib/router';
import { useSession } from '../lib/session';
import { Badge, Button, Card, Notice, Textarea, type Tone } from '../ui/kit';

const CONFIDENCE_TONE: Record<Interpretation['confidence'], Tone> = { alta: 'ok', media: 'brand', baja: 'warn' };

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-[13px] font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

const Chips = ({ items, mono }: { items: string[]; mono?: boolean }) => (
  <ul className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <li key={item} className={mono ? 'rounded bg-subtle px-2 py-0.5 font-mono text-[12.5px]' : 'rounded-md border border-line px-2 py-0.5 text-[13px]'}>
        {item}
      </li>
    ))}
  </ul>
);

export function InterpretationView({
  interpretation,
  categories,
  answers,
  busy,
  onAnswers,
  onAddCategory,
}: {
  interpretation: Interpretation;
  categories: string[];
  answers: Record<string, string>;
  busy: boolean;
  onAnswers(answers: Record<string, string>): void;
  onAddCategory(category: string): void;
}) {
  const t = useT();
  const s = t.wizard.step4;
  const { ai } = useSession();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => setDraft({}), [interpretation]);

  const suggested = interpretation.suggestedCategories.filter((id) => !categories.includes(id));
  const hasDraft = Object.values(draft).some((value) => value.trim());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{s.title}</h2>
        <p className="mt-1 text-[13px] text-muted">{s.localNote}</p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{s.solutionType}</p>
            <p className="text-xl leading-snug font-semibold tracking-[-0.01em]">{interpretation.solutionType}</p>
          </div>
          <Badge tone={CONFIDENCE_TONE[interpretation.confidence]} dot>
            {s.confidence[interpretation.confidence]}
          </Badge>
        </div>
        <p className="mt-3 max-w-[75ch] leading-relaxed">{interpretation.summary}</p>
        {suggested.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-[13px] text-muted">{s.suggestedTitle}</span>
            {suggested.map((id) => (
              <Button key={id} size="sm" variant="soft" disabled={busy} onClick={() => onAddCategory(id)} icon={<LuPlus className="size-3.5" />}>
                {categoryLabel(id)}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {interpretation.questions.length > 0 && (
        <Card className="border-brand/40 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-ink">
              <LuMessageCircleQuestion className="size-[18px]" />
            </span>
            <div>
              <h3 className="font-semibold">{s.questionsTitle}</h3>
              <p className="text-[13px] text-muted">{s.questionsText}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {interpretation.questions.map((question) => (
              <div key={question.id} className="flex flex-col gap-1.5">
                <label htmlFor={`q-${question.id}`} className="font-medium">
                  {question.question}
                </label>
                <p className="text-[13px] text-muted">{question.why}</p>
                <Textarea id={`q-${question.id}`} rows={2} maxLength={2000} placeholder={s.answerPh} value={draft[question.id] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [question.id]: event.target.value }))} />
              </div>
            ))}
            <div>
              <Button
                variant="soft"
                loading={busy}
                disabled={!hasDraft}
                onClick={() => onAnswers({ ...answers, ...Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim())) })}
              >
                {s.update}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="grid gap-x-8 gap-y-6 p-5 lg:grid-cols-2">
        <Block title={s.features} className="lg:row-span-3">
          <ul className="flex flex-col divide-y divide-line">
            {interpretation.features.map((feature) => (
              <li key={feature.name} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{feature.name}</p>
                  <p className="text-[13px] text-muted">{feature.reason}</p>
                </div>
                <Badge tone={feature.origin === 'explicito' ? 'brand' : 'teal'}>{feature.origin === 'explicito' ? s.explicit : s.implicit}</Badge>
              </li>
            ))}
          </ul>
        </Block>
        <Block title={s.architecture}>
          <p className="leading-relaxed">{interpretation.architecture}</p>
        </Block>
        <Block title={s.components}>
          <Chips items={interpretation.components} />
        </Block>
        <Block title={s.entities}>
          <Chips items={interpretation.entities} mono />
        </Block>
        <Block title={s.technologies}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13.5px]">
            {interpretation.technologies.map((tech) => (
              <div key={`${tech.capa}-${tech.tecnologia}`} className="contents">
                <dt className="text-muted">{tech.capa}</dt>
                <dd title={tech.motivo}>{tech.tecnologia}</dd>
              </div>
            ))}
          </dl>
        </Block>
        <div className="flex flex-col gap-6">
          <Block title={s.roles}>
            <Chips items={interpretation.roles} />
          </Block>
          <Block title={s.integrations}>{interpretation.integrations.length > 0 ? <Chips items={interpretation.integrations} /> : <p className="text-muted">{s.integrationsNone}</p>}</Block>
        </div>
        <Block title={s.challenges} className="lg:col-span-2">
          <ul className="grid gap-x-8 gap-y-1.5 lg:grid-cols-2">
            {interpretation.challenges.map((challenge) => (
              <li key={challenge} className="flex gap-2.5 leading-snug">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-warn-ink" />
                {challenge}
              </li>
            ))}
          </ul>
        </Block>
      </Card>

      <Notice tone={ai ? 'teal' : 'neutral'} icon={<LuInfo />}>
        {ai ? s.engineAi(ai.model ? `${ai.label} (${ai.model})` : ai.label) : s.engineLocal}{' '}
        {!ai && (
          <Link to="/configuracion/proveedores" className="font-medium text-brand-ink hover:underline">
            {s.engineLink}
          </Link>
        )}
      </Notice>
    </div>
  );
}
