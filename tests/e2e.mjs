/**
 * Prueba de punta a punta en un navegador real (Chromium vía Playwright).
 * Recorre el flujo principal contra el servidor compilado y contra el modo demostración.
 *
 *   npm run build && npm run test:e2e
 *
 * Deja capturas de pantalla en artifacts/screenshots.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'artifacts', 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const DESCRIPTION =
  'Necesito un sistema para que mis vendedores registren clientes interesados en propiedades, hagan seguimiento de cada oportunidad y yo pueda ver reportes de ventas por mes. Queremos recibir recordatorios por email de las tareas pendientes.';

function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tectum-e2e-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'dist', 'server.mjs')], {
    env: { ...process.env, PORT: String(port), TECTUM_DATA_DIR: dataDir, LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return { url, dataDir, stop: () => child.kill('SIGTERM') };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill('SIGKILL');
  throw new Error('El servidor no inició');
}

function startStatic(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const name = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const file = path.join(dir, name);
    if (!file.startsWith(dir) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() })));
}

async function newPage(browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-PY', timezoneId: 'America/Asuncion' });
  // Las fuentes externas no son parte de la prueba (y el entorno de pruebas puede no tener red).
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/fonts\.|ERR_FAILED|status of 4\d\d/.test(text)) return;
    problems.push(`console: ${text}`);
  });
  page.setDefaultTimeout(10_000);
  return { context, page, problems };
}

const shot = (page, name, options = {}) => page.screenshot({ path: path.join(shots, `${name}.png`), ...options });

async function register(page, name, email) {
  await page.getByRole('link', { name: 'Creá una' }).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill('clave-segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByRole('heading', { level: 1 }).filter({ hasText: name.split(' ')[0] }).waitFor();
}

/** Flujo idea → Blueprint aprobado. Funciona igual contra el servidor y contra la demostración. */
async function createAndApprove(page, prefix) {
  await page.getByLabel('¿Qué querés construir?').fill(DESCRIPTION);
  await shot(page, `${prefix}-01-dashboard-vacio`);
  await page.getByRole('button', { name: 'Crear proyecto' }).click();

  // Paso 1: tipo de proyecto.
  await page.getByRole('heading', { name: '¿Qué tipo de proyecto querés crear?' }).waitFor();
  await page.getByPlaceholder('Buscar categoría').fill('crm');
  await page.getByRole('button', { name: 'CRM', exact: true }).click();
  await page.getByPlaceholder('Buscar categoría').fill('');
  assert.equal(await page.getByRole('button', { name: 'CRM', exact: true }).getAttribute('aria-pressed'), 'true');
  await shot(page, `${prefix}-02-tipo-de-proyecto`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 2: descripción (llega precargada desde el Dashboard).
  await page.getByLabel('Nombre del proyecto').fill('CRM Inmobiliaria');
  assert.equal(await page.getByLabel('Descripción').inputValue(), DESCRIPTION);
  await page.locator('input[type=file]').setInputFiles({ name: 'clientes.csv', mimeType: 'text/csv', buffer: Buffer.from('nombre,email\nAna,ana@ejemplo.com\n') });
  await page.getByText('clientes.csv').waitFor();
  await shot(page, `${prefix}-03-descripcion`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 3: configuración adicional.
  await page.getByRole('heading', { name: 'Configuración adicional' }).waitFor();
  await page.getByLabel('Público objetivo').fill('Equipo comercial de la inmobiliaria');
  await page.getByLabel('Roles de usuarios').fill('Gerente comercial');
  await page.getByLabel('Roles de usuarios').press('Enter');
  await page.getByLabel('Roles de usuarios').fill('Vendedor');
  await page.getByLabel('Roles de usuarios').press('Enter');
  await page.getByLabel('Moneda').fill('PYG');
  await shot(page, `${prefix}-04-configuracion`, { fullPage: true });
  await page.getByRole('button', { name: 'Interpretar con AURA' }).click();

  // Paso 4: interpretación.
  await page.getByRole('heading', { name: 'Interpretación de AURA' }).waitFor();
  await page.getByText('CRM (gestión de relaciones con clientes)', { exact: true }).waitFor();
  await page.getByText('Notificaciones', { exact: true }).waitFor();
  assert.equal(await page.getByText('AURA necesita algunas precisiones').count(), 0, 'con una descripción suficiente no hay preguntas');
  await shot(page, `${prefix}-05-interpretacion`, { fullPage: true });
  await page.getByRole('button', { name: 'Generar Blueprint' }).click();

  // Blueprint.
  await page.getByRole('heading', { name: 'CRM Inmobiliaria', level: 2 }).waitFor();
  await page.getByText('Versión 1').first().waitFor();
  for (const section of ['Descripción funcional', 'Modelo de datos', 'Cronograma estimado por etapas', 'Criterios de aceptación']) {
    await page.getByRole('heading', { name: section, level: 3 }).waitFor();
  }
  await page.getByText('Gerente comercial').first().waitFor();
  await shot(page, `${prefix}-06-blueprint`);
  await shot(page, `${prefix}-06-blueprint-completo`, { fullPage: true });
  await page.getByRole('button', { name: 'Aprobar Blueprint' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprobar Blueprint' }).click();
  await page.getByText('Aprobado', { exact: true }).first().waitFor();
  await page.getByText('En desarrollo').first().waitFor();
}

async function serverFlow(browser) {
  const server = await startServer();
  const { context, page, problems } = await newPage(browser);
  try {
    await page.goto(server.url);
    await page.getByRole('heading', { name: 'Ingresá a tu estudio' }).waitFor();
    await shot(page, 'servidor-00-ingreso');
    await register(page, 'Ana Gómez', 'ana@ejemplo.com');
    await createAndApprove(page, 'servidor');

    // Ficha del proyecto: resumen, adjunto y actividad.
    await page.getByRole('tab', { name: 'Resumen' }).click();
    await page.getByText('clientes.csv').waitFor();
    await page.getByText('Blueprint aprobado').first().waitFor();
    await shot(page, 'servidor-07-proyecto', { fullPage: true });
    await page.getByRole('tab', { name: 'Actividad' }).click();
    await page.getByText('Aprobaste el Blueprint v1 de «CRM Inmobiliaria».').waitFor();

    // Editar la especificación marca el Blueprint como desactualizado y permite una nueva versión.
    await page.getByRole('tab', { name: 'Blueprint' }).click();
    await page.getByRole('button', { name: 'Editar especificaciones' }).click();
    await page.getByLabel('Descripción').fill(`${DESCRIPTION} También necesitamos importar los contactos desde una planilla de Excel.`);
    await page.getByRole('button', { name: 'Guardar y salir' }).click();
    await page.getByRole('tab', { name: 'Blueprint' }).click();
    await page.getByText('La especificación cambió después de generar esta versión').waitFor();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();
    await page.getByText('Versión 2').first().waitFor();
    await page.getByText('Importación de datos').first().waitFor();
    assert.equal(await page.getByLabel('Versiones de Blueprint').locator('option').count(), 2);

    // Dashboard con datos reales.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByText('Tenés 1 proyecto en desarrollo.').waitFor();
    await page.getByText('CRM Inmobiliaria').first().waitFor();
    await shot(page, 'servidor-08-dashboard');

    // Mis proyectos: búsqueda, pausa y reactivación.
    await page.getByRole('link', { name: 'Mis proyectos' }).click();
    await page.getByPlaceholder('Buscar por nombre o categoría').fill('zzz');
    await page.getByText('Ningún proyecto coincide con la búsqueda.').waitFor();
    await page.getByPlaceholder('Buscar por nombre o categoría').fill('inmobiliaria');
    await page.getByRole('button', { name: 'Acciones del proyecto' }).click();
    await page.getByRole('menuitem', { name: 'Pausar' }).click();
    await page.getByText('Proyecto pausado').waitFor();
    await page.getByRole('button', { name: 'Acciones del proyecto' }).click();
    await page.getByRole('menuitem', { name: 'Reactivar' }).click();
    await page.getByText('Proyecto reactivado').waitFor();
    await page.getByText('En desarrollo').first().waitFor();
    await shot(page, 'servidor-09-mis-proyectos');

    // AI Builder, Historial y módulos futuros.
    await page.getByRole('link', { name: 'AI Builder' }).click();
    await page.getByRole('heading', { name: 'Blueprint por aprobar' }).waitFor();
    await shot(page, 'servidor-10-ai-builder');
    await page.getByRole('link', { name: 'Historial' }).click();
    await page.getByText('Creaste tu cuenta en TECTUM STUDIO.').waitFor();
    await page.getByRole('link', { name: /^AURA/ }).click();
    await page.getByText('En desarrollo: se habilita en la Fase 5').waitFor();
    await shot(page, 'servidor-11-modulo-aura');

    // Proveedores de IA: una clave que no se puede verificar no se guarda.
    await page.getByRole('link', { name: 'Configuración' }).click();
    await page.getByRole('tab', { name: 'Proveedores de IA' }).click();
    const anthropic = page.locator('form').filter({ has: page.locator('#provider-key-anthropic') });
    await anthropic.getByLabel('API Key').fill('sk-ant-clave-de-prueba-0000');
    await anthropic.getByRole('button', { name: 'Conectar y verificar' }).click();
    await page.getByText(/No se pudo verificar la conexión/).waitFor({ timeout: 20_000 });
    assert.equal(await page.getByText('Sin conectar').count(), 2);
    await shot(page, 'servidor-12-proveedores', { fullPage: true });

    // Tema oscuro, persistencia tras recargar y cierre de sesión.
    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByText('CRM Inmobiliaria').first().waitFor();
    await shot(page, 'servidor-13-dashboard-oscuro');
    await page.reload();
    await page.getByText('CRM Inmobiliaria').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'el tema se conserva');
    assert.ok(!(await page.evaluate(() => document.cookie)).includes('tectum_session'), 'la cookie de sesión no es legible desde JavaScript');

    await page.getByRole('button', { name: 'Ana Gómez' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await page.getByRole('heading', { name: 'Ingresá a tu estudio' }).waitFor();
    await page.getByLabel('Email').fill('ana@ejemplo.com');
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.getByText('Email o contraseña incorrectos.').waitFor();
    await page.getByLabel('Contraseña').fill('clave-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.getByText('CRM Inmobiliaria').first().waitFor();

    // Móvil: navegación en panel lateral.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('link', { name: 'Mis proyectos' }).click();
    await page.getByRole('heading', { name: 'Mis proyectos' }).waitFor();
    await shot(page, 'servidor-14-movil');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desplazamiento horizontal en móvil');

    assert.deepEqual(problems, [], 'sin errores en la consola del navegador');
  } finally {
    await context.close();
    server.stop();
    fs.rmSync(server.dataDir, { recursive: true, force: true });
  }
}

async function demoFlow(browser) {
  const site = await startStatic(path.join(root, 'dist', 'demo'));
  const { context, page, problems } = await newPage(browser);
  try {
    await page.goto(site.url);
    await page.getByText('Estás en el modo demostración').waitFor();
    await register(page, 'Luz Benítez', 'luz@ejemplo.com');
    await page.getByText('Modo demostración: los datos se guardan sólo en este navegador.').waitFor();
    await createAndApprove(page, 'demo');

    // Los datos sobreviven a una recarga (se guardan en este navegador).
    await page.waitForTimeout(400);
    await page.reload();
    await page.getByText('CRM Inmobiliaria').first().waitFor();

    // No se pueden guardar credenciales en la demostración.
    await page.getByRole('link', { name: 'Configuración' }).click();
    await page.getByRole('tab', { name: 'Proveedores de IA' }).click();
    await page.getByText('En el modo demostración no se conectan proveedores externos').waitFor();
    assert.equal(await page.getByLabel('API Key').count(), 0);

    // Borrar los datos de la demostración vuelve al registro.
    await page.getByRole('tab', { name: 'Cuenta' }).click();
    await page.getByRole('button', { name: 'Borrar datos de la demostración' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar datos de la demostración' }).click();
    await page.getByRole('heading', { name: 'Creá tu cuenta' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('tectum-studio-demo-v1')), null);

    assert.deepEqual(problems, [], 'sin errores en la consola del navegador');
  } finally {
    await context.close();
    site.stop();
  }
}

const browser = await chromium.launch();
try {
  const started = Date.now();
  await serverFlow(browser);
  console.log(`✓ flujo completo contra el servidor (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  const demoStarted = Date.now();
  await demoFlow(browser);
  console.log(`✓ flujo completo en modo demostración (${((Date.now() - demoStarted) / 1000).toFixed(1)} s)`);
  console.log(`Capturas en ${path.relative(root, shots)}`);
} finally {
  await browser.close();
}
