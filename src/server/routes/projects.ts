import { isCategoryId } from '../../core/catalog';
import { interpret } from '../../core/blueprint/engine';
import { errors } from '../../core/errors';
import { blueprintCreateInput, projectCreateInput, projectUpdateInput, specSchema } from '../../core/schemas';
import type { Attachment, Blueprint, DashboardData, Project, ProjectDetail } from '../../core/types';
import { engineInput, generateBlueprint } from '../blueprint-service';
import { ok, type AuthCtx, type Router } from '../http';
import type { AttachmentRecord, BlueprintRecord } from '../repos/types';
import { ownedProject, parse, providerViews, recordActivity } from '../services';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'xlsx', 'xls', 'csv', 'tsv', 'json', 'txt', 'md', 'docx', 'doc', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'gif']);

const toAttachment = ({ storageKey: _omit, ...attachment }: AttachmentRecord): Attachment => attachment;
const toBlueprint = ({ ownerId: _omit, ...blueprint }: BlueprintRecord): Blueprint => blueprint;
const validCategories = (ids: string[]) => [...new Set(ids.filter(isCategoryId))];

const hasEnoughToInterpret = (project: Project) => project.spec.description.trim().length > 0 || project.categories.length > 0;

async function detail(ctx: AuthCtx, project: Project): Promise<ProjectDetail> {
  const [attachments, blueprints] = await Promise.all([
    ctx.deps.repos.attachments.listByProject(project.id),
    ctx.deps.repos.blueprints.listByProject(project.id),
  ]);
  return { project, attachments: attachments.map(toAttachment), blueprints: blueprints.map(toBlueprint) };
}

export function registerProjectRoutes(router: Router) {
  router.secure('GET', '/api/dashboard', async ({ deps, user }) => {
    const [projects, versiones, activity, providers] = await Promise.all([
      deps.repos.projects.listByOwner(user.id),
      deps.repos.blueprints.countByOwner(user.id),
      deps.repos.activity.list({ userId: user.id, limit: 12 }),
      providerViews(deps, user.id),
    ]);
    const count = (status: Project['status']) => projects.filter((p) => p.status === status).length;
    const connected = providers.filter((p) => p.connected && p.status === 'conectado');
    const usage = connected.reduce(
      (total, p) => ({ calls: total.calls + p.usage.calls, inputTokens: total.inputTokens + p.usage.inputTokens, outputTokens: total.outputTokens + p.usage.outputTokens }),
      { calls: 0, inputTokens: 0, outputTokens: 0 },
    );
    const data: DashboardData = {
      counts: {
        total: projects.length,
        activos: count('en_desarrollo'),
        borradores: count('borrador'),
        publicados: count('publicado'),
        pausados: count('pausado'),
        archivados: count('archivado'),
        versiones,
      },
      recent: projects.slice(0, 6),
      activity,
      ai: {
        connected: connected.length,
        primaryLabel: (connected.find((p) => p.primary) ?? connected[0])?.label ?? null,
        usage: usage.calls > 0 ? usage : null,
      },
    };
    return ok(data);
  });

  router.secure('GET', '/api/activity', async ({ deps, user, req }) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    return ok({ activity: await deps.repos.activity.list({ userId: user.id, limit }) });
  });

  router.secure('GET', '/api/projects', async ({ deps, user }) => ok({ projects: await deps.repos.projects.listByOwner(user.id) }));

  router.secure('POST', '/api/projects', async (ctx) => {
    const { deps, user, req } = ctx;
    const input = parse(projectCreateInput, req.body);
    const now = deps.platform.now();
    const project: Project = {
      id: deps.platform.id(),
      ownerId: user.id,
      name: input.name || 'Proyecto sin título',
      status: 'borrador',
      stage: 'especificacion',
      categories: validCategories(input.categories),
      spec: specSchema.parse(input.spec),
      specUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await deps.repos.projects.create(project);
    await recordActivity(deps, { userId: user.id, project, type: 'proyecto.creado', summary: `Creaste el proyecto «${project.name}».` });
    return ok(await detail(ctx, project), 201);
  });

  router.secure('GET', '/api/projects/:id', async (ctx) => ok(await detail(ctx, await ownedProject(ctx, ctx.params.id!))));

  router.secure('PATCH', '/api/projects/:id', async (ctx) => {
    const { deps, user, req } = ctx;
    const project = await ownedProject(ctx, ctx.params.id!);
    const input = parse(projectUpdateInput, req.body);
    const now = deps.platform.now();
    const patch: Partial<Project> = { updatedAt: now };

    if (input.name !== undefined && input.name !== project.name) patch.name = input.name;
    if (input.categories !== undefined) {
      const categories = validCategories(input.categories);
      if (JSON.stringify(categories) !== JSON.stringify(project.categories)) {
        patch.categories = categories;
        patch.specUpdatedAt = now;
      }
    }
    if (input.spec !== undefined) {
      const spec = specSchema.parse({ ...project.spec, ...input.spec });
      if (JSON.stringify(spec) !== JSON.stringify(project.spec)) {
        patch.spec = spec;
        patch.specUpdatedAt = now;
      }
    }
    if (input.status !== undefined) {
      // Al reactivar, el proyecto vuelve a "en desarrollo" si alguna vez tuvo un Blueprint aprobado.
      const everApproved = project.stage === 'aprobado' || (await deps.repos.blueprints.listByProject(project.id)).some((b) => b.approvedAt !== null);
      const next: Project['status'] = input.status === 'activo' ? (everApproved ? 'en_desarrollo' : 'borrador') : input.status;
      if (next !== project.status) patch.status = next;
    }

    await deps.repos.projects.update(project.id, patch);
    const updated = { ...project, ...patch };
    if (patch.name) {
      await recordActivity(deps, { userId: user.id, project: updated, type: 'proyecto.renombrado', summary: `Renombraste «${project.name}» a «${updated.name}».` });
    }
    if (patch.status) {
      const verb = { pausado: 'Pausaste', archivado: 'Archivaste', borrador: 'Reactivaste', en_desarrollo: 'Reactivaste', publicado: 'Publicaste' }[patch.status];
      await recordActivity(deps, { userId: user.id, project: updated, type: 'proyecto.estado', summary: `${verb} el proyecto «${updated.name}».` });
    }
    return ok(await detail(ctx, updated));
  });

  router.secure('DELETE', '/api/projects/:id', async (ctx) => {
    const { deps, user } = ctx;
    const project = await ownedProject(ctx, ctx.params.id!);
    const attachments = await deps.repos.attachments.listByProject(project.id);
    await deps.repos.projects.delete(project.id);
    await Promise.all(attachments.map((a) => deps.platform.files.delete(a.storageKey).catch(() => undefined)));
    await recordActivity(deps, { userId: user.id, project: null, type: 'proyecto.eliminado', level: 'advertencia', summary: `Eliminaste el proyecto «${project.name}».` });
    return ok({ ok: true });
  });

  router.secure('GET', '/api/projects/:id/activity', async (ctx) => {
    const project = await ownedProject(ctx, ctx.params.id!);
    return ok({ activity: await ctx.deps.repos.activity.list({ userId: ctx.user.id, projectId: project.id, limit: 100 }) });
  });

  // ----- Interpretación y Blueprint -----

  router.secure('POST', '/api/projects/:id/interpret', async (ctx) => {
    const { deps, user } = ctx;
    const project = await ownedProject(ctx, ctx.params.id!);
    if (!hasEnoughToInterpret(project)) throw errors.validation('Describí tu idea o elegí al menos una categoría para continuar.');
    const interpretation = interpret(engineInput(project));
    if (project.stage === 'especificacion') {
      await deps.repos.projects.update(project.id, { stage: 'interpretacion', updatedAt: deps.platform.now() });
      project.stage = 'interpretacion';
    }
    await recordActivity(deps, { userId: user.id, project, type: 'interpretacion.generada', actor: 'sistema', summary: `Se interpretaron los requerimientos de «${project.name}»: ${interpretation.solutionType}.` });
    return ok({ project, interpretation });
  });

  router.secure('POST', '/api/projects/:id/blueprints', async (ctx) => {
    const { deps, user, req } = ctx;
    const project = await ownedProject(ctx, ctx.params.id!);
    if (!hasEnoughToInterpret(project)) throw errors.validation('Describí tu idea o elegí al menos una categoría para generar el Blueprint.');
    const { engine } = parse(blueprintCreateInput, req.body);

    const generated = await generateBlueprint(deps, user, project, engine);
    const previous = await deps.repos.blueprints.listByProject(project.id);
    const now = deps.platform.now();
    // Un borrador anterior queda reemplazado; un Blueprint aprobado sigue vigente hasta aprobar el nuevo.
    await Promise.all(previous.filter((b) => b.status === 'borrador').map((b) => deps.repos.blueprints.update(b.id, { status: 'reemplazado' })));
    const record: BlueprintRecord = {
      id: deps.platform.id(),
      projectId: project.id,
      ownerId: user.id,
      version: (previous[0]?.version ?? 0) + 1,
      status: 'borrador',
      source: generated.source,
      model: generated.model,
      interpretation: generated.interpretation,
      content: generated.content,
      notes: generated.notes,
      createdAt: now,
      approvedAt: null,
    };
    await deps.repos.blueprints.create(record);
    await deps.repos.projects.update(project.id, { stage: 'blueprint', updatedAt: now });
    const fellBack = generated.notes.length > 0;
    await recordActivity(deps, {
      userId: user.id,
      project,
      type: 'blueprint.generado',
      actor: generated.source === 'motor_local' ? 'sistema' : 'aura',
      level: fellBack ? 'advertencia' : 'info',
      summary: fellBack
        ? `Blueprint v${record.version} de «${project.name}» generado con el motor local porque la IA no respondió correctamente.`
        : `Blueprint v${record.version} de «${project.name}» generado con ${generated.sourceLabel}.`,
    });
    return ok(await detail(ctx, { ...project, stage: 'blueprint', updatedAt: now }), 201);
  });

  router.secure('POST', '/api/blueprints/:id/approve', async (ctx) => {
    const { deps, user } = ctx;
    const blueprint = await deps.repos.blueprints.byId(ctx.params.id!);
    if (!blueprint || blueprint.ownerId !== user.id) throw errors.notFound('El Blueprint');
    const project = await ownedProject(ctx, blueprint.projectId);
    if (blueprint.status !== 'borrador') throw errors.conflict('Sólo se puede aprobar la versión más reciente en borrador.');
    const now = deps.platform.now();
    const others = await deps.repos.blueprints.listByProject(project.id);
    await Promise.all(others.filter((b) => b.id !== blueprint.id && b.status === 'aprobado').map((b) => deps.repos.blueprints.update(b.id, { status: 'reemplazado' })));
    await deps.repos.blueprints.update(blueprint.id, { status: 'aprobado', approvedAt: now });
    const status: Project['status'] = project.status === 'borrador' ? 'en_desarrollo' : project.status;
    await deps.repos.projects.update(project.id, { stage: 'aprobado', status, updatedAt: now });
    await recordActivity(deps, { userId: user.id, project, type: 'blueprint.aprobado', summary: `Aprobaste el Blueprint v${blueprint.version} de «${project.name}».` });
    return ok(await detail(ctx, { ...project, stage: 'aprobado', status, updatedAt: now }));
  });

  // ----- Adjuntos -----

  router.secure('POST', '/api/projects/:id/attachments', async (ctx) => {
    const { deps, user, req } = ctx;
    const project = await ownedProject(ctx, ctx.params.id!);
    if (!req.raw || req.raw.byteLength === 0) throw errors.validation('El archivo está vacío.');
    if (req.raw.byteLength > deps.config.attachmentBytes) {
      throw errors.tooLarge(`El archivo supera el máximo de ${Math.round(deps.config.attachmentBytes / (1024 * 1024))} MB.`);
    }
    const name = (req.query.name ?? '')
      .replace(/[\\/\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 150);
    const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    if (!name || !ALLOWED_EXTENSIONS.has(extension)) {
      throw errors.validation('Tipo de archivo no admitido. Podés adjuntar PDF, Excel, CSV, Word, texto, JSON e imágenes.');
    }
    const existing = await deps.repos.attachments.listByProject(project.id);
    if (existing.length >= deps.config.maxAttachmentsPerProject) throw errors.validation(`Un proyecto admite hasta ${deps.config.maxAttachmentsPerProject} adjuntos.`);

    const id = deps.platform.id();
    const record: AttachmentRecord = {
      id,
      projectId: project.id,
      name,
      mime: req.contentType.split(';')[0]?.trim() || 'application/octet-stream',
      size: req.raw.byteLength,
      storageKey: `${project.id}/${id}`,
      createdAt: deps.platform.now(),
    };
    await deps.platform.files.put(record.storageKey, req.raw);
    await deps.repos.attachments.create(record);
    await recordActivity(deps, { userId: user.id, project, type: 'adjunto.agregado', summary: `Adjuntaste «${name}» a «${project.name}».` });
    return ok({ attachment: toAttachment(record) }, 201);
  });

  const ownedAttachment = async (ctx: AuthCtx) => {
    const attachment = await ctx.deps.repos.attachments.byId(ctx.params.id!);
    if (!attachment) throw errors.notFound('El adjunto');
    const project = await ownedProject(ctx, attachment.projectId);
    return { attachment, project };
  };

  router.secure('GET', '/api/attachments/:id/content', async (ctx) => {
    const { attachment } = await ownedAttachment(ctx);
    const data = await ctx.deps.platform.files.get(attachment.storageKey);
    if (!data) throw errors.notFound('El contenido del adjunto');
    // Siempre se entrega como descarga: los archivos de usuarios no se interpretan en el origen de la aplicación.
    return { status: 200, file: { data, contentType: 'application/octet-stream', filename: attachment.name } };
  });

  router.secure('DELETE', '/api/attachments/:id', async (ctx) => {
    const { attachment, project } = await ownedAttachment(ctx);
    await ctx.deps.repos.attachments.delete(attachment.id);
    await ctx.deps.platform.files.delete(attachment.storageKey).catch(() => undefined);
    await recordActivity(ctx.deps, { userId: ctx.user.id, project, type: 'adjunto.eliminado', summary: `Quitaste el adjunto «${attachment.name}» de «${project.name}».` });
    return ok({ ok: true });
  });
}
