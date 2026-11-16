/**
 * Adaptador HTTP para Node: traduce solicitudes del navegador al contrato de la aplicación,
 * sirve la interfaz compilada y aplica las protecciones de transporte (cookies, origen,
 * límites de tamaño, límite de solicitudes y encabezados de seguridad).
 */
import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { AppError, errors } from '../../core/errors';
import type { App } from '../app';
import type { Logger } from '../deps';
import type { ApiRequest, ApiResponse } from '../http';

const COOKIE = 'tectum_session';
const JSON_LIMIT = 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export interface HttpServerOptions {
  app: App;
  staticDir: string;
  log: Logger;
  /** Marca la cookie de sesión como Secure (usar detrás de HTTPS). */
  secureCookies: boolean;
  /** Confía en X-Forwarded-For para obtener la IP del cliente (sólo detrás de un proxy propio). */
  trustProxy: boolean;
  attachmentBytes: number;
  rateLimits?: { authPerMinute: number; apiPerMinute: number };
}

class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    }, 60_000).unref();
  }
  /** Devuelve false cuando la clave superó el máximo dentro de la ventana de un minuto. */
  allow(key: string, max: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  }
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      req.resume();
      reject(errors.tooLarge('El contenido enviado supera el tamaño máximo permitido.'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(errors.tooLarge('El contenido enviado supera el tamaño máximo permitido.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createHttpServer(options: HttpServerOptions): http.Server {
  const { app, log } = options;
  const limits = options.rateLimits ?? { authPerMinute: 20, apiPerMinute: 600 };
  const limiter = new RateLimiter();
  const staticRoot = path.resolve(options.staticDir);

  const send = (res: ServerResponse, status: number, headers: Record<string, string | string[]>, body?: Buffer | string) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, status: number, json: unknown, extra: Record<string, string | string[]> = {}) =>
    send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, JSON.stringify(json));

  const sessionCookie = (session: NonNullable<ApiResponse['session']> | null) => {
    const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', ...(options.secureCookies ? ['Secure'] : [])];
    if (session === null) return `${COOKIE}=; ${attributes.join('; ')}; Max-Age=0`;
    const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    return `${COOKIE}=${encodeURIComponent(session.token)}; ${attributes.join('; ')}; Max-Age=${maxAge}`;
  };

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
    const method = req.method ?? 'GET';
    const ip = (options.trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()) || req.socket.remoteAddress || 'desconocida';

    try {
      // Protección CSRF: las operaciones de escritura sólo se aceptan desde el mismo origen.
      if (method !== 'GET' && method !== 'HEAD') {
        const origin = req.headers.origin;
        if (origin) {
          let originHost = '';
          try {
            originHost = new URL(origin).host;
          } catch {
            originHost = '';
          }
          if (originHost !== req.headers.host) throw errors.forbidden('Solicitud rechazada: el origen no coincide con el de la aplicación.');
        }
      }
      const isAuth = url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register';
      if (!limiter.allow(`${ip}:${isAuth ? 'auth' : 'api'}`, isAuth ? limits.authPerMinute : limits.apiPerMinute)) throw errors.rateLimited();

      const contentType = String(req.headers['content-type'] ?? '');
      const isUpload = /^\/api\/projects\/[^/]+\/attachments$/.test(url.pathname) && method === 'POST';
      let body: unknown = null;
      let raw: Uint8Array | null = null;
      if (method !== 'GET' && method !== 'HEAD') {
        const buffer = await readBody(req, isUpload ? options.attachmentBytes : JSON_LIMIT);
        if (isUpload) {
          raw = new Uint8Array(buffer);
        } else if (buffer.length > 0) {
          if (!contentType.includes('application/json')) throw new AppError('tipo_no_soportado', 415, 'Se esperaba contenido en formato JSON.');
          try {
            body = JSON.parse(buffer.toString('utf8'));
          } catch {
            throw errors.validation('El cuerpo de la solicitud no es JSON válido.');
          }
        }
      }

      const apiRequest: ApiRequest = {
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        raw,
        contentType,
        sessionToken: readCookie(req.headers.cookie, COOKIE),
        ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
      };
      const response = await app.handle(apiRequest);
      const extra: Record<string, string | string[]> = {};
      if (response.session !== undefined) extra['Set-Cookie'] = sessionCookie(response.session);
      if (response.file) {
        const filename = encodeURIComponent(response.file.filename);
        send(
          res,
          response.status,
          { 'Content-Type': response.file.contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${filename}`, 'Cache-Control': 'no-store', ...extra },
          Buffer.from(response.file.data),
        );
        return;
      }
      sendJson(res, response.status, response.json ?? null, extra);
    } catch (error) {
      if (error instanceof AppError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      log('error', 'http_error', { path: url.pathname, message: error instanceof Error ? error.message : String(error) });
      sendJson(res, 500, { error: { code: 'error_interno', message: 'Ocurrió un error inesperado. Volvé a intentarlo.' } });
    }
  }

  async function handleStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { Allow: 'GET, HEAD' });
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = '/';
    }
    const hasExtension = path.extname(pathname) !== '';
    // Las rutas sin extensión pertenecen a la aplicación de una sola página.
    let file = path.resolve(staticRoot, `.${hasExtension ? pathname : '/index.html'}`);
    if (!file.startsWith(staticRoot + path.sep)) file = path.join(staticRoot, 'index.html');
    try {
      const data = await fs.readFile(file);
      send(res, 200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }, req.method === 'HEAD' ? undefined : data);
    } catch {
      if (hasExtension) {
        send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'No encontrado');
        return;
      }
      send(res, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'La interfaz no está compilada. Ejecutá "npm run build".');
    }
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }
    const task = url.pathname.startsWith('/api/') ? handleApi(req, res, url) : handleStatic(req, res, url);
    task.catch((error) => {
      log('error', 'request_failed', { message: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'error_interno', message: 'Ocurrió un error inesperado.' } });
    });
  });
}
