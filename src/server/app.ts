/**
 * Aplicación de TECTUM STUDIO como función pura: recibe un ApiRequest y devuelve un ApiResponse.
 * No depende de Node ni del navegador; cada entorno la envuelve con su propio adaptador.
 */
import { errors } from '../core/errors';
import type { User } from '../core/types';
import type { Deps } from './deps';
import { errorResponse, Router, type ApiRequest, type ApiResponse, type AuthCtx, type PublicCtx } from './http';
import { registerAuthRoutes } from './routes/auth';
import { registerProjectRoutes } from './routes/projects';
import { registerProviderRoutes } from './routes/providers';
import { publicUser } from './services';

export interface App {
  handle(req: ApiRequest): Promise<ApiResponse>;
}

async function authenticate(deps: Deps, req: ApiRequest): Promise<User | null> {
  if (!req.sessionToken) return null;
  const session = await deps.repos.sessions.byTokenHash(await deps.platform.hashToken(req.sessionToken));
  if (!session) return null;
  if (session.expiresAt <= deps.platform.now()) {
    await deps.repos.sessions.delete(session.tokenHash);
    return null;
  }
  const user = await deps.repos.users.byId(session.userId);
  return user ? publicUser(user) : null;
}

export function createApp(deps: Deps): App {
  const router = new Router();
  registerAuthRoutes(router);
  registerProjectRoutes(router);
  registerProviderRoutes(router);

  return {
    async handle(req) {
      const started = deps.platform.now();
      let response: ApiResponse;
      try {
        const { route, params } = router.match(req.method, req.path);
        const user = await authenticate(deps, req);
        if (route.auth && !user) throw errors.unauthenticated();
        const ctx: PublicCtx = { req, params, deps, user };
        response = await (route.handler as (ctx: PublicCtx | AuthCtx) => Promise<ApiResponse>)(ctx);
      } catch (error) {
        response = errorResponse(error, deps.log, req);
      }
      deps.log('debug', 'request', { method: req.method, path: req.path, status: response.status, ms: deps.platform.now() - started });
      return response;
    },
  };
}
