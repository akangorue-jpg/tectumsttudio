import { z } from 'zod';

/**
 * Esquemas Zod: única fuente de verdad para validación de entradas y tipos del dominio.
 * Los usan por igual el backend, el motor de Blueprint y la interfaz.
 */

const text = (max: number) => z.string().trim().max(max);
const list = (itemMax: number, max: number) => z.array(text(itemMax).min(1)).max(max);

export const triState = z.enum(['auto', 'si', 'no']);
export type TriState = z.infer<typeof triState>;

export const APPROX_USERS = ['', '1-10', '11-100', '101-1000', '1001-10000', '10000+'] as const;

export const specSchema = z.object({
  description: text(20000).default(''),
  unsure: z.boolean().default(false),
  appType: text(200).default(''),
  audience: text(500).default(''),
  approxUsers: z.enum(APPROX_USERS).default(''),
  roles: list(80, 20).default([]),
  mainFeatures: list(200, 40).default([]),
  secondaryFeatures: list(200, 40).default([]),
  integrations: list(80, 30).default([]),
  visualPrefs: text(1000).default(''),
  techPrefs: list(60, 20).default([]),
  database: text(60).default(''),
  needsAuth: triState.default('auto'),
  needsApi: triState.default('auto'),
  needsDashboard: triState.default('auto'),
  needsExport: triState.default('auto'),
  language: text(40).default('Español'),
  currency: text(20).default(''),
  timezone: text(60).default(''),
  answers: z.record(text(2000)).default({}),
});
export type ProjectSpec = z.infer<typeof specSchema>;
export const emptySpec = (): ProjectSpec => specSchema.parse({});

export const PROJECT_STATUSES = ['borrador', 'en_desarrollo', 'publicado', 'pausado', 'archivado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STAGES = ['especificacion', 'interpretacion', 'blueprint', 'aprobado'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const registerInput = z.object({
  name: text(80).min(2, 'Ingresá tu nombre.'),
  email: z.string().trim().toLowerCase().email('Ingresá un email válido.').max(200),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200),
});
export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un email válido.').max(200),
  password: z.string().min(1, 'Ingresá tu contraseña.').max(200),
});
export const profileInput = z.object({
  name: text(80).min(2).optional(),
  theme: z.enum(['claro', 'oscuro']).optional(),
  locale: z.enum(['es']).optional(),
});

export const projectCreateInput = z.object({
  name: text(120).default(''),
  categories: z.array(text(60)).max(12).default([]),
  spec: specSchema.partial().default({}),
});
export const projectUpdateInput = z.object({
  name: text(120).min(1, 'El proyecto necesita un nombre.').optional(),
  categories: z.array(text(60)).max(12).optional(),
  spec: specSchema.partial().optional(),
  /**
   * `activo` reactiva el proyecto (vuelve a borrador o en desarrollo según su etapa).
   * `publicado` no se asigna a mano: lo establece el módulo de despliegue.
   */
  status: z.enum(['activo', 'pausado', 'archivado']).optional(),
});

// ---------- Interpretación y Blueprint ----------

const s = (max = 600) => z.string().trim().min(1).max(max);
const priority = z.enum(['esencial', 'importante', 'opcional']);
const origin = z.enum(['explicito', 'implicito']);

export const interpretationSchema = z.object({
  solutionType: s(200),
  summary: s(2000),
  confidence: z.enum(['alta', 'media', 'baja']),
  suggestedCategories: z.array(s(60)).max(6).default([]),
  features: z.array(z.object({ name: s(200), origin, reason: s(400) })).max(60),
  components: z.array(s(200)).max(40),
  architecture: s(1500),
  technologies: z.array(z.object({ capa: s(80), tecnologia: s(200), motivo: s(400) })).max(30),
  entities: z.array(s(80)).max(60),
  roles: z.array(s(80)).max(30),
  integrations: z.array(s(120)).max(30),
  challenges: z.array(s(500)).max(20),
  questions: z.array(z.object({ id: s(60), question: s(400), why: s(400) })).max(6),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

export const blueprintSchema = z.object({
  resumen: z.object({ nombre: s(160), tipoSolucion: s(200), descripcionFuncional: s(4000) }),
  objetivos: z.array(s()).min(1).max(20),
  arquitectura: z.object({
    estilo: s(300),
    capas: z.array(z.object({ nombre: s(120), descripcion: s(800) })).min(1).max(15),
    decisiones: z.array(s(800)).max(20),
  }),
  modulos: z
    .array(
      z.object({
        nombre: s(160),
        descripcion: s(800),
        funcionalidades: z.array(s(400)).min(1).max(25),
        prioridad: priority,
        origen: origin,
      }),
    )
    .min(1)
    .max(40),
  rolesUsuarios: z.array(z.object({ rol: s(100), descripcion: s(500), permisos: z.array(s(300)).max(20) })).max(20),
  modeloDatos: z
    .array(
      z.object({
        entidad: s(80),
        descripcion: s(500),
        campos: z.array(z.object({ nombre: s(80), tipo: s(80) })).min(1).max(40),
        relaciones: z.array(s(300)).max(15),
      }),
    )
    .max(50),
  navegacion: z.array(z.object({ seccion: s(120), pantallas: z.array(s(200)).max(20) })).max(40),
  tecnologias: z.array(z.object({ capa: s(80), tecnologia: s(200), motivo: s(400) })).min(1).max(30),
  integraciones: z.array(z.object({ nombre: s(120), proposito: s(400), estado: z.enum(['requerida', 'sugerida']) })).max(30),
  diseno: z.object({ estilo: s(600), paleta: s(400), lineamientos: z.array(s(400)).max(15) }),
  cronograma: z.array(z.object({ etapa: s(160), entregables: z.array(s(300)).max(20), duracionEstimada: s(80) })).min(1).max(15),
  riesgos: z.array(z.object({ riesgo: s(500), impacto: z.enum(['alto', 'medio', 'bajo']), mitigacion: s(600) })).max(25),
  criteriosAceptacion: z.array(s(600)).min(1).max(40),
});
export type BlueprintContent = z.infer<typeof blueprintSchema>;

export const BLUEPRINT_SOURCES = ['motor_local', 'anthropic', 'openai', 'claude_integrado'] as const;
export type BlueprintSource = (typeof BLUEPRINT_SOURCES)[number];

export const blueprintCreateInput = z.object({ engine: z.enum(['auto', 'local']).default('auto') });

export const PROVIDER_IDS = ['anthropic', 'openai'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const providerConnectInput = z.object({
  apiKey: z.string().trim().min(8, 'La API Key parece incompleta.').max(400),
});
export const providerUpdateInput = z.object({
  model: text(120).min(1).optional(),
  primary: z.boolean().optional(),
});

/** Convierte el primer error de Zod en un mensaje legible. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Los datos enviados no son válidos.';
  const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}
