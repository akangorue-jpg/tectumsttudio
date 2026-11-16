import type {
  BlueprintContent,
  BlueprintSource,
  Interpretation,
  ProjectSpec,
  ProjectStage,
  ProjectStatus,
  ProviderId,
} from './schemas';

export type { BlueprintContent, BlueprintSource, Interpretation, ProjectSpec, ProjectStage, ProjectStatus, ProviderId };

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'miembro';
  theme: 'claro' | 'oscuro';
  locale: 'es';
  createdAt: number;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  status: ProjectStatus;
  stage: ProjectStage;
  categories: string[];
  spec: ProjectSpec;
  /** Última vez que cambió la especificación o las categorías (para detectar Blueprints desactualizados). */
  specUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}

export type BlueprintStatus = 'borrador' | 'aprobado' | 'reemplazado';

export interface Blueprint {
  id: string;
  projectId: string;
  version: number;
  status: BlueprintStatus;
  source: BlueprintSource;
  model: string | null;
  interpretation: Interpretation;
  content: BlueprintContent;
  /** Avisos sobre cómo se generó (por ejemplo, si la IA falló y se usó el motor local). */
  notes: string[];
  createdAt: number;
  approvedAt: number | null;
}

export type ActivityActor = 'usuario' | 'aura' | 'sistema';
export type ActivityLevel = 'info' | 'advertencia' | 'error';

export interface Activity {
  id: string;
  userId: string;
  projectId: string | null;
  projectName: string | null;
  type: string;
  actor: ActivityActor;
  level: ActivityLevel;
  summary: string;
  createdAt: number;
}

export type ProviderStatus = 'conectado' | 'error';

/** Vista pública de un proveedor de IA: nunca incluye la credencial. */
export interface ProviderView {
  id: ProviderId | 'gemini' | 'claude_integrado';
  label: string;
  availability: 'implementado' | 'pendiente' | 'integrado';
  connected: boolean;
  status: ProviderStatus | null;
  keyHint: string | null;
  model: string | null;
  models: { id: string; label: string }[];
  primary: boolean;
  lastVerifiedAt: number | null;
  lastError: string | null;
  usage: { calls: number; inputTokens: number; outputTokens: number };
}

export interface DashboardData {
  counts: {
    total: number;
    activos: number;
    borradores: number;
    publicados: number;
    pausados: number;
    archivados: number;
    versiones: number;
  };
  recent: Project[];
  activity: Activity[];
  ai: {
    connected: number;
    primaryLabel: string | null;
    usage: { calls: number; inputTokens: number; outputTokens: number } | null;
  };
}

export interface Meta {
  version: string;
  mode: 'servidor' | 'demo';
  /** Si el entorno puede guardar credenciales de forma segura (sólo el backend). */
  secureSecrets: boolean;
  builtinAi: string | null;
  limits: { attachmentBytes: number };
}

export interface ProjectDetail {
  project: Project;
  attachments: Attachment[];
  blueprints: Blueprint[];
}
