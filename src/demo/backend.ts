/**
 * Backend del modo demostración: la misma aplicación (rutas, validaciones, motor de Blueprint)
 * ejecutada dentro del navegador con repositorios en memoria. Sirve para probar TECTUM STUDIO
 * sin instalar nada; no reemplaza al servidor, que es donde viven la base de datos y las credenciales.
 */
import { createApp } from '../server/app';
import { defaultConfig, type Deps } from '../server/deps';
import type { ApiResponse } from '../server/http';
import { ProviderError } from '../server/providers/types';
import { createProviderRegistry } from '../server/providers/registry';
import { createMemoryRepos, emptyMemoryData, type MemoryData } from '../server/repos/memory';
import { createBrowserPlatform } from './platform';

const DATA_KEY = 'tectum-studio-demo-v1';
const SESSION_KEY = 'tectum-studio-demo-sesion';

const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) globalThis.localStorage.removeItem(key);
      else globalThis.localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento disponible la demostración sigue funcionando en memoria.
    }
  },
};

function loadData(): MemoryData {
  const raw = storage.get(DATA_KEY);
  if (!raw) return emptyMemoryData();
  try {
    const parsed = JSON.parse(raw) as Partial<MemoryData>;
    // Los adjuntos no se conservan entre visitas (su contenido vive en memoria).
    return { ...emptyMemoryData(), ...parsed, attachments: [] };
  } catch {
    return emptyMemoryData();
  }
}

export interface DemoRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  raw?: Uint8Array | null;
  contentType?: string;
}

export interface DemoBackend {
  handle(request: DemoRequest): Promise<ApiResponse>;
  /** Borra todos los datos de la demostración guardados en este navegador. */
  reset(): void;
}

interface ClaudeSample {
  (input: string, options?: { modelTier?: 'quick' | 'default' | 'complex' }): Promise<{ text: string; truncated?: boolean }>;
}

/** Si la página corre dentro de claude.ai con la capacidad `sample`, AURA puede usar Claude sin API Key. */
async function connectBuiltinClaude(deps: Deps) {
  try {
    const claude = (globalThis as { claude?: { use(name: string): Promise<unknown> } }).claude;
    if (!claude || typeof claude.use !== 'function') return;
    const sample = (await claude.use('sample')) as ClaudeSample | null;
    if (!sample) return;
    deps.platform.builtinAi = {
      label: 'Claude (integrado en esta página)',
      async complete(prompt) {
        try {
          const result = await sample(`${prompt.system}\n\n${prompt.user}`, { modelTier: 'complex' });
          if (result.truncated) throw new Error('La respuesta quedó incompleta.');
          return { text: result.text };
        } catch (error) {
          const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Claude no respondió.';
          throw new Error(message);
        }
      },
    };
  } catch {
    // Sin Claude integrado, la demostración usa el motor local.
  }
}

export function createDemoBackend(): DemoBackend {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const data = loadData();
  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage.set(DATA_KEY, JSON.stringify(data)), 150);
  };

  const deps: Deps = {
    repos: createMemoryRepos(data, save),
    platform: createBrowserPlatform(),
    providers: createProviderRegistry({
      fetch: async () => {
        throw new ProviderError('red', 'El modo demostración no se conecta con proveedores externos.');
      },
    }),
    log: (level, event, detail) => {
      if (level === 'error') console.error(`[tectum] ${event}`, detail);
    },
    // En la demostración los adjuntos quedan en memoria: se limita su tamaño.
    config: { ...defaultConfig, attachmentBytes: 2 * 1024 * 1024 },
  };
  const app = createApp(deps);
  void connectBuiltinClaude(deps);

  let sessionToken = storage.get(SESSION_KEY);

  return {
    async handle(request) {
      const response = await app.handle({
        method: request.method,
        path: request.path,
        query: request.query ?? {},
        body: request.body ?? null,
        raw: request.raw ?? null,
        contentType: request.contentType ?? 'application/json',
        sessionToken,
        ip: 'local',
        userAgent: globalThis.navigator?.userAgent ?? 'navegador',
      });
      if (response.session !== undefined) {
        sessionToken = response.session?.token ?? null;
        storage.set(SESSION_KEY, sessionToken);
      }
      // Se devuelve una copia para que la interfaz nunca comparta referencias con el "servidor".
      return response.json === undefined ? response : { ...response, json: structuredClone(response.json) };
    },
    reset() {
      if (saveTimer) clearTimeout(saveTimer);
      for (const list of Object.values(data) as unknown[][]) list.length = 0;
      sessionToken = null;
      storage.set(DATA_KEY, null);
      storage.set(SESSION_KEY, null);
    },
  };
}
