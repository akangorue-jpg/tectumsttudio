import assert from 'node:assert/strict';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { buildBlueprint, interpret } from '../src/core/blueprint/engine';
import { blueprintSchema, emptySpec } from '../src/core/schemas';
import { createSqliteRepos, migrate, openDatabase } from '../src/server/repos/sqlite';
import { Client, createTestEnv, startFakeProvider, tempDir } from './helpers';

const DESCRIPTION =
  'Necesito un sistema para que mis vendedores registren clientes, hagan seguimiento de oportunidades y yo pueda ver reportes de ventas por mes con recordatorios por email.';

for (const kind of ['memory', 'sqlite'] as const) {
  describe(`API con repositorios ${kind}`, () => {
    const env = createTestEnv(kind);
    after(() => env.close());

    test('cuenta: registro, sesión, perfil y cierre de sesión', async () => {
      const client = new Client(env.app);
      assert.equal((await client.get('/api/auth/me')).status, 401);
      assert.equal((await client.post('/api/auth/register', { name: 'A', email: 'no-es-email', password: '123' })).status, 400);

      const { response, email, password } = await client.register('Ana Gómez');
      assert.equal(response.status, 201);
      assert.equal(response.json.user.name, 'Ana Gómez');
      assert.equal(response.json.user.passwordHash, undefined, 'el hash nunca sale del servidor');
      assert.ok(client.token);

      assert.equal((await new Client(env.app).post('/api/auth/register', { name: 'Otra', email, password })).status, 409);
      assert.equal((await client.patch('/api/auth/me', { theme: 'oscuro' })).json.user.theme, 'oscuro');
      assert.equal((await client.get('/api/auth/me')).json.user.name, 'Ana Gómez', 'un cambio parcial no borra otros campos');

      const stolen = client.token;
      assert.equal((await client.post('/api/auth/logout')).status, 200);
      assert.equal(client.token, null);
      const replay = new Client(env.app);
      replay.token = stolen;
      assert.equal((await replay.get('/api/auth/me')).status, 401, 'la sesión cerrada queda invalidada en el servidor');

      const wrong = await client.post('/api/auth/login', { email, password: 'incorrecta' });
      assert.equal(wrong.status, 401);
      assert.equal((await client.post('/api/auth/login', { email: 'nadie@ejemplo.com', password })).json.error.message, wrong.json.error.message, 'no revela si el email existe');
      assert.equal((await client.post('/api/auth/login', { email, password })).status, 200);
    });

    test('proyecto: especificación → interpretación → Blueprint → aprobación', async () => {
      const client = new Client(env.app);
      await client.register();

      const created = await client.post('/api/projects', { name: 'CRM Inmobiliaria', categories: ['crm', 'categoria-inexistente'] });
      assert.equal(created.status, 201);
      const id = created.json.project.id as string;
      assert.deepEqual(created.json.project.categories, ['crm']);
      assert.equal(created.json.project.status, 'borrador');
      assert.equal(created.json.project.stage, 'especificacion');

      assert.equal((await client.patch(`/api/projects/${id}`, { spec: { description: DESCRIPTION, audience: 'equipo comercial' } })).status, 200);
      const merged = await client.patch(`/api/projects/${id}`, { spec: { currency: 'PYG' } });
      assert.equal(merged.json.project.spec.description, DESCRIPTION, 'los cambios parciales conservan el resto de la especificación');

      const interpreted = await client.post(`/api/projects/${id}/interpret`);
      assert.equal(interpreted.status, 200);
      assert.match(interpreted.json.interpretation.solutionType, /CRM/);
      assert.equal(interpreted.json.project.stage, 'interpretacion');

      const generated = await client.post(`/api/projects/${id}/blueprints`, {});
      assert.equal(generated.status, 201);
      const v1 = generated.json.blueprints[0];
      assert.equal(v1.version, 1);
      assert.equal(v1.source, 'motor_local');
      assert.equal(v1.status, 'borrador');
      assert.ok(blueprintSchema.safeParse(v1.content).success);
      assert.equal(v1.ownerId, undefined);
      assert.equal(generated.json.project.stage, 'blueprint');

      const approved = await client.post(`/api/blueprints/${v1.id}/approve`);
      assert.equal(approved.json.project.stage, 'aprobado');
      assert.equal(approved.json.project.status, 'en_desarrollo');
      assert.equal(approved.json.blueprints[0].status, 'aprobado');
      assert.equal((await client.post(`/api/blueprints/${v1.id}/approve`)).status, 409);

      // Regenerar: el aprobado sigue vigente hasta aprobar la nueva versión.
      const regenerated = await client.post(`/api/projects/${id}/blueprints`, { engine: 'local' });
      assert.deepEqual(regenerated.json.blueprints.map((b: any) => [b.version, b.status]), [[2, 'borrador'], [1, 'aprobado']]);
      const third = await client.post(`/api/projects/${id}/blueprints`, {});
      assert.deepEqual(third.json.blueprints.map((b: any) => b.status), ['borrador', 'reemplazado', 'aprobado']);
      const approvedAgain = await client.post(`/api/blueprints/${third.json.blueprints[0].id}/approve`);
      assert.deepEqual(approvedAgain.json.blueprints.map((b: any) => b.status), ['aprobado', 'reemplazado', 'reemplazado']);

      // Con una versión nueva en borrador, pausar y reactivar conserva "en desarrollo".
      await client.post(`/api/projects/${id}/blueprints`, { engine: 'local' });
      await client.patch(`/api/projects/${id}`, { status: 'pausado' });
      assert.equal((await client.patch(`/api/projects/${id}`, { status: 'activo' })).json.project.status, 'en_desarrollo');
      await client.post(`/api/blueprints/${(await client.get(`/api/projects/${id}`)).json.blueprints[0].id}/approve`);

      const dashboard = (await client.get('/api/dashboard')).json;
      assert.deepEqual(
        { total: dashboard.counts.total, activos: dashboard.counts.activos, versiones: dashboard.counts.versiones, publicados: dashboard.counts.publicados },
        { total: 1, activos: 1, versiones: 4, publicados: 0 },
      );
      assert.equal(dashboard.recent[0].id, id);
      assert.equal(dashboard.ai.connected, 0);
      assert.equal(dashboard.ai.usage, null);

      const activity = (await client.get(`/api/projects/${id}/activity`)).json.activity as { type: string }[];
      for (const type of ['proyecto.creado', 'interpretacion.generada', 'blueprint.generado', 'blueprint.aprobado']) {
        assert.ok(activity.some((a) => a.type === type), `falta el registro ${type}`);
      }
      assert.equal(activity[0]!.type, 'blueprint.aprobado', 'la actividad se lista de la más reciente a la más antigua');
    });

    test('estados: pausar, archivar, reactivar y eliminar', async () => {
      const client = new Client(env.app);
      await client.register();
      const id = (await client.post('/api/projects', { name: 'Tablero', categories: ['kanban'] })).json.project.id as string;
      assert.equal((await client.patch(`/api/projects/${id}`, { status: 'pausado' })).json.project.status, 'pausado');
      assert.equal((await client.patch(`/api/projects/${id}`, { status: 'archivado' })).json.project.status, 'archivado');
      assert.equal((await client.patch(`/api/projects/${id}`, { status: 'activo' })).json.project.status, 'borrador');
      assert.equal((await client.patch(`/api/projects/${id}`, { status: 'publicado' })).status, 400, 'publicar no es un cambio manual');
      assert.equal((await client.patch(`/api/projects/${id}`, { name: '' })).status, 400);
      assert.equal((await client.del(`/api/projects/${id}`)).status, 200);
      assert.equal((await client.get(`/api/projects/${id}`)).status, 404);
      const activity = (await client.get('/api/activity')).json.activity as { type: string; projectName: string | null }[];
      assert.ok(activity.some((a) => a.type === 'proyecto.eliminado'));
      assert.ok(activity.some((a) => a.type === 'proyecto.creado' && a.projectName === 'Tablero'), 'el historial sobrevive a la eliminación');
    });

    test('aislamiento: un usuario no accede a proyectos ni Blueprints de otro', async () => {
      const ana = new Client(env.app);
      const beto = new Client(env.app);
      await ana.register('Ana');
      await beto.register('Beto');
      const id = (await ana.post('/api/projects', { name: 'Privado', categories: ['erp'] })).json.project.id as string;
      const blueprintId = (await ana.post(`/api/projects/${id}/blueprints`, {})).json.blueprints[0].id as string;
      assert.equal((await beto.get(`/api/projects/${id}`)).status, 404);
      assert.equal((await beto.patch(`/api/projects/${id}`, { name: 'Tomado' })).status, 404);
      assert.equal((await beto.del(`/api/projects/${id}`)).status, 404);
      assert.equal((await beto.post(`/api/projects/${id}/blueprints`, {})).status, 404);
      assert.equal((await beto.post(`/api/blueprints/${blueprintId}/approve`)).status, 404);
      assert.equal((await beto.get('/api/projects')).json.projects.length, 0);
      assert.equal((await ana.get(`/api/projects/${id}`)).json.project.name, 'Privado');
    });

    test('adjuntos: carga, descarga, validaciones y eliminación', async () => {
      const small = createTestEnv(kind, { config: { attachmentBytes: 64 } });
      try {
        const client = new Client(small.app);
        await client.register();
        const id = (await client.post('/api/projects', { name: 'Con adjuntos' })).json.project.id as string;
        const csv = new TextEncoder().encode('fecha,importe\n2026-01-01,100\n');
        const upload = (name: string, data = csv) => client.call('POST', `/api/projects/${id}/attachments?name=${encodeURIComponent(name)}`, undefined, { data, contentType: 'text/csv' });

        const ok = await upload('ventas.csv');
        assert.equal(ok.status, 201);
        assert.equal(ok.json.attachment.size, csv.byteLength);
        assert.equal(ok.json.attachment.storageKey, undefined);
        assert.equal((await upload('script.exe')).status, 400);
        assert.equal((await upload('../../etc/passwd')).status, 400);
        assert.equal((await upload('grande.csv', new Uint8Array(65))).status, 413);
        assert.equal((await upload('vacio.csv', new Uint8Array(0))).status, 400);

        const detail = (await client.get(`/api/projects/${id}`)).json;
        assert.equal(detail.attachments.length, 1);
        const download = await client.get(`/api/attachments/${ok.json.attachment.id}/content`);
        assert.equal(new TextDecoder().decode(download.file!.data), 'fecha,importe\n2026-01-01,100\n');
        assert.equal(download.file!.contentType, 'application/octet-stream');

        const other = new Client(small.app);
        await other.register('Otro');
        assert.equal((await other.get(`/api/attachments/${ok.json.attachment.id}/content`)).status, 404);

        assert.equal((await client.del(`/api/attachments/${ok.json.attachment.id}`)).status, 200);
        assert.equal((await client.get(`/api/attachments/${ok.json.attachment.id}/content`)).status, 404);
      } finally {
        small.close();
      }
    });

    test('sin descripción ni categorías no se puede interpretar ni generar', async () => {
      const client = new Client(env.app);
      await client.register();
      const id = (await client.post('/api/projects', {})).json.project.id as string;
      assert.equal((await client.post(`/api/projects/${id}/interpret`)).status, 400);
      assert.equal((await client.post(`/api/projects/${id}/blueprints`, {})).status, 400);
    });

    test('rutas: 404 para rutas inexistentes y 405 para métodos no admitidos', async () => {
      const client = new Client(env.app);
      assert.equal((await client.get('/api/no-existe')).status, 404);
      assert.equal((await client.del('/api/meta')).status, 405);
      const meta = (await client.get('/api/meta')).json;
      assert.equal(meta.mode, 'servidor');
      assert.equal(meta.secureSecrets, true);
    });
  });
}

describe('proveedores de IA (contra un servidor local que imita las APIs oficiales)', () => {
  test('conectar, generar con IA, respaldo ante fallas y desconectar', async () => {
    const fake = await startFakeProvider();
    const env = createTestEnv('sqlite', { providerBaseUrl: fake.url });
    try {
      const client = new Client(env.app);
      await client.register();

      const initial = (await client.get('/api/providers')).json.providers;
      assert.deepEqual(initial.map((p: any) => [p.id, p.availability, p.connected]), [['anthropic', 'implementado', false], ['openai', 'implementado', false], ['gemini', 'pendiente', false]]);

      const rejected = await client.put('/api/providers/anthropic', { apiKey: 'sk-incorrecta-0000' });
      assert.equal(rejected.status, 400);
      assert.match(rejected.json.error.message, /rechazó la API Key/);
      assert.equal((await client.get('/api/providers')).json.providers[0].connected, false, 'una clave rechazada no se guarda');
      assert.equal((await client.put('/api/providers/gemini', { apiKey: 'sk-valida-1234' })).status, 404);

      const connected = await client.put('/api/providers/anthropic', { apiKey: 'sk-valida-1234' });
      assert.equal(connected.status, 200);
      const anthropic = connected.json.providers[0];
      assert.deepEqual({ connected: anthropic.connected, status: anthropic.status, model: anthropic.model, primary: anthropic.primary, hint: anthropic.keyHint }, { connected: true, status: 'conectado', model: 'claude-nuevo', primary: true, hint: '…1234' });
      assert.ok(!JSON.stringify(connected.json).includes('sk-valida'), 'la API Key nunca vuelve al navegador');
      const stored = await env.deps.repos.providers.get((await client.get('/api/auth/me')).json.user.id, 'anthropic');
      assert.ok(stored && !stored.encryptedKey.includes('sk-valida'), 'la API Key se guarda cifrada');
      const modelsCall = fake.requests.find((r) => r.path === '/v1/models')!;
      assert.equal(modelsCall.headers['anthropic-version'], '2023-06-01');

      const openai = (await client.put('/api/providers/openai', { apiKey: 'sk-valida-1234' })).json.providers[1];
      assert.deepEqual(openai.models.map((m: any) => m.id), ['gpt-nuevo', 'gpt-anterior'], 'sólo modelos de chat, del más nuevo al más antiguo');
      assert.equal(openai.primary, false);
      assert.equal((await client.patch('/api/providers/anthropic', { model: 'modelo-inexistente' })).status, 400);
      assert.equal((await client.patch('/api/providers/anthropic', { model: 'claude-anterior' })).json.providers[0].model, 'claude-anterior');

      // Generación con IA: la respuesta válida se usa tal cual.
      const id = (await client.post('/api/projects', { name: 'CRM', categories: ['crm'], spec: { description: DESCRIPTION } })).json.project.id as string;
      const input = { name: 'CRM', categories: ['crm'], spec: { ...emptySpec(), description: DESCRIPTION } };
      const blueprint = buildBlueprint(input);
      blueprint.objetivos = ['Objetivo redactado por el modelo.'];
      fake.reply = JSON.stringify({ interpretation: interpret(input), blueprint });
      const viaAi = (await client.post(`/api/projects/${id}/blueprints`, {})).json.blueprints[0];
      assert.deepEqual({ source: viaAi.source, model: viaAi.model, notes: viaAi.notes }, { source: 'anthropic', model: 'claude-anterior', notes: [] });
      assert.deepEqual(viaAi.content.objetivos, ['Objetivo redactado por el modelo.']);
      const messagesCall = fake.requests.find((r) => r.path === '/v1/messages')!;
      assert.equal(messagesCall.body.model, 'claude-anterior');
      assert.match(messagesCall.body.system, /AURA/);
      assert.equal(messagesCall.body.messages[0].role, 'user');

      const usage = (await client.get('/api/providers')).json.providers[0].usage;
      assert.deepEqual(usage, { calls: 1, inputTokens: 1200, outputTokens: 3400 });
      const dashboard = (await client.get('/api/dashboard')).json;
      assert.equal(dashboard.ai.connected, 2);
      assert.equal(dashboard.ai.primaryLabel, 'Anthropic Claude');
      assert.equal(dashboard.ai.usage.inputTokens, 1200);

      // Respuesta inválida del modelo: se usa el motor local y se avisa.
      fake.reply = 'Lo siento, no puedo ayudar con eso.';
      const fallback = (await client.post(`/api/projects/${id}/blueprints`, {})).json.blueprints[0];
      assert.equal(fallback.source, 'motor_local');
      assert.match(fallback.notes[0], /No se pudo generar con Anthropic Claude/);
      const activity = (await client.get(`/api/projects/${id}/activity`)).json.activity;
      assert.equal(activity[0].level, 'advertencia');

      // Cambio de proveedor principal: usa Chat Completions de OpenAI.
      fake.reply = JSON.stringify({ interpretation: interpret(input), blueprint });
      await client.patch('/api/providers/openai', { primary: true });
      const viaOpenAi = (await client.post(`/api/projects/${id}/blueprints`, {})).json.blueprints[0];
      assert.equal(viaOpenAi.source, 'openai');
      const chatCall = fake.requests.find((r) => r.path === '/v1/chat/completions')!;
      assert.deepEqual(chatCall.body.response_format, { type: 'json_object' });
      assert.equal(chatCall.body.messages[0].role, 'system');
      assert.equal(chatCall.headers.authorization, 'Bearer sk-valida-1234');

      // "engine: local" nunca llama a la IA.
      const before = fake.requests.length;
      assert.equal((await client.post(`/api/projects/${id}/blueprints`, { engine: 'local' })).json.blueprints[0].source, 'motor_local');
      assert.equal(fake.requests.length, before);

      // Desconectar elimina la credencial y promueve otro proveedor a principal.
      const afterDelete = (await client.del('/api/providers/openai')).json.providers;
      assert.equal(afterDelete[1].connected, false);
      assert.equal(afterDelete[0].primary, true);
      assert.equal((await client.del('/api/providers/openai')).status, 404);
    } finally {
      env.close();
      await fake.close();
    }
  });

  test('sin conexión con el proveedor: error claro y nada se guarda', async () => {
    const env = createTestEnv('memory'); // apunta a un puerto cerrado
    try {
      const client = new Client(env.app);
      await client.register();
      const response = await client.put('/api/providers/openai', { apiKey: 'sk-cualquiera-1234' });
      assert.equal(response.status, 400);
      assert.match(response.json.error.message, /No se pudo conectar con OpenAI/);
      assert.equal((await client.get('/api/providers')).json.providers[1].connected, false);
    } finally {
      env.close();
    }
  });
});

describe('persistencia SQLite', () => {
  test('las migraciones son idempotentes y los datos sobreviven al reinicio', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'persistencia.db');
    const first = openDatabase(file);
    assert.deepEqual(migrate(first), [], 'reabrir no vuelve a aplicar migraciones');
    const repos = createSqliteRepos(first);
    await repos.users.create({ id: 'u1', email: 'a@b.co', name: 'A', passwordHash: 'x', role: 'admin', theme: 'claro', locale: 'es', createdAt: 1 });
    await repos.projects.create({ id: 'p1', ownerId: 'u1', name: 'Persistente', status: 'borrador', stage: 'especificacion', categories: ['crm'], spec: emptySpec(), specUpdatedAt: 1, createdAt: 1, updatedAt: 1 });
    await repos.attachments.create({ id: 'a1', projectId: 'p1', name: 'x.csv', mime: 'text/csv', size: 1, storageKey: 'p1/a1', createdAt: 1 });
    first.close();

    const second = openDatabase(file);
    const reopened = createSqliteRepos(second);
    assert.equal((await reopened.projects.byId('p1'))?.name, 'Persistente');
    assert.deepEqual((await reopened.projects.byId('p1'))?.categories, ['crm']);
    await reopened.projects.delete('p1');
    assert.equal((await reopened.attachments.listByProject('p1')).length, 0, 'eliminar un proyecto elimina sus adjuntos');
    second.close();
  });
});
