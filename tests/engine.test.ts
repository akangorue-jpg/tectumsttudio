import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, CATALOG_SIZE, catalogItem } from '../src/core/catalog';
import { buildBlueprintPrompt, parseBlueprintResponse } from '../src/core/blueprint/ai';
import { buildBlueprint, hits, interpret, normalize } from '../src/core/blueprint/engine';
import { ARCHETYPES } from '../src/core/blueprint/knowledge';
import { blueprintSchema, emptySpec, interpretationSchema, specSchema } from '../src/core/schemas';

const spec = (patch: Record<string, unknown> = {}) => specSchema.parse({ ...emptySpec(), ...patch });

test('el catálogo tiene las 7 familias y cada ítem apunta a un arquetipo existente', () => {
  assert.equal(CATALOG.length, 7);
  assert.ok(CATALOG_SIZE >= 80);
  const ids = new Set(ARCHETYPES.map((a) => a.id));
  for (const group of CATALOG) for (const item of group.items) assert.ok(ids.has(item.archetype), `${item.id} → ${item.archetype}`);
  assert.equal(catalogItem('crm')?.archetype, 'crm');
});

test('la detección de claves respeta límites de palabra y acentos', () => {
  assert.equal(hits(normalize('Gestión de facturación electrónica'), ['factura']), 1);
  assert.equal(hits(normalize('control de calidad'), ['rol(es)?\\b']), 0);
  assert.equal(hits(normalize('roles y permisos'), ['rol(es)?\\b']), 1);
  assert.equal(hits(normalize('una respuesta rápida'), ['api\\b']), 0);
});

test('todas las categorías producen un Blueprint válido según el esquema', () => {
  for (const group of CATALOG) {
    for (const item of group.items) {
      const input = { name: `Proyecto ${item.label}`, categories: [item.id], spec: spec({ description: 'Sistema para mi empresa.' }) };
      const blueprint = blueprintSchema.safeParse(buildBlueprint(input));
      assert.ok(blueprint.success, `${item.id}: ${blueprint.success ? '' : JSON.stringify(blueprint.error.issues[0])}`);
      const interpretation = interpretationSchema.safeParse(interpret(input));
      assert.ok(interpretation.success, `${item.id}: ${interpretation.success ? '' : JSON.stringify(interpretation.error.issues[0])}`);
    }
  }
});

test('CRM: agrega autenticación como funcionalidad implícita y respeta lo explícito', () => {
  const input = {
    name: 'CRM Inmobiliaria',
    categories: ['crm'],
    spec: spec({
      description:
        'Necesito un sistema para que mis vendedores registren clientes interesados en propiedades, hagan seguimiento de cada oportunidad y yo pueda ver reportes de ventas por mes. Queremos recibir recordatorios por email de las tareas pendientes.',
    }),
  };
  const blueprint = buildBlueprint(input);
  const names = blueprint.modulos.map((m) => m.nombre);
  assert.ok(names.includes('Oportunidades y pipeline'));
  assert.ok(names.includes('Autenticación y permisos'));
  assert.ok(names.includes('Notificaciones'));
  const auth = blueprint.modulos.find((m) => m.nombre === 'Autenticación y permisos')!;
  assert.equal(auth.origen, 'implicito');
  const notif = blueprint.modulos.find((m) => m.nombre === 'Notificaciones')!;
  assert.equal(notif.origen, 'explicito');
  assert.ok(blueprint.modeloDatos.some((e) => e.entidad === 'Usuario'));
  assert.ok(blueprint.integraciones.some((i) => /email/i.test(i.nombre)));
  assert.equal(interpret(input).questions.length, 0, 'una descripción suficiente no debe generar preguntas');
});

test('sin categoría: identifica el tipo de solución desde la descripción y sugiere categorías', () => {
  const input = {
    name: '',
    categories: [],
    spec: spec({ unsure: true, description: 'Quiero controlar el stock de mi depósito, registrar entradas y salidas de mercadería y recibir alertas cuando un producto llega al mínimo.' }),
  };
  const interpretation = interpret(input);
  assert.match(interpretation.solutionType, /inventario/i);
  assert.ok(interpretation.suggestedCategories.includes('gestion-de-inventarios'));
});

test('descripción insuficiente: formula preguntas concretas y no repite las ya respondidas', () => {
  const base = { name: 'Algo', categories: [], spec: spec({ description: 'Una app.' }) };
  const first = interpret(base);
  assert.equal(first.confidence, 'baja');
  assert.ok(first.questions.length >= 2 && first.questions.length <= 3);
  const answers = Object.fromEntries(first.questions.map((q) => [q.id, 'Un sistema de turnos para un consultorio con recordatorios.']));
  const second = interpret({ ...base, spec: spec({ description: 'Una app.', answers }) });
  for (const q of first.questions) assert.ok(!second.questions.some((x) => x.id === q.id));
  assert.match(second.solutionType, /reservas/i, 'las respuestas alimentan el análisis');
});

test('la configuración adicional modifica el resultado', () => {
  const blueprint = buildBlueprint({
    name: 'Portal',
    categories: ['kanban'],
    spec: spec({
      description: 'Tablero de tareas del equipo.',
      needsAuth: 'no',
      needsApi: 'si',
      roles: ['Coordinador', 'Operario'],
      techPrefs: ['Vue', 'Django', 'Elixir'],
      database: 'MySQL',
      integrations: ['Slack'],
      approxUsers: '10000+',
      currency: 'PYG',
      timezone: 'America/Asuncion',
      mainFeatures: ['Asignar tareas desde el celular'],
    }),
  });
  const names = blueprint.modulos.map((m) => m.nombre);
  assert.ok(!names.includes('Autenticación y permisos'));
  assert.ok(names.includes('API de integración'));
  assert.ok(names.includes('Requerimientos específicos'));
  assert.deepEqual(blueprint.rolesUsuarios.map((r) => r.rol), ['Coordinador', 'Operario']);
  const tech = Object.fromEntries(blueprint.tecnologias.map((t) => [t.capa, t.tecnologia]));
  assert.match(tech['Frontend']!, /Vue/);
  assert.match(tech['Backend']!, /Django/);
  assert.match(tech['Base de datos']!, /MySQL/);
  assert.match(tech['Acceso a datos']!, /framework/);
  assert.equal(tech['Preferencia'], 'Elixir');
  assert.ok(blueprint.integraciones.some((i) => i.nombre === 'Slack' && i.estado === 'requerida'));
  assert.ok(blueprint.arquitectura.decisiones.some((d) => /horizontal/.test(d)));
  assert.ok(blueprint.arquitectura.decisiones.some((d) => /America\/Asuncion/.test(d) && /PYG/.test(d)));
});

test('las siglas conservan sus mayúsculas dentro de las frases', () => {
  const interpretation = interpret({ name: 'Ventas', categories: ['crm'], spec: spec({ description: 'CRM para el equipo.' }) });
  assert.match(interpretation.summary, /se interpreta como: CRM \(gestión/);
  const hybrid = buildBlueprint({ name: 'Suite', categories: ['erp', 'api-rest'], spec: spec({ description: 'ERP con API.' }) });
  assert.match(hybrid.resumen.tipoSolucion, /ERP .* y API y servicios/);
});

test('varias categorías producen un sistema híbrido sin módulos duplicados', () => {
  const blueprint = buildBlueprint({ name: 'Suite', categories: ['crm', 'gestion-de-facturacion', 'dashboards'], spec: spec({ description: 'Clientes, facturas y tableros.' }) });
  assert.match(blueprint.resumen.tipoSolucion, /híbrido/);
  const names = blueprint.modulos.map((m) => normalize(m.nombre));
  assert.equal(new Set(names).size, names.length);
});

test('respuesta de IA: se valida contra el esquema y se rechaza lo inválido', () => {
  const input = { name: 'CRM', categories: ['crm'], spec: spec({ description: 'CRM simple.' }) };
  const draft = { interpretation: interpret(input), blueprint: buildBlueprint(input) };
  const prompt = buildBlueprintPrompt(input, draft);
  assert.match(prompt.system, /JSON/);
  assert.match(prompt.user, /Borrador base/);
  const ok = parseBlueprintResponse('```json\n' + JSON.stringify(draft) + '\n```');
  assert.equal(ok.blueprint.resumen.nombre, 'CRM');
  assert.throws(() => parseBlueprintResponse('no hay json'), /JSON/);
  assert.throws(() => parseBlueprintResponse(JSON.stringify({ interpretation: draft.interpretation, blueprint: { ...draft.blueprint, modulos: [] } })), /estructura/);
});
