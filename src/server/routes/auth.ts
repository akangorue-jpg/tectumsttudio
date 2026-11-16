import { AppError, errors } from '../../core/errors';
import { loginInput, profileInput, registerInput } from '../../core/schemas';
import type { Meta } from '../../core/types';
import type { Deps } from '../deps';
import { ok, type ApiRequest, type ApiResponse, type Router } from '../http';
import type { UserRecord } from '../repos/types';
import { parse, publicUser, recordActivity } from '../services';

async function startSession(deps: Deps, user: UserRecord, req: ApiRequest, status: number): Promise<ApiResponse> {
  const token = deps.platform.token();
  const now = deps.platform.now();
  const expiresAt = now + deps.config.sessionTtlMs;
  await deps.repos.sessions.deleteExpired(now);
  await deps.repos.sessions.create({
    tokenHash: await deps.platform.hashToken(token),
    userId: user.id,
    userAgent: req.userAgent.slice(0, 300),
    createdAt: now,
    expiresAt,
  });
  return { status, json: { user: publicUser(user) }, session: { token, expiresAt } };
}

export function registerAuthRoutes(router: Router) {
  router.open('GET', '/api/meta', async ({ deps }) => {
    const meta: Meta = {
      version: deps.config.version,
      mode: deps.platform.mode,
      secureSecrets: deps.platform.secureSecrets,
      builtinAi: deps.platform.builtinAi?.label ?? null,
      limits: { attachmentBytes: deps.config.attachmentBytes },
    };
    return ok(meta);
  });

  router.open('POST', '/api/auth/register', async ({ req, deps }) => {
    const input = parse(registerInput, req.body);
    if (await deps.repos.users.byEmail(input.email)) throw errors.conflict('Ya existe una cuenta con ese email. Iniciá sesión.');
    const user: UserRecord = {
      id: deps.platform.id(),
      email: input.email,
      name: input.name,
      passwordHash: await deps.platform.hashPassword(input.password),
      // La primera cuenta de la instalación queda como administradora.
      role: (await deps.repos.users.count()) === 0 ? 'admin' : 'miembro',
      theme: 'claro',
      locale: 'es',
      createdAt: deps.platform.now(),
    };
    await deps.repos.users.create(user);
    await recordActivity(deps, { userId: user.id, type: 'cuenta.creada', summary: 'Creaste tu cuenta en TECTUM STUDIO.' });
    return startSession(deps, user, req, 201);
  });

  router.open('POST', '/api/auth/login', async ({ req, deps }) => {
    const input = parse(loginInput, req.body);
    const user = await deps.repos.users.byEmail(input.email);
    // Se verifica siempre un hash para no revelar por tiempo de respuesta si el email existe.
    const valid = user ? await deps.platform.verifyPassword(input.password, user.passwordHash) : (await deps.platform.hashPassword(input.password), false);
    if (!user || !valid) throw new AppError('credenciales', 401, 'Email o contraseña incorrectos.');
    return startSession(deps, user, req, 200);
  });

  router.open('POST', '/api/auth/logout', async ({ req, deps }) => {
    if (req.sessionToken) await deps.repos.sessions.delete(await deps.platform.hashToken(req.sessionToken));
    return { status: 200, json: { ok: true }, session: null };
  });

  router.secure('GET', '/api/auth/me', async ({ user }) => ok({ user }));

  router.secure('PATCH', '/api/auth/me', async ({ req, deps, user }) => {
    const patch = parse(profileInput, req.body);
    await deps.repos.users.update(user.id, patch);
    const updated = await deps.repos.users.byId(user.id);
    return ok({ user: updated ? publicUser(updated) : user });
  });
}
