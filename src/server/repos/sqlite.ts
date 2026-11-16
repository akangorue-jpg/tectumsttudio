/**
 * Repositorios sobre SQLite (módulo nativo `node:sqlite`, sin dependencias).
 * Todas las consultas son parametrizadas. El esquema evoluciona con migraciones numeradas.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Activity, Project } from '../../core/types';
import type { AttachmentRecord, BlueprintRecord, ProviderRecord, Repos, SessionRecord, UsageTotals, UserRecord } from './types';

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'esquema_inicial',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        theme TEXT NOT NULL,
        locale TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        categories TEXT NOT NULL,
        spec TEXT NOT NULL,
        spec_updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX projects_owner ON projects(owner_id, updated_at);
      CREATE TABLE blueprints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        model TEXT,
        interpretation TEXT NOT NULL,
        content TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        UNIQUE (project_id, version)
      );
      CREATE INDEX blueprints_owner ON blueprints(owner_id);
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX attachments_project ON attachments(project_id);
      CREATE TABLE activity (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        project_id TEXT,
        project_name TEXT,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        level TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX activity_user ON activity(user_id, created_at);
      CREATE TABLE ai_providers (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        key_hint TEXT NOT NULL,
        model TEXT,
        models TEXT NOT NULL,
        status TEXT NOT NULL,
        is_primary INTEGER NOT NULL,
        last_verified_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, provider)
      );
      CREATE TABLE ai_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        purpose TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX ai_usage_user ON ai_usage(user_id);
    `,
  },
];

type Row = Record<string, unknown>;
const str = (v: unknown) => v as string;
const num = (v: unknown) => Number(v);
const nullableNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const nullableStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const json = <T>(v: unknown) => JSON.parse(v as string) as T;

const toUser = (r: Row): UserRecord => ({
  id: str(r.id),
  email: str(r.email),
  name: str(r.name),
  passwordHash: str(r.password_hash),
  role: str(r.role) as UserRecord['role'],
  theme: str(r.theme) as UserRecord['theme'],
  locale: str(r.locale) as UserRecord['locale'],
  createdAt: num(r.created_at),
});
const toProject = (r: Row): Project => ({
  id: str(r.id),
  ownerId: str(r.owner_id),
  name: str(r.name),
  status: str(r.status) as Project['status'],
  stage: str(r.stage) as Project['stage'],
  categories: json(r.categories),
  spec: json(r.spec),
  specUpdatedAt: num(r.spec_updated_at),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
});
const toBlueprint = (r: Row): BlueprintRecord => ({
  id: str(r.id),
  projectId: str(r.project_id),
  ownerId: str(r.owner_id),
  version: num(r.version),
  status: str(r.status) as BlueprintRecord['status'],
  source: str(r.source) as BlueprintRecord['source'],
  model: nullableStr(r.model),
  interpretation: json(r.interpretation),
  content: json(r.content),
  notes: json(r.notes),
  createdAt: num(r.created_at),
  approvedAt: nullableNum(r.approved_at),
});
const toAttachment = (r: Row): AttachmentRecord => ({
  id: str(r.id),
  projectId: str(r.project_id),
  name: str(r.name),
  mime: str(r.mime),
  size: num(r.size),
  storageKey: str(r.storage_key),
  createdAt: num(r.created_at),
});
const toActivity = (r: Row): Activity => ({
  id: str(r.id),
  userId: str(r.user_id),
  projectId: nullableStr(r.project_id),
  projectName: nullableStr(r.project_name),
  type: str(r.type),
  actor: str(r.actor) as Activity['actor'],
  level: str(r.level) as Activity['level'],
  summary: str(r.summary),
  createdAt: num(r.created_at),
});
const toProvider = (r: Row): ProviderRecord => ({
  userId: str(r.user_id),
  provider: str(r.provider) as ProviderRecord['provider'],
  encryptedKey: str(r.encrypted_key),
  keyHint: str(r.key_hint),
  model: nullableStr(r.model),
  models: json(r.models),
  status: str(r.status) as ProviderRecord['status'],
  primary: num(r.is_primary) === 1,
  lastVerifiedAt: nullableNum(r.last_verified_at),
  lastError: nullableStr(r.last_error),
  createdAt: num(r.created_at),
});

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): number[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number((r as Row).version)));
  const ran: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, Date.now());
      db.exec('COMMIT');
      ran.push(migration.version);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return ran;
}

export function createSqliteRepos(db: DatabaseSync): Repos {
  const run = (sql: string, ...params: SQLInputValue[]) => {
    db.prepare(sql).run(...params);
  };
  const one = (sql: string, ...params: SQLInputValue[]) => (db.prepare(sql).get(...params) as Row | undefined) ?? null;
  const all = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as Row[];

  /** UPDATE dinámico a partir de un mapa columna → valor (las columnas provienen del código, nunca del usuario). */
  const update = (table: string, where: string, whereParams: SQLInputValue[], values: Record<string, SQLInputValue | undefined>) => {
    const entries = Object.entries(values).filter((entry): entry is [string, SQLInputValue] => entry[1] !== undefined);
    if (entries.length === 0) return;
    run(`UPDATE ${table} SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE ${where}`, ...entries.map(([, value]) => value), ...whereParams);
  };

  return {
    users: {
      async create(u) {
        run('INSERT INTO users (id, email, name, password_hash, role, theme, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u.id, u.email, u.name, u.passwordHash, u.role, u.theme, u.locale, u.createdAt);
      },
      async byEmail(email) {
        const row = one('SELECT * FROM users WHERE email = ?', email);
        return row && toUser(row);
      },
      async byId(id) {
        const row = one('SELECT * FROM users WHERE id = ?', id);
        return row && toUser(row);
      },
      async update(id, patch) {
        update('users', 'id = ?', [id], { name: patch.name, theme: patch.theme, locale: patch.locale });
      },
      async count() {
        return num(one('SELECT COUNT(*) AS n FROM users')?.n ?? 0);
      },
    },
    sessions: {
      async create(s: SessionRecord) {
        run('INSERT INTO sessions (token_hash, user_id, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', s.tokenHash, s.userId, s.userAgent, s.createdAt, s.expiresAt);
      },
      async byTokenHash(tokenHash) {
        const r = one('SELECT * FROM sessions WHERE token_hash = ?', tokenHash);
        return r && { tokenHash: str(r.token_hash), userId: str(r.user_id), userAgent: str(r.user_agent), createdAt: num(r.created_at), expiresAt: num(r.expires_at) };
      },
      async delete(tokenHash) {
        run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      },
      async deleteExpired(now) {
        run('DELETE FROM sessions WHERE expires_at <= ?', now);
      },
    },
    projects: {
      async create(p) {
        run(
          'INSERT INTO projects (id, owner_id, name, status, stage, categories, spec, spec_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          p.id, p.ownerId, p.name, p.status, p.stage, JSON.stringify(p.categories), JSON.stringify(p.spec), p.specUpdatedAt, p.createdAt, p.updatedAt,
        );
      },
      async byId(id) {
        const row = one('SELECT * FROM projects WHERE id = ?', id);
        return row && toProject(row);
      },
      async listByOwner(ownerId) {
        return all('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC', ownerId).map(toProject);
      },
      async update(id, patch) {
        update('projects', 'id = ?', [id], {
          name: patch.name,
          status: patch.status,
          stage: patch.stage,
          categories: patch.categories && JSON.stringify(patch.categories),
          spec: patch.spec && JSON.stringify(patch.spec),
          spec_updated_at: patch.specUpdatedAt,
          updated_at: patch.updatedAt,
        });
      },
      async delete(id) {
        run('DELETE FROM projects WHERE id = ?', id);
      },
    },
    blueprints: {
      async create(b) {
        run(
          'INSERT INTO blueprints (id, project_id, owner_id, version, status, source, model, interpretation, content, notes, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          b.id, b.projectId, b.ownerId, b.version, b.status, b.source, b.model, JSON.stringify(b.interpretation), JSON.stringify(b.content), JSON.stringify(b.notes), b.createdAt, b.approvedAt,
        );
      },
      async byId(id) {
        const row = one('SELECT * FROM blueprints WHERE id = ?', id);
        return row && toBlueprint(row);
      },
      async listByProject(projectId) {
        return all('SELECT * FROM blueprints WHERE project_id = ? ORDER BY version DESC', projectId).map(toBlueprint);
      },
      async update(id, patch) {
        update('blueprints', 'id = ?', [id], { status: patch.status, approved_at: patch.approvedAt ?? undefined });
      },
      async countByOwner(ownerId) {
        return num(one('SELECT COUNT(*) AS n FROM blueprints WHERE owner_id = ?', ownerId)?.n ?? 0);
      },
    },
    attachments: {
      async create(a) {
        run('INSERT INTO attachments (id, project_id, name, mime, size, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', a.id, a.projectId, a.name, a.mime, a.size, a.storageKey, a.createdAt);
      },
      async byId(id) {
        const row = one('SELECT * FROM attachments WHERE id = ?', id);
        return row && toAttachment(row);
      },
      async listByProject(projectId) {
        return all('SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at ASC', projectId).map(toAttachment);
      },
      async delete(id) {
        run('DELETE FROM attachments WHERE id = ?', id);
      },
    },
    activity: {
      async add(a) {
        run(
          'INSERT INTO activity (id, user_id, project_id, project_name, type, actor, level, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          a.id, a.userId, a.projectId, a.projectName, a.type, a.actor, a.level, a.summary, a.createdAt,
        );
      },
      async list({ userId, projectId, limit }) {
        const rows = projectId
          ? all('SELECT * FROM activity WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?', userId, projectId, limit)
          : all('SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?', userId, limit);
        return rows.map(toActivity);
      },
    },
    providers: {
      async upsert(p) {
        run(
          `INSERT INTO ai_providers (user_id, provider, encrypted_key, key_hint, model, models, status, is_primary, last_verified_at, last_error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, provider) DO UPDATE SET
             encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint, model = excluded.model, models = excluded.models,
             status = excluded.status, is_primary = excluded.is_primary, last_verified_at = excluded.last_verified_at, last_error = excluded.last_error`,
          p.userId, p.provider, p.encryptedKey, p.keyHint, p.model, JSON.stringify(p.models), p.status, p.primary ? 1 : 0, p.lastVerifiedAt, p.lastError, p.createdAt,
        );
      },
      async get(userId, provider) {
        const row = one('SELECT * FROM ai_providers WHERE user_id = ? AND provider = ?', userId, provider);
        return row && toProvider(row);
      },
      async list(userId) {
        return all('SELECT * FROM ai_providers WHERE user_id = ? ORDER BY created_at ASC', userId).map(toProvider);
      },
      async delete(userId, provider) {
        run('DELETE FROM ai_providers WHERE user_id = ? AND provider = ?', userId, provider);
      },
    },
    usage: {
      async add(u) {
        run('INSERT INTO ai_usage (id, user_id, provider, model, purpose, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u.id, u.userId, u.provider, u.model, u.purpose, u.inputTokens, u.outputTokens, u.createdAt);
      },
      async totals(userId) {
        const totals: Record<string, UsageTotals> = {};
        for (const r of all('SELECT provider, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM ai_usage WHERE user_id = ? GROUP BY provider', userId)) {
          totals[str(r.provider)] = { calls: num(r.calls), inputTokens: num(r.input), outputTokens: num(r.output) };
        }
        return totals;
      },
    },
  };
}
