/**
 * Motor local de interpretación y generación de Blueprint.
 *
 * Determinístico y sin dependencias externas: funciona igual en el servidor y en el navegador.
 * Se usa cuando no hay un proveedor de IA conectado, como respaldo si la IA falla y como
 * borrador base que la IA refina.
 */
import { catalogItem, categoryForArchetype } from '../catalog';
import type { BlueprintContent, Interpretation, ProjectSpec } from '../schemas';
import {
  ARCHETYPES,
  CAPABILITIES,
  INTEGRATION_SIGNALS,
  TECH_PREFS,
  archetypeById,
  type Archetype,
  type EntityDef,
  type RiskDef,
  type RoleDef,
  type SolutionStyle,
} from './knowledge';

export interface EngineInput {
  name: string;
  categories: string[];
  spec: ProjectSpec;
}

type Priority = 'esencial' | 'importante' | 'opcional';
type Origin = 'explicito' | 'implicito';

interface PlannedModule {
  nombre: string;
  descripcion: string;
  funcionalidades: string[];
  prioridad: Priority;
  origen: Origin;
  reason: string;
  capability?: string;
}

interface TechRow {
  capa: string;
  tecnologia: string;
  motivo: string;
}

// ---------- utilidades de texto ----------

export const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const patternCache = new Map<string, RegExp>();
function pattern(clave: string): RegExp {
  let rx = patternCache.get(clave);
  if (!rx) {
    rx = new RegExp(`(^|[^a-z0-9])${clave}`);
    patternCache.set(clave, rx);
  }
  return rx;
}
/** Cantidad de claves (raíces de palabra) presentes en un texto ya normalizado. */
export const hits = (text: string, claves: string[]) => claves.reduce((n, clave) => (pattern(clave).test(text) ? n + 1 : n), 0);

/** Pasa a minúscula la inicial, salvo en siglas (CRM, ERP, API…). */
const lowerFirst = (value: string) => (/^\p{Lu}\p{Ll}/u.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value);
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);
const listText = (values: string[]) =>
  values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} y ${values[values.length - 1]}`;
const uniqueBy = <T>(values: T[], key: (value: T) => string): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = normalize(key(value));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const SCALE_LABEL: Record<string, string> = {
  '1-10': 'hasta 10 usuarios',
  '11-100': 'entre 11 y 100 usuarios',
  '101-1000': 'entre 101 y 1.000 usuarios',
  '1001-10000': 'entre 1.001 y 10.000 usuarios',
  '10000+': 'más de 10.000 usuarios',
};

// ---------- análisis ----------

interface Analysis {
  input: EngineInput;
  text: string;
  words: number;
  primary: Archetype;
  secondary: Archetype[];
  detected: boolean;
  suggestedCategories: string[];
  modules: PlannedModule[];
  capabilities: Set<string>;
  hasAuth: boolean;
  entities: EntityDef[];
  roles: RoleDef[];
  technologies: TechRow[];
  integrations: BlueprintContent['integraciones'];
  risks: RiskDef[];
  architecture: BlueprintContent['arquitectura'];
}

function pickArchetypes(categories: string[], text: string) {
  const scored = ARCHETYPES.filter((a) => a.id !== 'personalizado')
    .map((archetype) => ({ archetype, score: hits(text, archetype.claves) }))
    .sort((a, b) => b.score - a.score);
  const scoreOf = (id: string) => scored.find((s) => s.archetype.id === id)?.score ?? 0;

  const selected = [...new Set(categories.map((id) => catalogItem(id)?.archetype).filter((id): id is string => !!id))];
  const concrete = selected.filter((id) => id !== 'personalizado');

  if (concrete.length > 0) {
    const ordered = concrete
      .map((id, index) => ({ id, index, score: scoreOf(id) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return {
      primary: archetypeById(ordered[0]!.id),
      secondary: ordered.slice(1, 3).map((o) => archetypeById(o.id)),
      detected: false,
      suggested: [] as string[],
    };
  }

  const strong = scored.filter((s) => s.score >= 2);
  if (strong.length > 0) {
    const top = strong[0]!;
    const second = strong[1] && strong[1].score >= Math.max(2, top.score * 0.6) ? [strong[1].archetype] : [];
    return {
      primary: top.archetype,
      secondary: second,
      detected: true,
      suggested: [top.archetype, ...second].map((a) => categoryForArchetype(a.id)).filter((id): id is string => !!id),
    };
  }
  const weak = scored.filter((s) => s.score === 1).slice(0, 3);
  if (weak.length === 1) {
    // Una única coincidencia sin competencia: se toma como tipo probable (la confianza queda baja o media).
    const only = weak[0]!.archetype;
    return {
      primary: only,
      secondary: [] as Archetype[],
      detected: true,
      suggested: [categoryForArchetype(only.id)].filter((id): id is string => !!id),
    };
  }
  return {
    primary: archetypeById('personalizado'),
    secondary: [] as Archetype[],
    detected: false,
    suggested: weak.map((s) => categoryForArchetype(s.archetype.id)).filter((id): id is string => !!id),
  };
}

/** Indica si el arquetipo ya resuelve una capacidad transversal con un módulo propio. */
function coveredBy(capability: string, archetypes: Archetype[]): boolean {
  const names = normalize(archetypes.flatMap((a) => a.modulos.map((mod) => mod.nombre)).join(' | '));
  const ids = archetypes.map((a) => a.id);
  switch (capability) {
    case 'panel':
      return /tablero|dashboard|panel/.test(names);
    case 'reportes':
      return /reporte/.test(names);
    case 'api':
    case 'auth':
      return archetypes[0]?.style === 'api';
    case 'auditoria':
      return /auditor/.test(names);
    case 'archivos':
      return ids.includes('documental');
    case 'calendario':
      return ids.includes('reservas');
    case 'multiempresa':
      return ids.includes('saas');
    case 'pagos':
      return /pago/.test(names);
    case 'notificaciones':
      return /notificacion/.test(names);
    default:
      return false;
  }
}

function planModules(primary: Archetype, secondary: Archetype[], detected: boolean, spec: ProjectSpec, text: string) {
  const modules: PlannedModule[] = [];
  const capabilities = new Set<string>();

  primary.modulos.forEach((mod, index) => {
    const explicit = hits(text, mod.claves) > 0;
    modules.push({
      nombre: mod.nombre,
      descripcion: mod.descripcion,
      funcionalidades: mod.funcionalidades,
      prioridad: index < 2 || explicit ? 'esencial' : 'importante',
      origen: explicit ? 'explicito' : 'implicito',
      reason: explicit
        ? 'Mencionado en la descripción del proyecto.'
        : detected
          ? `Habitual en este tipo de solución (${lowerFirst(primary.label)}).`
          : 'Propio del tipo de solución elegido.',
    });
  });

  for (const archetype of secondary) {
    const explicitMods = archetype.modulos.filter((mod) => hits(text, mod.claves) > 0);
    const chosen = explicitMods.length > 0 ? explicitMods : archetype.modulos.slice(0, 2);
    for (const mod of chosen) {
      const explicit = explicitMods.includes(mod);
      modules.push({
        nombre: mod.nombre,
        descripcion: mod.descripcion,
        funcionalidades: mod.funcionalidades,
        prioridad: 'importante',
        origen: explicit ? 'explicito' : 'implicito',
        reason: explicit ? 'Mencionado en la descripción del proyecto.' : `Aporta la parte de ${lowerFirst(archetype.label)} del sistema.`,
      });
    }
  }

  const flags: Record<string, ProjectSpec['needsAuth']> = {
    auth: spec.needsAuth,
    api: spec.needsApi,
    panel: spec.needsDashboard,
    reportes: spec.needsExport,
  };
  const all = [primary, ...secondary];
  for (const capability of CAPABILITIES) {
    const flag = flags[capability.id] ?? 'auto';
    if (flag === 'no') continue;
    const mentioned = hits(text, capability.modulo.claves) > 0;
    const explicit = flag === 'si' || mentioned;
    const implicit = capability.implicitFor.includes(primary.style);
    if (!explicit && !implicit) continue;
    capabilities.add(capability.id);
    if (coveredBy(capability.id, all)) continue;
    modules.push({
      nombre: capability.modulo.nombre,
      descripcion: capability.modulo.descripcion,
      funcionalidades: capability.modulo.funcionalidades,
      prioridad: capability.id === 'auth' ? 'esencial' : explicit ? 'importante' : 'opcional',
      origen: explicit ? 'explicito' : 'implicito',
      reason: flag === 'si' ? 'Solicitado en la configuración adicional.' : mentioned ? 'Mencionado en la descripción del proyecto.' : capability.implicitReason,
      capability: capability.id,
    });
  }

  if (spec.mainFeatures.length > 0) {
    modules.push({
      nombre: 'Requerimientos específicos',
      descripcion: 'Funcionalidades principales indicadas en la especificación.',
      funcionalidades: spec.mainFeatures,
      prioridad: 'esencial',
      origen: 'explicito',
      reason: 'Indicadas como funcionalidades principales.',
    });
  }
  if (spec.secondaryFeatures.length > 0) {
    modules.push({
      nombre: 'Funcionalidades secundarias',
      descripcion: 'Funcionalidades deseables indicadas en la especificación.',
      funcionalidades: spec.secondaryFeatures,
      prioridad: 'opcional',
      origen: 'explicito',
      reason: 'Indicadas como funcionalidades secundarias.',
    });
  }

  return { modules: uniqueBy(modules, (mod) => mod.nombre), capabilities };
}

function planRoles(primary: Archetype, spec: ProjectSpec, hasAuth: boolean): RoleDef[] {
  if (spec.roles.length === 0) return primary.roles;
  const roles: RoleDef[] = spec.roles.map((rol) => {
    const isAdmin = /admin/.test(normalize(rol));
    return {
      rol,
      descripcion: isAdmin ? 'Configura el sistema y gestiona usuarios y permisos.' : 'Rol indicado en la especificación.',
      permisos: isAdmin
        ? ['Acceso completo a todos los módulos', 'Gestión de usuarios y roles']
        : ['Acceso a los módulos asignados a su función', 'Permisos detallados a definir al diseñar cada módulo'],
    };
  });
  if (hasAuth && !roles.some((role) => /admin/.test(normalize(role.rol)))) {
    roles.unshift({
      rol: 'Administrador',
      descripcion: 'Configura el sistema y gestiona usuarios y permisos.',
      permisos: ['Acceso completo a todos los módulos', 'Gestión de usuarios y roles'],
    });
  }
  return roles;
}

function baseTechnologies(style: SolutionStyle, capabilities: Set<string>, hasAuth: boolean): TechRow[] {
  const validation: TechRow = { capa: 'Validación', tecnologia: 'Zod', motivo: 'Mismas reglas de validación en la interfaz y en el servidor.' };
  const tests: TechRow = { capa: 'Pruebas', tecnologia: 'Vitest y Playwright', motivo: 'Pruebas unitarias y de los flujos principales de punta a punta.' };
  const db: TechRow = { capa: 'Base de datos', tecnologia: 'PostgreSQL', motivo: 'Base relacional robusta, con integridad referencial y buen soporte de consultas.' };
  const orm: TechRow = { capa: 'Acceso a datos', tecnologia: 'Drizzle ORM con migraciones', motivo: 'Consultas tipadas y cambios de esquema versionados.' };
  const auth: TechRow = { capa: 'Autenticación', tecnologia: 'Sesiones con cookies httpOnly y contraseñas con hash seguro', motivo: 'El control de acceso se verifica siempre en el servidor.' };

  if (style === 'sitio') {
    return [
      { capa: 'Frontend', tecnologia: 'Next.js con React y TypeScript (generación estática)', motivo: 'Páginas rápidas y bien posicionadas en buscadores.' },
      { capa: 'Estilos', tecnologia: 'Tailwind CSS', motivo: 'Diseño consistente y adaptable con poco CSS propio.' },
      { capa: 'Contenido', tecnologia: 'Archivos MDX o un CMS headless', motivo: 'Permite actualizar textos e imágenes sin tocar el código.' },
      { capa: 'Backend', tecnologia: 'Funciones de servidor de Next.js', motivo: 'Suficiente para el formulario de contacto y tareas puntuales.' },
      validation,
      tests,
    ];
  }
  if (style === 'api') {
    return [
      { capa: 'Backend', tecnologia: 'Node.js con TypeScript y Hono', motivo: 'Servicio liviano, tipado y fácil de desplegar.' },
      db,
      orm,
      validation,
      { capa: 'Documentación', tecnologia: 'OpenAPI generado desde los esquemas', motivo: 'El contrato se mantiene sincronizado con el código.' },
      { capa: 'Pruebas', tecnologia: 'Vitest con pruebas de integración de endpoints', motivo: 'Cada endpoint se verifica contra su contrato.' },
    ];
  }
  const rows: TechRow[] = [
    { capa: 'Frontend', tecnologia: 'Next.js con React y TypeScript', motivo: 'Interfaz y servidor en un mismo proyecto, con tipado de punta a punta.' },
    { capa: 'Estilos', tecnologia: 'Tailwind CSS con componentes shadcn/ui', motivo: 'Componentes accesibles y consistentes, fáciles de personalizar.' },
    { capa: 'Backend', tecnologia: 'Route Handlers y Server Actions de Next.js', motivo: 'Lógica de negocio organizada por módulo sin un servicio adicional.' },
    db,
    orm,
    validation,
  ];
  if (hasAuth) rows.push(auth);
  if (capabilities.has('panel') || style === 'datos') {
    rows.push({ capa: 'Gráficos', tecnologia: 'Recharts', motivo: 'Gráficos interactivos integrados con React.' });
  }
  if (style === 'datos') {
    rows.push({ capa: 'Procesamiento de datos', tecnologia: 'Python con pandas en procesos aislados', motivo: 'Transformaciones y análisis con límites de memoria y tiempo, fuera del servidor principal.' });
  }
  rows.push(tests);
  return rows;
}

function planTechnologies(style: SolutionStyle, capabilities: Set<string>, hasAuth: boolean, spec: ProjectSpec): TechRow[] {
  const rows = baseTechnologies(style, capabilities, hasAuth);
  const prefs = [...spec.techPrefs, spec.database].map((p) => p.trim()).filter(Boolean);
  const setRow = (row: TechRow) => {
    const index = rows.findIndex((existing) => existing.capa === row.capa);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  };
  for (const pref of uniqueBy(prefs, (p) => p)) {
    const text = normalize(pref);
    const known = TECH_PREFS.find((candidate) => hits(text, candidate.claves) > 0);
    if (!known) {
      rows.push({ capa: 'Preferencia', tecnologia: pref, motivo: 'Indicada en la especificación; su encaje se valida al definir la arquitectura.' });
      continue;
    }
    setRow({ capa: known.capa, tecnologia: known.tecnologia, motivo: 'Preferencia indicada en la especificación.' });
    if (known.capa === 'Backend' && !/node/i.test(known.tecnologia)) {
      setRow({ capa: 'Acceso a datos', tecnologia: 'ORM y migraciones del framework de backend elegido', motivo: 'Se usa la herramienta nativa del framework.' });
    }
    if (known.capa === 'Base de datos' && /mongo|firebase/i.test(known.tecnologia)) {
      setRow({ capa: 'Acceso a datos', tecnologia: 'SDK oficial de la base de datos elegida', motivo: 'La base no es relacional; el modelo de datos se adapta a documentos.' });
    }
  }
  return rows;
}

function planArchitecture(style: SolutionStyle, capabilities: Set<string>, hasAuth: boolean, spec: ProjectSpec): BlueprintContent['arquitectura'] {
  const background = capabilities.has('notificaciones') || capabilities.has('importacion') || capabilities.has('reportes');
  let estilo: string;
  let capas: { nombre: string; descripcion: string }[];
  if (style === 'sitio') {
    estilo = 'Sitio web con generación estática y contenido administrable';
    capas = [
      { nombre: 'Páginas y componentes', descripcion: 'Páginas generadas de antemano con componentes reutilizables.' },
      { nombre: 'Contenido', descripcion: 'Textos e imágenes separados del código para poder actualizarlos sin programar.' },
      { nombre: 'Funciones de servidor', descripcion: 'Procesan el formulario de contacto y otras acciones puntuales.' },
      { nombre: 'Distribución', descripcion: 'Publicación en una red de distribución de contenido para cargar rápido.' },
    ];
  } else if (style === 'api') {
    estilo = 'Servicio de backend organizado por capas, sin interfaz propia';
    capas = [
      { nombre: 'Entrada HTTP', descripcion: 'Ruteo, validación de entradas, autenticación y límites de uso.' },
      { nombre: 'Casos de uso', descripcion: 'Reglas de negocio independientes del transporte.' },
      { nombre: 'Acceso a datos', descripcion: 'Repositorios con consultas parametrizadas y migraciones.' },
      { nombre: 'Base de datos', descripcion: 'Almacenamiento relacional con integridad referencial.' },
      { nombre: 'Observabilidad', descripcion: 'Logs estructurados, métricas y chequeos de salud.' },
    ];
  } else if (style === 'datos') {
    estilo = 'Aplicación web con un servicio de procesamiento de datos aislado';
    capas = [
      { nombre: 'Interfaz', descripcion: 'Exploración de datos, dashboards y configuración.' },
      { nombre: 'API de aplicación', descripcion: 'Proyectos, permisos, definiciones de métricas y dashboards.' },
      { nombre: 'Motor de procesamiento', descripcion: 'Importación, transformación y análisis en procesos aislados con límites de recursos.' },
      { nombre: 'Almacenamiento', descripcion: 'Base operacional para la aplicación y tablas analíticas para los datos importados.' },
      { nombre: 'Orquestación', descripcion: 'Ejecuciones programadas, reintentos y registro de cada corrida.' },
    ];
  } else {
    estilo = 'Aplicación web full-stack con arquitectura modular (monolito modular)';
    capas = [
      { nombre: 'Interfaz', descripcion: 'Pantallas por módulo construidas con componentes reutilizables.' },
      { nombre: 'Lógica de aplicación', descripcion: 'Servicios por módulo con validación de entradas y reglas de negocio.' },
      { nombre: 'Acceso a datos', descripcion: 'Repositorios con consultas tipadas y migraciones versionadas.' },
      { nombre: 'Base de datos', descripcion: 'Modelo relacional con claves foráneas e índices.' },
    ];
    if (capabilities.has('api')) capas.push({ nombre: 'API pública', descripcion: 'Endpoints documentados para integrar otros sistemas.' });
    if (background) capas.push({ nombre: 'Tareas en segundo plano', descripcion: 'Envíos, importaciones y reportes fuera del ciclo de la solicitud.' });
  }

  const decisiones = ['Módulos independientes con límites claros, para crecer sin reescribir lo existente.'];
  const scale = spec.approxUsers;
  if (scale === '10000+') {
    decisiones.push('Preparada para escalar horizontalmente: servicios sin estado, caché, colas y réplicas de lectura.');
  } else if (scale === '1001-10000') {
    decisiones.push('Caché para lecturas frecuentes y tareas pesadas en segundo plano, dada la escala prevista.');
  } else if (scale === '101-1000') {
    decisiones.push('Un único servicio con índices y paginación desde el inicio alcanza para la escala prevista.');
  } else if (scale) {
    decisiones.push('Un único servicio y una base de datos alcanzan para la escala prevista; se evita complejidad innecesaria.');
  } else {
    decisiones.push('Escala no especificada: se diseña para una organización mediana y se deja preparado el crecimiento.');
  }
  if (hasAuth) decisiones.push('La autorización se verifica siempre en el servidor, nunca sólo en la interfaz.');
  if (capabilities.has('multiempresa')) decisiones.push('El aislamiento por organización se aplica en la capa de acceso a datos y se cubre con pruebas.');
  const locale = [
    spec.language ? `interfaz en ${lowerFirst(spec.language)}` : '',
    spec.timezone ? `fechas guardadas en UTC y mostradas en ${spec.timezone}` : '',
    spec.currency ? `importes en ${spec.currency}` : '',
  ].filter(Boolean);
  if (locale.length > 0) decisiones.push(`Regionalización: ${listText(locale)}.`);
  return { estilo, capas, decisiones };
}

function planIntegrations(spec: ProjectSpec, text: string): BlueprintContent['integraciones'] {
  const result: BlueprintContent['integraciones'] = spec.integrations.map((nombre) => ({
    nombre,
    proposito: 'Indicada en la especificación.',
    estado: 'requerida' as const,
  }));
  const requested = normalize(spec.integrations.join(' | '));
  for (const signal of INTEGRATION_SIGNALS) {
    if (hits(text, signal.claves) === 0) continue;
    if (hits(requested, signal.claves) > 0) continue;
    result.push({ nombre: signal.nombre, proposito: signal.proposito, estado: 'sugerida' });
  }
  return uniqueBy(result, (integration) => integration.nombre);
}

function planRisks(a: { primary: Archetype; secondary: Archetype[]; capabilities: Set<string>; integrations: BlueprintContent['integraciones']; words: number; spec: ProjectSpec }): RiskDef[] {
  const risks: RiskDef[] = [...a.primary.riesgos, ...a.secondary.flatMap((archetype) => archetype.riesgos.slice(0, 1))];
  if (a.integrations.length > 0) {
    risks.push({ riesgo: 'Dependencia de servicios externos y de sus credenciales de acceso.', impacto: 'medio', mitigacion: 'Adaptador por integración, modo de prueba y manejo explícito de fallas y reintentos.' });
  }
  if (a.capabilities.has('importacion')) {
    risks.push({ riesgo: 'Migración de datos existentes con formatos irregulares.', impacto: 'medio', mitigacion: 'Importación con vista previa, validación por fila y posibilidad de corregir y reintentar.' });
  }
  if (a.capabilities.has('pagos')) {
    risks.push({ riesgo: 'Manejo de pagos: seguridad y conciliación.', impacto: 'alto', mitigacion: 'Delegar los datos de tarjetas en la pasarela y confirmar cada cobro mediante webhooks verificados.' });
  }
  if (a.spec.approxUsers === '10000+') {
    risks.push({ riesgo: 'Carga elevada en horarios pico.', impacto: 'medio', mitigacion: 'Pruebas de carga antes de publicar y monitoreo de tiempos de respuesta.' });
  }
  if (a.words < 25) {
    risks.push({ riesgo: 'La descripción inicial es breve y puede omitir requerimientos importantes.', impacto: 'medio', mitigacion: 'Revisar este Blueprint con los futuros usuarios y ampliar la especificación antes de generar la aplicación.' });
  }
  return uniqueBy(risks, (risk) => risk.riesgo).slice(0, 9);
}

function analyze(input: EngineInput): Analysis {
  const { spec } = input;
  const text = normalize(
    [input.name, spec.description, spec.appType, ...spec.mainFeatures, ...spec.secondaryFeatures, ...Object.values(spec.answers)].join(' \n '),
  );
  const words = spec.description.trim().split(/\s+/).filter(Boolean).length;
  const { primary, secondary, detected, suggested } = pickArchetypes(input.categories, text);
  const { modules, capabilities } = planModules(primary, secondary, detected, spec, text);
  const hasAuth = capabilities.has('auth');

  const capabilityEntities = CAPABILITIES.filter((c) => capabilities.has(c.id) && !coveredBy(c.id, [primary, ...secondary])).flatMap((c) => c.entidades);
  const entities = uniqueBy(
    [...primary.entidades, ...secondary.flatMap((archetype) => archetype.entidades.slice(0, 3)), ...capabilityEntities],
    (entity) => entity.entidad,
  );
  const integrations = planIntegrations(spec, text);

  return {
    input,
    text,
    words,
    primary,
    secondary,
    detected,
    suggestedCategories: suggested,
    modules,
    capabilities,
    hasAuth,
    entities,
    roles: planRoles(primary, spec, hasAuth),
    technologies: planTechnologies(primary.style, capabilities, hasAuth, spec),
    integrations,
    risks: planRisks({ primary, secondary, capabilities, integrations, words, spec }),
    architecture: planArchitecture(primary.style, capabilities, hasAuth, spec),
  };
}

const solutionType = (a: Analysis) =>
  a.secondary.length === 0 ? a.primary.label : `Sistema híbrido: ${listText([a.primary, ...a.secondary].map((archetype) => lowerFirst(archetype.label)))}`;

const displayName = (a: Analysis) => a.input.name.trim() || 'Proyecto sin nombre';

// ---------- interpretación ----------

const PEOPLE_WORDS = ['usuario', 'vendedor', 'cliente', 'empleado', 'equipo', 'alumno', 'estudiante', 'paciente', 'administrador', 'operador', 'gerente', 'personal\\b', 'miembro', 'analista', 'proveedor', 'docente', 'tecnico'];

function questions(a: Analysis): Interpretation['questions'] {
  const { spec } = a.input;
  const answered = (id: string) => (spec.answers[id] ?? '').trim().length > 0;
  const list: Interpretation['questions'] = [];
  const ask = (id: string, question: string, why: string) => {
    if (!answered(id) && list.length < 3) list.push({ id, question, why });
  };
  const style = a.primary.style;

  if (a.primary.id === 'personalizado' && a.words < 40) {
    ask('tipo', '¿Qué tipo de solución tenés en mente? Por ejemplo: un sistema de gestión, un tablero de datos, una tienda, un sitio web.', 'No pude identificar el tipo de solución a partir de la descripción ni de las categorías.');
  }
  if (a.words < 20) {
    ask('problema', '¿Qué problema concreto querés resolver y cómo lo resuelven hoy?', 'La descripción es breve; con más contexto el Blueprint se ajusta mejor a tu caso.');
  }
  const mentionsPeople = hits(a.text, PEOPLE_WORDS) > 0;
  if (!spec.audience && spec.roles.length === 0 && !mentionsPeople && (style === 'aplicacion' || style === 'datos') && a.words < 60) {
    ask('usuarios', '¿Quiénes van a usar la aplicación y qué necesita hacer cada tipo de usuario?', 'Con esa información se definen los roles, los permisos y las pantallas.');
  }
  if (style === 'datos' && hits(a.text, ['excel', 'csv\\b', 'base de datos', 'api\\b', 'archivo', 'planilla', 'sistema', 'sql']) === 0) {
    ask('datos', '¿De dónde provienen los datos: archivos Excel o CSV, una base de datos u otro sistema?', 'El origen de los datos determina los conectores y el proceso de importación.');
  }
  const explicitModules = a.modules.filter((mod) => mod.origen === 'explicito').length;
  if (spec.mainFeatures.length === 0 && explicitModules === 0 && a.words < 25) {
    ask('funciones', '¿Cuáles son las tres funciones que no pueden faltar en la primera versión?', 'Ayuda a priorizar los módulos esenciales.');
  }
  return list;
}

function components(a: Analysis): string[] {
  const style = a.primary.style;
  const list: string[] = [];
  if (style === 'api') list.push('Servicio HTTP con endpoints versionados', 'Base de datos relacional', 'Documentación OpenAPI');
  else if (style === 'sitio') list.push('Sitio web adaptable', 'Gestor de contenido', 'Formulario de contacto con envío por email');
  else list.push('Interfaz web adaptable', 'API de aplicación', 'Base de datos relacional');
  if (style === 'datos') list.push('Motor de procesamiento de datos aislado');
  if (a.hasAuth) list.push('Autenticación y control de permisos');
  if (a.capabilities.has('panel')) list.push('Panel de indicadores con gráficos');
  if (a.capabilities.has('reportes')) list.push('Generación de reportes y exportación');
  if (a.capabilities.has('notificaciones')) list.push('Servicio de notificaciones');
  if (a.capabilities.has('archivos')) list.push('Almacenamiento de archivos');
  if (a.capabilities.has('importacion')) list.push('Importador de datos con validación');
  if (a.capabilities.has('pagos')) list.push('Integración con pasarela de pagos');
  if (a.capabilities.has('auditoria')) list.push('Registro de auditoría');
  return list;
}

export function interpret(input: EngineInput): Interpretation {
  const a = analyze(input);
  const essential = a.modules.filter((mod) => mod.prioridad === 'esencial').map((mod) => lowerFirst(mod.nombre));
  const implicit = a.modules.filter((mod) => mod.origen === 'implicito').length;
  const origin = a.detected
    ? 'El tipo de solución se identificó a partir de la descripción.'
    : a.primary.id === 'personalizado'
      ? 'No se identificó un tipo de solución conocido; se propone una base a medida.'
      : 'El tipo de solución surge de las categorías elegidas.';
  const summary = `${displayName(a)} se interpreta como: ${lowerFirst(solutionType(a))}. ${origin} Se proponen ${a.modules.length} módulos; los esenciales son ${listText(essential)}. ${implicit > 0 ? `${implicit} de ellos no fueron pedidos de forma explícita y se agregan porque este tipo de solución los necesita.` : 'Todos surgen de lo que pediste.'}`;

  const confidence: Interpretation['confidence'] =
    a.primary.id === 'personalizado' || a.words < 20 ? 'baja' : a.words >= 60 ? 'alta' : 'media';

  return {
    solutionType: solutionType(a),
    summary: clip(summary, 2000),
    confidence,
    suggestedCategories: a.suggestedCategories,
    features: a.modules.map((mod) => ({ name: mod.nombre, origin: mod.origen, reason: mod.reason || 'Parte del tipo de solución.' })),
    components: components(a),
    architecture: `${a.architecture.estilo}. ${a.architecture.decisiones[1] ?? ''}`.trim(),
    technologies: a.technologies,
    entities: a.entities.map((entity) => entity.entidad),
    roles: a.roles.map((role) => role.rol),
    integrations: a.integrations.map((integration) => integration.nombre),
    challenges: a.risks.map((risk) => risk.riesgo),
    questions: questions(a),
  };
}

// ---------- blueprint ----------

function navigation(a: Analysis): BlueprintContent['navegacion'] {
  const style = a.primary.style;
  const names = (priority: Priority) => a.modules.filter((mod) => mod.prioridad === priority && !mod.capability).map((mod) => mod.nombre);
  if (style === 'sitio') {
    const pages = a.primary.id === 'contenido' ? ['Portada', 'Artículo', 'Categoría', 'Búsqueda', 'Autor'] : ['Inicio', 'Servicios o productos', 'Quiénes somos', 'Contacto'];
    return [
      { seccion: 'Páginas públicas', pantallas: pages },
      { seccion: 'Administración de contenido', pantallas: ['Listado de contenidos', 'Editor', 'Consultas recibidas'] },
    ];
  }
  if (style === 'api') {
    return [
      { seccion: 'Grupos de endpoints', pantallas: a.modules.filter((mod) => mod.prioridad !== 'opcional').map((mod) => mod.nombre) },
      { seccion: 'Portal de documentación', pantallas: ['Referencia de la API', 'Guía de inicio', 'Registro de cambios'] },
    ];
  }
  const nav: BlueprintContent['navegacion'] = [
    { seccion: 'Inicio', pantallas: [a.capabilities.has('panel') ? 'Panel de indicadores' : 'Resumen y pendientes'] },
  ];
  const core = names('esencial');
  if (core.length > 0) nav.push({ seccion: 'Operación', pantallas: core });
  const management = [...names('importante'), ...names('opcional')];
  if (management.length > 0) nav.push({ seccion: 'Gestión', pantallas: management });
  const admin: string[] = [];
  if (a.hasAuth) admin.push('Usuarios y roles');
  if (a.capabilities.has('auditoria')) admin.push('Auditoría');
  if (a.capabilities.has('importacion')) admin.push('Importación de datos');
  admin.push('Configuración');
  nav.push({ seccion: 'Administración', pantallas: admin });
  return nav;
}

const weeks = (n: number) => (n === 1 ? '1 semana' : `${n} semanas`);

function schedule(a: Analysis): BlueprintContent['cronograma'] {
  const of = (priority: Priority) => a.modules.filter((mod) => mod.prioridad === priority);
  const essential = of('esencial');
  const important = of('importante');
  const optional = of('opcional');
  const foundations = ['Estructura del proyecto y entorno de desarrollo', `Modelo de datos inicial (${a.entities.length} entidades) con migraciones`];
  if (a.hasAuth) foundations.push('Autenticación, roles y permisos');
  foundations.push('Diseño base: navegación, componentes y estilos');

  const stages: BlueprintContent['cronograma'] = [
    { etapa: 'Fundaciones', entregables: foundations, duracionEstimada: weeks(a.modules.length > 7 ? 2 : 1) },
  ];
  if (essential.length > 0) {
    stages.push({ etapa: 'Módulos esenciales', entregables: essential.map((mod) => mod.nombre), duracionEstimada: weeks(Math.max(1, Math.ceil(essential.length * 0.75))) });
  }
  if (important.length > 0) {
    stages.push({ etapa: 'Módulos importantes', entregables: important.map((mod) => mod.nombre), duracionEstimada: weeks(Math.max(1, Math.ceil(important.length * 0.5))) });
  }
  const extras = [...optional.map((mod) => mod.nombre), ...a.integrations.map((integration) => `Integración: ${integration.nombre}`)];
  if (extras.length > 0) {
    stages.push({ etapa: 'Opcionales e integraciones', entregables: extras, duracionEstimada: weeks(Math.max(1, Math.ceil(extras.length * 0.5))) });
  }
  stages.push({
    etapa: 'Pruebas, ajustes y publicación',
    entregables: ['Pruebas de los flujos principales', 'Corrección de errores y ajustes de usabilidad', 'Preparación del entorno de publicación'],
    duracionEstimada: weeks(1),
  });
  return stages;
}

function acceptance(a: Analysis): string[] {
  const criteria = a.modules
    .filter((mod) => mod.prioridad === 'esencial')
    .map((mod) => `${mod.nombre}: ${lowerFirst(listText(mod.funcionalidades.slice(0, 3).map(lowerFirst)))} funcionan de punta a punta con datos reales.`);
  if (a.hasAuth) criteria.push('Cada rol accede únicamente a las funciones que le corresponden, y el control se aplica en el servidor.');
  if (a.capabilities.has('reportes')) criteria.push('Los listados principales se pueden exportar a Excel o CSV.');
  if (a.primary.style !== 'api') criteria.push('La aplicación se usa correctamente en escritorio, tablet y móvil.');
  criteria.push('Los datos se conservan entre sesiones y los errores se informan con mensajes claros.');
  criteria.push('Los flujos principales cuentan con pruebas automatizadas que pasan.');
  return criteria.map((c) => clip(c, 600));
}

export function buildBlueprint(input: EngineInput): BlueprintContent {
  const a = analyze(input);
  const { spec } = input;
  const audience = spec.audience ? ` destinada a ${lowerFirst(spec.audience.replace(/\.$/, ''))}` : '';
  const scale = spec.approxUsers ? ` Escala prevista: ${SCALE_LABEL[spec.approxUsers]}.` : '';
  const need = spec.description.trim() ? ` Necesidad descripta: «${clip(spec.description.trim().replace(/\s+/g, ' '), 1500)}»` : '';
  const moduleNames = a.modules.filter((mod) => mod.prioridad !== 'opcional').map((mod) => lowerFirst(mod.nombre));
  const descripcionFuncional = `${displayName(a)} es una solución del tipo ${lowerFirst(solutionType(a))}${audience}.${scale} Sus módulos principales son ${listText(moduleNames)}.${need}`;

  const visual = spec.visualPrefs.trim();
  const lineamientos = [
    'Diseño adaptable a escritorio, tablet y móvil.',
    'Tema claro por defecto y tema oscuro opcional.',
    'Componentes consistentes y accesibles: contraste suficiente, foco visible y navegación por teclado.',
    `Idioma de la interfaz: ${spec.language || 'Español'}.`,
  ];
  if (spec.currency) lineamientos.push(`Importes expresados en ${spec.currency}.`);
  if (spec.timezone) lineamientos.push(`Fechas y horas en la zona ${spec.timezone}.`);

  return {
    resumen: { nombre: clip(displayName(a), 160), tipoSolucion: solutionType(a), descripcionFuncional: clip(descripcionFuncional, 4000) },
    objetivos: uniqueBy([...a.primary.objetivos, ...a.secondary.flatMap((archetype) => archetype.objetivos.slice(0, 1))], (o) => o),
    arquitectura: a.architecture,
    modulos: a.modules.map(({ nombre, descripcion, funcionalidades, prioridad, origen }) => ({ nombre, descripcion, funcionalidades, prioridad, origen })),
    rolesUsuarios: a.roles,
    modeloDatos: a.entities,
    navegacion: navigation(a),
    tecnologias: a.technologies,
    integraciones: a.integrations,
    diseno: {
      estilo: visual || 'Interfaz limpia y profesional, enfocada en la productividad: navegación clara, tablas legibles y formularios simples.',
      paleta: visual ? 'Según las preferencias visuales indicadas, sobre una base neutra.' : 'Base neutra con un color de acción; se ajusta a la identidad de la organización.',
      lineamientos,
    },
    cronograma: schedule(a),
    riesgos: a.risks,
    criteriosAceptacion: acceptance(a),
  };
}
