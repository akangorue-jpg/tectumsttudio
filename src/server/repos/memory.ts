/**
 * Repositorios en memoria. Se usan en las pruebas y en el modo demostración del navegador,
 * donde `onChange` permite guardar una copia (por ejemplo en localStorage).
 */
import type { Activity, Project } from '../../core/types';
import type { AttachmentRecord, BlueprintRecord, ProviderRecord, Repos, SessionRecord, UsageRecord, UsageTotals, UserRecord } from './types';

export interface MemoryData {
  users: UserRecord[];
  sessions: SessionRecord[];
  projects: Project[];
  blueprints: BlueprintRecord[];
  attachments: AttachmentRecord[];
  activity: Activity[];
  providers: ProviderRecord[];
  usage: UsageRecord[];
}

export const emptyMemoryData = (): MemoryData => ({
  users: [],
  sessions: [],
  projects: [],
  blueprints: [],
  attachments: [],
  activity: [],
  providers: [],
  usage: [],
});

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryRepos(data: MemoryData = emptyMemoryData(), onChange: (data: MemoryData) => void = () => {}): Repos {
  const changed = () => onChange(data);
  const patchIn = <T extends object>(list: T[], match: (item: T) => boolean, patch: object) => {
    const item = list.find(match);
    if (item) {
      // Los campos undefined significan "sin cambios", igual que en la implementación SQL.
      const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
      Object.assign(item, clone(defined));
    }
    changed();
  };
  const removeFrom = <T>(key: keyof MemoryData, keep: (item: T) => boolean) => {
    (data[key] as unknown as T[]) = (data[key] as unknown as T[]).filter(keep);
  };

  return {
    users: {
      async create(user) {
        data.users.push(clone(user));
        changed();
      },
      async byEmail(email) {
        return clone(data.users.find((u) => u.email === email) ?? null);
      },
      async byId(id) {
        return clone(data.users.find((u) => u.id === id) ?? null);
      },
      async update(id, patch) {
        patchIn(data.users, (u) => u.id === id, patch);
      },
      async count() {
        return data.users.length;
      },
    },
    sessions: {
      async create(session) {
        data.sessions.push(clone(session));
        changed();
      },
      async byTokenHash(tokenHash) {
        return clone(data.sessions.find((s) => s.tokenHash === tokenHash) ?? null);
      },
      async delete(tokenHash) {
        removeFrom<SessionRecord>('sessions', (s) => s.tokenHash !== tokenHash);
        changed();
      },
      async deleteExpired(now) {
        removeFrom<SessionRecord>('sessions', (s) => s.expiresAt > now);
        changed();
      },
    },
    projects: {
      async create(project) {
        data.projects.push(clone(project));
        changed();
      },
      async byId(id) {
        return clone(data.projects.find((p) => p.id === id) ?? null);
      },
      async listByOwner(ownerId) {
        return clone(data.projects.filter((p) => p.ownerId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt));
      },
      async update(id, patch) {
        patchIn(data.projects, (p) => p.id === id, patch);
      },
      async delete(id) {
        removeFrom<Project>('projects', (p) => p.id !== id);
        removeFrom<BlueprintRecord>('blueprints', (b) => b.projectId !== id);
        removeFrom<AttachmentRecord>('attachments', (a) => a.projectId !== id);
        changed();
      },
    },
    blueprints: {
      async create(blueprint) {
        data.blueprints.push(clone(blueprint));
        changed();
      },
      async byId(id) {
        return clone(data.blueprints.find((b) => b.id === id) ?? null);
      },
      async listByProject(projectId) {
        return clone(data.blueprints.filter((b) => b.projectId === projectId).sort((a, b) => b.version - a.version));
      },
      async update(id, patch) {
        patchIn(data.blueprints, (b) => b.id === id, patch);
      },
      async countByOwner(ownerId) {
        return data.blueprints.filter((b) => b.ownerId === ownerId).length;
      },
    },
    attachments: {
      async create(attachment) {
        data.attachments.push(clone(attachment));
        changed();
      },
      async byId(id) {
        return clone(data.attachments.find((a) => a.id === id) ?? null);
      },
      async listByProject(projectId) {
        return clone(data.attachments.filter((a) => a.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt));
      },
      async delete(id) {
        removeFrom<AttachmentRecord>('attachments', (a) => a.id !== id);
        changed();
      },
    },
    activity: {
      async add(entry) {
        data.activity.push(clone(entry));
        changed();
      },
      async list({ userId, projectId, limit }) {
        return clone(
          data.activity
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.userId === userId && (!projectId || entry.projectId === projectId))
            .sort((a, b) => b.entry.createdAt - a.entry.createdAt || b.index - a.index)
            .slice(0, limit)
            .map(({ entry }) => entry),
        );
      },
    },
    providers: {
      async upsert(record) {
        removeFrom<ProviderRecord>('providers', (p) => !(p.userId === record.userId && p.provider === record.provider));
        data.providers.push(clone(record));
        changed();
      },
      async get(userId, provider) {
        return clone(data.providers.find((p) => p.userId === userId && p.provider === provider) ?? null);
      },
      async list(userId) {
        return clone(data.providers.filter((p) => p.userId === userId));
      },
      async delete(userId, provider) {
        removeFrom<ProviderRecord>('providers', (p) => !(p.userId === userId && p.provider === provider));
        changed();
      },
    },
    usage: {
      async add(record) {
        data.usage.push(clone(record));
        changed();
      },
      async totals(userId) {
        const totals: Record<string, UsageTotals> = {};
        for (const u of data.usage) {
          if (u.userId !== userId) continue;
          const t = (totals[u.provider] ??= { calls: 0, inputTokens: 0, outputTokens: 0 });
          t.calls += 1;
          t.inputTokens += u.inputTokens;
          t.outputTokens += u.outputTokens;
        }
        return totals;
      },
    },
  };
}
