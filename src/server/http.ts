/**
 * Contrato HTTP independiente del framework.
 *
 * Los manejadores reciben un ApiRequest y devuelven un ApiResponse; no conocen Node, cookies ni
 * `fetch`. Un adaptador traduce desde/hacia el transporte real: servidor Node (src/server/node),
 * navegador en modo demostración (src/demo) o, más adelante, Route Handlers de Next.js.
 */
import { AppError, errors } from '../core/errors';
import type { User } from '../core/types';
import type { Deps } from './deps';

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  /** Cuerpo JSON ya interpretado, o null. */
  body: unknown;
  /** Cuerpo binario (carga de archivos), o null. */
  raw: Uint8Array | null;
  contentType: string;
  sessionToken: string | null;
  ip: string;
  userAgent: string;
}

export interface ApiResponse {
  status: number;
  json?: unknown;
  file?: { data: Uint8Array; contentType: string; filename: string };
  /** undefined: sin cambios · objeto: iniciar sesión · null: cerrar sesión. */
  session?: { token: string; expiresAt: number } | null;
}

export const ok = (json: unknown, status = 200): ApiResponse => ({ status, json });

export interface PublicCtx {
  req: ApiRequest;
  params: Record<string, string>;
  deps: Deps;
  user: User | null;
}
export interface AuthCtx extends PublicCtx {
  user: User;
}

type Handler<C> = (ctx: C) => Promise<ApiResponse>;
interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  auth: boolean;
  handler: Handler<AuthCtx> | Handler<PublicCtx>;
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, pattern: string, auth: boolean, handler: Route['handler']) {
    const keys: string[] = [];
    const source = pattern.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}$`), keys, auth, handler });
  }

  /** Ruta pública (no requiere sesión). */
  open(method: string, pattern: string, handler: Handler<PublicCtx>) {
    this.add(method, pattern, false, handler);
  }
  /** Ruta protegida: sólo se ejecuta con una sesión válida. */
  secure(method: string, pattern: string, handler: Handler<AuthCtx>) {
    this.add(method, pattern, true, handler);
  }

  match(method: string, path: string) {
    let pathMatched = false;
    for (const route of this.routes) {
      const found = route.regex.exec(path);
      if (!found) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(found[index + 1] ?? '');
      });
      return { route, params };
    }
    if (pathMatched) throw new AppError('metodo_no_permitido', 405, 'Método no permitido para este recurso.');
    throw errors.notFound('La ruta');
  }
}

/** Convierte cualquier error en una respuesta JSON uniforme. Los errores inesperados no filtran detalles. */
export function errorResponse(error: unknown, log: Deps['log'], req: ApiRequest): ApiResponse {
  if (error instanceof AppError) {
    if (error.status >= 500) log('error', 'app_error', { code: error.code, path: req.path, message: error.message });
    return { status: error.status, json: { error: { code: error.code, message: error.message } } };
  }
  const message = error instanceof Error ? error.message : String(error);
  log('error', 'unhandled_error', { path: req.path, method: req.method, message, stack: error instanceof Error ? error.stack : undefined });
  return { status: 500, json: { error: { code: 'error_interno', message: 'Ocurrió un error inesperado. Volvé a intentarlo.' } } };
}
