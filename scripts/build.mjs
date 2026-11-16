/**
 * Compilación de TECTUM STUDIO.
 *
 *   dist/server.mjs   Servidor (Node ≥ 22.13, sin dependencias de runtime).
 *   dist/web/         Interfaz que sirve el servidor.
 *   dist/demo/        Modo demostración: interfaz + backend dentro del navegador.
 *
 * Tailwind CSS v4 se compila con su API de JavaScript: se extraen las clases candidatas
 * del código fuente y se genera sólo el CSS utilizado.
 */
import { build, transform } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const tailwindDir = path.dirname(fileURLToPath(import.meta.resolve('tailwindcss/package.json')));

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])));
  return files.flat();
}

async function buildCss() {
  const sources = (await walk(path.join(src, 'web'))).filter((file) => /\.(tsx?|html)$/.test(file));
  const candidates = new Set();
  for (const file of sources) {
    for (const token of (await fs.readFile(file, 'utf8')).split(/[\s"'`]+/)) if (token) candidates.add(token);
  }
  const entry = path.join(src, 'web', 'styles.css');
  const compiler = await compile(await fs.readFile(entry, 'utf8'), {
    base: path.dirname(entry),
    async loadStylesheet(id, base) {
      let file = id === 'tailwindcss' ? path.join(tailwindDir, 'index.css') : id.startsWith('tailwindcss/') ? path.join(tailwindDir, id.slice('tailwindcss/'.length)) : path.resolve(base, id);
      if (!file.endsWith('.css')) file += '.css';
      return { path: file, base: path.dirname(file), content: await fs.readFile(file, 'utf8') };
    },
  });
  const css = compiler.build([...candidates]);
  return (await transform(css, { loader: 'css', minify: true })).code;
}

const browser = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};

async function emitSite(name, entry, css, html) {
  const out = path.join(dist, name);
  await fs.mkdir(out, { recursive: true });
  await build({ ...browser, entryPoints: [path.join(src, 'web', entry)], outfile: path.join(out, 'app.js') });
  await fs.writeFile(path.join(out, 'app.css'), css);
  await fs.writeFile(path.join(out, 'index.html'), html);
}

const started = Date.now();
await fs.rm(dist, { recursive: true, force: true });
const [css, html] = await Promise.all([buildCss(), fs.readFile(path.join(src, 'web', 'index.html'), 'utf8')]);

await Promise.all([
  emitSite('web', 'main.tsx', css, html),
  emitSite('demo', 'main-demo.tsx', css, html),
  build({
    entryPoints: [path.join(src, 'server', 'node', 'main.ts')],
    outfile: path.join(dist, 'server.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'warning',
  }),
]);

const kb = async (file) => `${((await fs.stat(path.join(dist, file))).size / 1024).toFixed(0)} KB`;
console.log(`Compilado en ${Date.now() - started} ms`);
for (const file of ['server.mjs', 'web/app.js', 'web/app.css', 'demo/app.js']) console.log(`  dist/${file}  ${await kb(file)}`);
