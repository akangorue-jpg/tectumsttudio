import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createHttpServer } from '../src/server/node/server';
import { createTestEnv, tempDir } from './helpers';

describe('adaptador HTTP de Node', () => {
  const env = createTestEnv('sqlite');
  const staticDir = tempDir('tectum-static-');
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!DOCTYPE html><title>TECTUM</title>');
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'console.log(1)');
  const server = createHttpServer({ app: env.app, staticDir, log: () => {}, secureCookies: false, trustProxy: false, attachmentBytes: 1024, rateLimits: { authPerMinute: 6, apiPerMinute: 1000 } });
  let base = '';

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    env.close();
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('sesión por cookie httpOnly, encabezados de seguridad y flujo autenticado', async () => {
    const register = await fetch(`${base}/api/auth/register`, json({ name: 'Ana', email: 'ana@ejemplo.com', password: 'clave-segura-123' }));
    assert.equal(register.status, 201);
    const cookie = register.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^tectum_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(register.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(register.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(register.headers.get('cache-control'), 'no-store');

    const session = cookie.split(';')[0]!;
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: session } });
    assert.equal(((await me.json()) as { user: { email: string } }).user.email, 'ana@ejemplo.com');

    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie: session } });
    assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).status, 401);
  });

  test('rechaza escrituras desde otro origen, JSON inválido y cuerpos demasiado grandes', async () => {
    const crossOrigin = await fetch(`${base}/api/auth/login`, { ...json({ email: 'ana@ejemplo.com', password: 'x' }), headers: { 'content-type': 'application/json', origin: 'https://sitio-malicioso.example' } });
    assert.equal(crossOrigin.status, 403);
    const sameOrigin = await fetch(`${base}/api/auth/login`, { ...json({ email: 'ana@ejemplo.com', password: 'incorrecta' }), headers: { 'content-type': 'application/json', origin: base } });
    assert.equal(sameOrigin.status, 401);

    const invalid = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{no es json' });
    assert.equal(invalid.status, 400);
    const notJson = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hola' });
    assert.equal(notJson.status, 415);
    const huge = await fetch(`${base}/api/projects`, json({ name: 'x'.repeat(1024 * 1024 + 10) }));
    assert.equal(huge.status, 413);
  });

  test('carga de archivos por HTTP respeta el límite de tamaño', async () => {
    const login = await fetch(`${base}/api/auth/register`, json({ name: 'Beto', email: 'beto@ejemplo.com', password: 'clave-segura-123' }));
    const session = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const created = await fetch(`${base}/api/projects`, { ...json({ name: 'Con archivo' }), headers: { 'content-type': 'application/json', cookie: session } });
    const id = ((await created.json()) as { project: { id: string } }).project.id;
    const upload = (bytes: number) => fetch(`${base}/api/projects/${id}/attachments?name=datos.csv`, { method: 'POST', headers: { 'content-type': 'text/csv', cookie: session }, body: new Uint8Array(bytes).fill(65) });
    assert.equal((await upload(100)).status, 201);
    assert.equal((await upload(2000)).status, 413);
    const detail = (await (await fetch(`${base}/api/projects/${id}`, { headers: { cookie: session } })).json()) as { attachments: { id: string }[] };
    const download = await fetch(`${base}/api/attachments/${detail.attachments[0]!.id}/content`, { headers: { cookie: session } });
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment; filename\*=UTF-8''datos\.csv$/);
    assert.equal((await download.arrayBuffer()).byteLength, 100);
  });

  test('interfaz: sirve archivos, resuelve rutas de la aplicación y no permite salir de la carpeta', async () => {
    const index = await fetch(`${base}/proyectos/123/blueprint`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /TECTUM/);
    assert.match((await fetch(`${base}/app.js`)).headers.get('content-type') ?? '', /javascript/);
    assert.equal((await fetch(`${base}/no-existe.js`)).status, 404);
    const traversal = await fetch(`${base}/..%2f..%2fpackage.json`);
    assert.notEqual(await traversal.text(), fs.readFileSync(path.resolve('package.json'), 'utf8'));
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  });

  test('limita los intentos de ingreso por IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await fetch(`${base}/api/auth/login`, json({ email: 'ana@ejemplo.com', password: 'incorrecta' }))).status);
    assert.ok(statuses.includes(429), `se esperaba un 429, hubo ${statuses.join(',')}`);
    assert.equal(statuses[0], 401);
  });
});
