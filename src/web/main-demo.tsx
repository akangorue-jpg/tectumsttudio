/**
 * Entrada del modo demostración: la interfaz y el backend corren juntos en el navegador.
 * Se usa para probar TECTUM STUDIO sin instalar nada (por ejemplo, publicada como página).
 */
import { createRoot } from 'react-dom/client';
import { createDemoBackend } from '../demo/backend';
import { App } from './App';
import { setTransport } from './lib/api';

const backend = createDemoBackend();

setTransport(async ({ method, path, query, body, file }) => {
  const response = await backend.handle({
    method,
    path,
    query,
    body,
    raw: file ? new Uint8Array(await file.arrayBuffer()) : null,
    contentType: file ? file.type || 'application/octet-stream' : 'application/json',
  });
  if (response.file) {
    return { status: response.status, json: null, blob: new Blob([response.file.data as BlobPart], { type: response.file.contentType }), filename: response.file.filename };
  }
  return { status: response.status, json: response.json ?? null };
});

createRoot(document.getElementById('root')!).render(<App routerMode="memory" onResetDemo={() => backend.reset()} />);
