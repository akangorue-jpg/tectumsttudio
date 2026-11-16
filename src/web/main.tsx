/** Entrada de la interfaz cuando la sirve el backend de TECTUM STUDIO. */
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { httpTransport, setTransport } from './lib/api';

setTransport(httpTransport);
createRoot(document.getElementById('root')!).render(<App routerMode="history" />);
