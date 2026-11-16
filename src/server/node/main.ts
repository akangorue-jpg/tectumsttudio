/**
 * Punto de entrada del servidor de TECTUM STUDIO.
 *
 * Variables de entorno:
 *   PORT                 Puerto HTTP (3000).
 *   HOST                 Interfaz de escucha (127.0.0.1; usar 0.0.0.0 en contenedores).
 *   TECTUM_DATA_DIR      Carpeta de datos: base SQLite, adjuntos y clave local (./data).
 *   TECTUM_SECRET_KEY    Clave maestra de 32 bytes en base64 para cifrar credenciales.
 *   TECTUM_STATIC_DIR    Carpeta de la interfaz compilada (dist/web).
 *   TECTUM_SECURE_COOKIES  "1" para marcar la cookie de sesión como Secure (HTTPS).
 *   TECTUM_TRUST_PROXY   "1" si hay un proxy inverso propio delante.
 *   LOG_LEVEL            debug | info | warn | error (info).
 */
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app';
import { defaultConfig, type Deps, type Logger, type LogLevel } from '../deps';
import { createProviderRegistry } from '../providers/registry';
import { createSqliteRepos, openDatabase } from '../repos/sqlite';
import { createNodePlatform, loadSecretKey } from './platform';
import { createHttpServer } from './server';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minimum: LogLevel): Logger {
  return (level, event, data = {}) => {
    if (LEVELS[level] < LEVELS[minimum]) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...data });
    (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
  };
}

async function main() {
  const env = process.env;
  const log = createLogger((env.LOG_LEVEL as LogLevel) in LEVELS ? (env.LOG_LEVEL as LogLevel) : 'info');
  const dataDir = path.resolve(env.TECTUM_DATA_DIR ?? 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = [env.TECTUM_STATIC_DIR, path.join(here, 'web'), path.resolve('dist', 'web')].find((dir): dir is string => !!dir && existsSync(dir)) ?? path.resolve('dist', 'web');

  const secret = await loadSecretKey(dataDir, env.TECTUM_SECRET_KEY);
  if (secret.source === 'archivo_nuevo') {
    log('warn', 'secret_key_created', { message: `Se generó una clave maestra en ${path.join(dataDir, 'secret.key')}. Resguardala: sin ella no se pueden leer las credenciales guardadas.` });
  }

  const db = openDatabase(path.join(dataDir, 'tectum.db'));
  const deps: Deps = {
    repos: createSqliteRepos(db),
    platform: createNodePlatform({ secretKey: secret.key, filesDir: path.join(dataDir, 'files') }),
    providers: createProviderRegistry({ fetch: (input, init) => fetch(input, init) }),
    log,
    config: defaultConfig,
  };

  const server = createHttpServer({
    app: createApp(deps),
    staticDir,
    log,
    secureCookies: env.TECTUM_SECURE_COOKIES === '1',
    trustProxy: env.TECTUM_TRUST_PROXY === '1',
    attachmentBytes: defaultConfig.attachmentBytes,
  });

  const port = Number(env.PORT ?? 3000);
  const host = env.HOST ?? '127.0.0.1';
  server.listen(port, host, () => log('info', 'server_started', { url: `http://${host}:${port}`, dataDir, staticDir, version: defaultConfig.version }));

  const shutdown = (signal: string) => {
    log('info', 'server_stopping', { signal });
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', event: 'startup_failed', message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exit(1);
});
