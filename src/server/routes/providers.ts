import { errors } from '../../core/errors';
import { PROVIDER_IDS, providerConnectInput, providerUpdateInput, type ProviderId } from '../../core/schemas';
import type { Deps } from '../deps';
import { ok, type AuthCtx, type Router } from '../http';
import type { ProviderRecord } from '../repos/types';
import { parse, providerViews, recordActivity } from '../services';

function providerId(ctx: AuthCtx): ProviderId {
  const id = ctx.params.id as ProviderId;
  if (!PROVIDER_IDS.includes(id)) throw errors.notFound('El proveedor');
  return id;
}

function requireSecureSecrets(deps: Deps) {
  if (!deps.platform.secureSecrets) {
    throw errors.unavailable('En el modo demostración no se guardan API Keys: las credenciales sólo se almacenan cifradas en el backend de TECTUM STUDIO.');
  }
}

async function setPrimary(deps: Deps, userId: string, provider: ProviderId) {
  for (const record of await deps.repos.providers.list(userId)) {
    const primary = record.provider === provider;
    if (record.primary !== primary) await deps.repos.providers.upsert({ ...record, primary });
  }
}

export function registerProviderRoutes(router: Router) {
  router.secure('GET', '/api/providers', async ({ deps, user }) => ok({ providers: await providerViews(deps, user.id) }));

  // Conectar: la API Key se verifica contra el proveedor antes de guardarla cifrada.
  router.secure('PUT', '/api/providers/:id', async (ctx) => {
    const { deps, user, req } = ctx;
    requireSecureSecrets(deps);
    const id = providerId(ctx);
    const { apiKey } = parse(providerConnectInput, req.body);
    const adapter = deps.providers.get(id);

    let models;
    try {
      models = await adapter.listModels(apiKey);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error desconocido';
      await recordActivity(deps, { userId: user.id, type: 'proveedor.error', level: 'error', summary: `No se pudo conectar ${adapter.label}: ${reason}` });
      throw errors.validation(`No se pudo verificar la conexión. ${reason}`);
    }

    const existing = await deps.repos.providers.get(user.id, id);
    const others = (await deps.repos.providers.list(user.id)).filter((r) => r.provider !== id);
    const now = deps.platform.now();
    const record: ProviderRecord = {
      userId: user.id,
      provider: id,
      encryptedKey: await deps.platform.encrypt(apiKey),
      keyHint: `…${apiKey.slice(-4)}`,
      model: existing?.model && models.some((m) => m.id === existing.model) ? existing.model : (models[0]?.id ?? null),
      models,
      status: 'conectado',
      primary: existing?.primary ?? !others.some((r) => r.primary),
      lastVerifiedAt: now,
      lastError: null,
      createdAt: existing?.createdAt ?? now,
    };
    await deps.repos.providers.upsert(record);
    await recordActivity(deps, { userId: user.id, type: 'proveedor.conectado', summary: `Conectaste ${adapter.label} (${models.length} modelos disponibles).` });
    return ok({ providers: await providerViews(deps, user.id) });
  });

  router.secure('POST', '/api/providers/:id/verify', async (ctx) => {
    const { deps, user } = ctx;
    requireSecureSecrets(deps);
    const id = providerId(ctx);
    const record = await deps.repos.providers.get(user.id, id);
    if (!record) throw errors.notFound('La conexión con el proveedor');
    const adapter = deps.providers.get(id);
    const now = deps.platform.now();
    try {
      const models = await adapter.listModels(await deps.platform.decrypt(record.encryptedKey));
      await deps.repos.providers.upsert({
        ...record,
        models,
        model: record.model && models.some((m) => m.id === record.model) ? record.model : (models[0]?.id ?? null),
        status: 'conectado',
        lastVerifiedAt: now,
        lastError: null,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error desconocido';
      await deps.repos.providers.upsert({ ...record, status: 'error', lastVerifiedAt: now, lastError: reason });
      await recordActivity(deps, { userId: user.id, type: 'proveedor.error', level: 'error', summary: `Falló la verificación de ${adapter.label}: ${reason}` });
    }
    return ok({ providers: await providerViews(deps, user.id) });
  });

  router.secure('PATCH', '/api/providers/:id', async (ctx) => {
    const { deps, user, req } = ctx;
    const id = providerId(ctx);
    const record = await deps.repos.providers.get(user.id, id);
    if (!record) throw errors.notFound('La conexión con el proveedor');
    const input = parse(providerUpdateInput, req.body);
    if (input.model !== undefined) {
      if (!record.models.some((m) => m.id === input.model)) throw errors.validation('Ese modelo no está disponible para tu API Key.');
      await deps.repos.providers.upsert({ ...record, model: input.model });
    }
    if (input.primary) await setPrimary(deps, user.id, id);
    return ok({ providers: await providerViews(deps, user.id) });
  });

  router.secure('DELETE', '/api/providers/:id', async (ctx) => {
    const { deps, user } = ctx;
    const id = providerId(ctx);
    const record = await deps.repos.providers.get(user.id, id);
    if (!record) throw errors.notFound('La conexión con el proveedor');
    await deps.repos.providers.delete(user.id, id);
    if (record.primary) {
      const next = (await deps.repos.providers.list(user.id)).find((r) => r.status === 'conectado');
      if (next) await setPrimary(deps, user.id, next.provider);
    }
    await recordActivity(deps, { userId: user.id, type: 'proveedor.desconectado', summary: `Desconectaste ${deps.providers.get(id).label}. La API Key se eliminó del servidor.` });
    return ok({ providers: await providerViews(deps, user.id) });
  });
}
