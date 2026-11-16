import type { z } from 'zod';
import { errors } from '../core/errors';
import { firstIssue } from '../core/schemas';
import type { Activity, ActivityActor, ActivityLevel, Project, ProviderView, User } from '../core/types';
import type { Deps } from './deps';
import type { AuthCtx } from './http';
import type { ProviderRecord, UserRecord } from './repos/types';

/** Valida una entrada con Zod y lanza un error 400 legible si no cumple. */
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw errors.validation(firstIssue(result.error));
  return result.data;
}

export const publicUser = ({ passwordHash: _omit, ...user }: UserRecord): User => user;

/** Devuelve el proyecto sólo si pertenece al usuario; en cualquier otro caso responde 404. */
export async function ownedProject(ctx: AuthCtx, id: string): Promise<Project> {
  const project = await ctx.deps.repos.projects.byId(id);
  if (!project || project.ownerId !== ctx.user.id) throw errors.notFound('El proyecto');
  return project;
}

export interface ActivityInput {
  userId: string;
  project?: Pick<Project, 'id' | 'name'> | null;
  type: string;
  summary: string;
  actor?: ActivityActor;
  level?: ActivityLevel;
}

/** Registro de auditoría: toda acción relevante deja una entrada. */
export async function recordActivity(deps: Deps, input: ActivityInput): Promise<void> {
  const entry: Activity = {
    id: deps.platform.id(),
    userId: input.userId,
    projectId: input.project?.id ?? null,
    projectName: input.project?.name ?? null,
    type: input.type,
    actor: input.actor ?? 'usuario',
    level: input.level ?? 'info',
    summary: input.summary,
    createdAt: deps.platform.now(),
  };
  await deps.repos.activity.add(entry);
  deps.log('info', 'activity', { type: entry.type, userId: entry.userId, projectId: entry.projectId, level: entry.level });
}

/** Vista de los proveedores de IA para la interfaz. Nunca incluye la credencial, ni siquiera cifrada. */
export async function providerViews(deps: Deps, userId: string): Promise<ProviderView[]> {
  const [records, totals] = await Promise.all([deps.repos.providers.list(userId), deps.repos.usage.totals(userId)]);
  const byId = new Map<string, ProviderRecord>(records.map((r) => [r.provider, r]));
  const zero = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const views: ProviderView[] = deps.providers.describe().map((descriptor) => {
    const record = byId.get(descriptor.id);
    return {
      id: descriptor.id,
      label: descriptor.label,
      availability: descriptor.availability,
      connected: !!record,
      status: record?.status ?? null,
      keyHint: record?.keyHint ?? null,
      model: record?.model ?? null,
      models: record?.models ?? [],
      primary: record?.primary ?? false,
      lastVerifiedAt: record?.lastVerifiedAt ?? null,
      lastError: record?.lastError ?? null,
      usage: totals[descriptor.id] ?? zero,
    };
  });
  if (deps.platform.builtinAi) {
    views.unshift({
      id: 'claude_integrado',
      label: deps.platform.builtinAi.label,
      availability: 'integrado',
      connected: true,
      status: 'conectado',
      keyHint: null,
      model: null,
      models: [],
      primary: !records.some((r) => r.primary && r.status === 'conectado'),
      lastVerifiedAt: null,
      lastError: null,
      usage: totals['claude_integrado'] ?? zero,
    });
  }
  return views;
}
