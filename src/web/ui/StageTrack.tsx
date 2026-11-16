/**
 * Pista de etapas: el recorrido idea → software de cada proyecto.
 * Es una secuencia real (cada etapa habilita la siguiente); las etapas que la plataforma
 * todavía no ofrece se muestran punteadas y con la fase en la que llegan.
 */
import { LuCheck } from 'react-icons/lu';
import type { ProjectStage } from '../../core/types';
import { useT } from '../i18n';
import { cn } from './kit';

const STEPS = [
  { key: 'especificacion', phase: 0 },
  { key: 'interpretacion', phase: 0 },
  { key: 'blueprint', phase: 0 },
  { key: 'aprobado', phase: 0 },
  { key: 'generacion', phase: 3 },
  { key: 'publicacion', phase: 8 },
] as const;

/** Cantidad de etapas completadas según la etapa guardada del proyecto. */
const DONE: Record<ProjectStage, number> = { especificacion: 0, interpretacion: 2, blueprint: 3, aprobado: 4 };

type StepState = 'done' | 'current' | 'pending' | 'future';

function stateOf(index: number, done: number): StepState {
  if (index < done) return 'done';
  if (STEPS[index]!.phase > 0) return 'future';
  return index === done ? 'current' : 'pending';
}

export function currentStageLabel(stage: ProjectStage, labels: Record<string, unknown>): string {
  const step = STEPS[Math.min(DONE[stage], STEPS.length - 1)]!;
  return String(labels[step.key]);
}

/** Versión compacta para tarjetas y filas: seis segmentos y el nombre de la etapa en curso. */
export function StageMeter({ stage, className }: { stage: ProjectStage; className?: string }) {
  const t = useT();
  const done = DONE[stage];
  const label = currentStageLabel(stage, t.stage);
  return (
    <div className={cn('flex items-center gap-2.5', className)} title={STEPS.map((step, i) => `${i + 1}. ${t.stage[step.key]}`).join(' → ')}>
      <div className="flex gap-[3px]" aria-hidden>
        {STEPS.map((step, index) => {
          const state = stateOf(index, done);
          return (
            <span
              key={step.key}
              className={cn(
                'h-1.5 w-4 rounded-full',
                state === 'done' && 'bg-brand',
                state === 'current' && 'bg-brand/35',
                state === 'pending' && 'bg-line-strong',
                state === 'future' && 'border border-dashed border-line-strong',
              )}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted">{done >= 4 ? t.project.next.aprobado.title : label}</span>
    </div>
  );
}

/** Versión completa para la ficha del proyecto y la pantalla de ingreso. */
export function StageTrack({ stage, className }: { stage: ProjectStage; className?: string }) {
  const t = useT();
  const done = DONE[stage];
  return (
    <ol className={cn('flex w-full', className)}>
      {STEPS.map((step, index) => {
        const state = stateOf(index, done);
        const name = t.stage[step.key];
        const description = state === 'done' ? t.stage.done(name) : state === 'current' ? t.stage.current(name) : state === 'future' ? t.stage.future(name, step.phase) : t.stage.pending(name);
        return (
          <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center gap-2" aria-current={state === 'current' ? 'step' : undefined} title={description}>
            {index > 0 && (
              <span
                aria-hidden
                className={cn('absolute top-3 right-1/2 h-px w-full -translate-y-1/2', index <= done ? 'bg-brand' : state === 'future' ? 'border-t border-dashed border-line-strong' : 'bg-line-strong')}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold tabular',
                state === 'done' && 'bg-brand text-white',
                state === 'current' && 'bg-surface text-brand-ink ring-2 ring-brand',
                state === 'pending' && 'border border-line-strong bg-surface text-muted',
                state === 'future' && 'border border-dashed border-line-strong bg-canvas text-muted',
              )}
            >
              {state === 'done' ? <LuCheck className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span className="flex flex-col items-center px-1 text-center leading-tight">
              <span className={cn('text-[13px]', state === 'current' ? 'font-semibold text-ink' : state === 'done' ? 'text-ink' : 'text-muted')}>{name}</span>
              {state === 'future' && <span className="mt-0.5 text-[11px] text-muted">{t.common.phase(step.phase)}</span>}
              <span className="sr-only">{description}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
