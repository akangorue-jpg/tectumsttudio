import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/server/app';
import { defaultConfig, type Config, type Deps } from '../src/server/deps';
import type { ApiResponse } from '../src/server/http';
import { createNodePlatform } from '../src/server/node/platform';
import { createProviderRegistry } from '../src/server/providers/registry';
import { createMemoryRepos } from '../src/server/repos/memory';
import { createSqliteRepos, openDatabase } from '../src/server/repos/sqlite';

export const tempDir = (prefix = 'tectum-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export interface TestEnv {
  app: App;
  deps: Deps;
  dir: string;
  close(): void;
}

export function createTestEnv(kind: 'memory' | 'sqlite', options: { providerBaseUrl?: string; config?: Partial<Config> } = {}): TestEnv {
  const dir = tempDir();
  const db = kind === 'sqlite' ? openDatabase(path.join(dir, 'test.db')) : null;
  const deps: Deps = {
    repos: db ? createSqliteRepos(db) : createMemoryRepos(),
    platform: createNodePlatform({ secretKey: randomBytes(32), filesDir: path.join(dir, 'files') }),
    providers: createProviderRegistry({
      fetch: (input, init) => fetch(input, init),
      baseUrls: { anthropic: options.providerBaseUrl ?? 'http://127.0.0.1:9', openai: options.providerBaseUrl ?? 'http://127.0.0.1:9' },
    }),
    log: () => {},
    config: { ...defaultConfig, ...options.config },
  };
  return {
    app: createApp(deps),
    deps,
    dir,
    close() {
      db?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Cliente de pruebas que conserva la sesión entre llamadas, como lo haría un navegador. */
export class Client {
  token: string | null = null;
  constructor(private app: App) {}

  async call(method: string, pathWithQuery: string, body?: unknown, raw?: { data: Uint8Array; contentType: string }): Promise<ApiResponse & { json: any }> {
    const url = new URL(pathWithQuery, 'http://test');
    const response = await this.app.handle({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: body ?? null,
      raw: raw?.data ?? null,
      contentType: raw?.contentType ?? 'application/json',
      sessionToken: this.token,
      ip: '127.0.0.1',
      userAgent: 'pruebas',
    });
    if (response.session !== undefined) this.token = response.session?.token ?? null;
    return response as ApiResponse & { json: any };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, body?: unknown) => this.call('POST', p, body);
  patch = (p: string, body?: unknown) => this.call('PATCH', p, body);
  put = (p: string, body?: unknown) => this.call('PUT', p, body);
  del = (p: string) => this.call('DELETE', p);

  async register(name = 'Ana Gómez', email = `ana-${randomBytes(4).toString('hex')}@ejemplo.com`, password = 'clave-segura-123') {
    const response = await this.post('/api/auth/register', { name, email, password });
    return { response, email, password };
  }
}

export interface FakeProvider {
  url: string;
  /** Texto que devolverá la próxima generación. */
  reply: string;
  requests: { path: string; headers: http.IncomingHttpHeaders; body: any }[];
  close(): Promise<void>;
}

/** Servidor local que imita las APIs de Anthropic y OpenAI para probar los adaptadores sin red. */
export async function startFakeProvider(validKey = 'sk-valida-1234'): Promise<FakeProvider> {
  const state: FakeProvider = { url: '', reply: '{}', requests: [], close: async () => {} };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const body = text ? JSON.parse(text) : null;
      const pathname = (req.url ?? '').split('?')[0]!;
      state.requests.push({ path: pathname, headers: req.headers, body });
      const key = (req.headers['x-api-key'] as string | undefined) ?? String(req.headers.authorization ?? '').replace('Bearer ', '');
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (key !== validKey) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      const isAnthropic = 'x-api-key' in req.headers;
      if (pathname === '/v1/models') {
        return json(
          200,
          isAnthropic
            ? { data: [{ id: 'claude-nuevo', display_name: 'Claude Nuevo', type: 'model' }, { id: 'claude-anterior', display_name: 'Claude Anterior', type: 'model' }], has_more: false }
            : { data: [{ id: 'text-embedding-x', created: 3 }, { id: 'gpt-anterior', created: 1 }, { id: 'gpt-nuevo', created: 2 }] },
        );
      }
      if (pathname === '/v1/messages') return json(200, { content: [{ type: 'text', text: state.reply }], usage: { input_tokens: 1200, output_tokens: 3400 } });
      if (pathname === '/v1/chat/completions') return json(200, { choices: [{ message: { role: 'assistant', content: state.reply } }], usage: { prompt_tokens: 900, completion_tokens: 2100 } });
      return json(404, { error: { message: 'not found' } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
}
