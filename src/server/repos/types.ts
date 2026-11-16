/**
 * Contratos de persistencia. La lógica de negocio depende sólo de estas interfaces:
 * hoy hay una implementación SQLite (servidor) y una en memoria (pruebas y modo demostración);
 * PostgreSQL con Drizzle se incorpora implementando el mismo contrato.
 */
import type { Activity, Attachment, Blueprint, Project, ProviderId, ProviderStatus, User } from '../../core/types';

export interface UserRecord extends User {
  passwordHash: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  userAgent: string;
  createdAt: number;
  expiresAt: number;
}

export interface BlueprintRecord extends Blueprint {
  ownerId: string;
}

export interface AttachmentRecord extends Attachment {
  storageKey: string;
}

export interface ProviderRecord {
  userId: string;
  provider: ProviderId;
  encryptedKey: string;
  keyHint: string;
  model: string | null;
  models: { id: string; label: string }[];
  status: ProviderStatus;
  primary: boolean;
  lastVerifiedAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface UsageRecord {
  id: string;
  userId: string;
  provider: string;
  model: string | null;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: number;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Repos {
  users: {
    create(user: UserRecord): Promise<void>;
    byEmail(email: string): Promise<UserRecord | null>;
    byId(id: string): Promise<UserRecord | null>;
    update(id: string, patch: Partial<Pick<UserRecord, 'name' | 'theme' | 'locale'>>): Promise<void>;
    count(): Promise<number>;
  };
  sessions: {
    create(session: SessionRecord): Promise<void>;
    byTokenHash(tokenHash: string): Promise<SessionRecord | null>;
    delete(tokenHash: string): Promise<void>;
    deleteExpired(now: number): Promise<void>;
  };
  projects: {
    create(project: Project): Promise<void>;
    byId(id: string): Promise<Project | null>;
    listByOwner(ownerId: string): Promise<Project[]>;
    update(id: string, patch: Partial<Omit<Project, 'id' | 'ownerId' | 'createdAt'>>): Promise<void>;
    /** Elimina el proyecto junto con sus blueprints y adjuntos. */
    delete(id: string): Promise<void>;
  };
  blueprints: {
    create(blueprint: BlueprintRecord): Promise<void>;
    byId(id: string): Promise<BlueprintRecord | null>;
    listByProject(projectId: string): Promise<BlueprintRecord[]>;
    update(id: string, patch: Partial<Pick<BlueprintRecord, 'status' | 'approvedAt'>>): Promise<void>;
    countByOwner(ownerId: string): Promise<number>;
  };
  attachments: {
    create(attachment: AttachmentRecord): Promise<void>;
    byId(id: string): Promise<AttachmentRecord | null>;
    listByProject(projectId: string): Promise<AttachmentRecord[]>;
    delete(id: string): Promise<void>;
  };
  activity: {
    add(entry: Activity): Promise<void>;
    list(filter: { userId: string; projectId?: string; limit: number }): Promise<Activity[]>;
  };
  providers: {
    upsert(record: ProviderRecord): Promise<void>;
    get(userId: string, provider: ProviderId): Promise<ProviderRecord | null>;
    list(userId: string): Promise<ProviderRecord[]>;
    delete(userId: string, provider: ProviderId): Promise<void>;
  };
  usage: {
    add(record: UsageRecord): Promise<void>;
    totals(userId: string): Promise<Record<string, UsageTotals>>;
  };
}
