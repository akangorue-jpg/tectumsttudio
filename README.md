# TECTUM STUDIO

**Describí tu idea. Convertila en software. Desarrollala. Controlá cada detalle.**

Plataforma de desarrollo de software asistida por IA. Esta versión (0.1.0) cubre las **Fases 1 y 2** del plan
maestro —estructura, dashboard, sistema de proyectos, AI Builder y Project Blueprint— más la conexión de
proveedores de IA que el AI Builder necesita.

## Qué funciona hoy

| Área | Estado |
| --- | --- |
| Cuentas: registro, ingreso, sesión segura, perfil, tema claro/oscuro | Funciona |
| Dashboard con indicadores, proyectos por estado y actividad (datos reales) | Funciona |
| Mis proyectos: búsqueda, filtros, renombrar, pausar, archivar, reactivar, eliminar | Funciona |
| Crear proyecto: 7 familias y 86 categorías, buscador, «No estoy seguro», descripción, adjuntos, configuración | Funciona |
| Interpretación del requerimiento: tipo de solución, funcionalidades pedidas e implícitas, preguntas sólo si falta información | Funciona |
| Project Blueprint de 14 secciones, versiones, aprobación, aviso de versión desactualizada | Funciona |
| Proveedores de IA: Anthropic y OpenAI por API Key cifrada en el servidor, verificación, modelo, principal, consumo | Funciona (ver «Lo que no se pudo verificar») |
| Historial: registro de auditoría de cada acción | Funciona |
| Modo demostración (todo en el navegador, sin backend) | Funciona |
| Editor visual, Code Editor, AURA conversacional, Version Control, Integraciones, Deployment, módulos de PM y Data Analytics | **No implementado**: figuran en la navegación con la fase en la que llegan |

Sin un proveedor de IA conectado, la interpretación y el Blueprint los produce un **motor local de reglas**
(determinístico, sin IA) y la interfaz lo indica en cada lugar. Con un proveedor conectado, el modelo refina
ese borrador; si la IA falla o devuelve algo inválido, se usa el motor local y queda un aviso.

## Cómo ejecutarlo

Requiere **Node.js 22.13 o superior**. El servidor compilado no tiene dependencias de runtime.

```bash
npm install
npm run build        # compila servidor, interfaz y modo demostración en dist/
npm start            # abrir http://127.0.0.1:3000
```

La carpeta `dist/` no se versiona. El paquete `tectum-studio-0.1.0.zip` sí la incluye: ahí alcanza con
`node dist/server.mjs`.

Otros comandos:

```bash
npm run typecheck    # núcleo, servidor y pruebas (estricto)
npm run typecheck:web
npm test             # 32 pruebas unitarias y de integración
npm run test:e2e     # recorrido completo en Chromium (requiere `npx playwright install chromium`)
```

Variables de entorno: `PORT` (3000), `HOST` (127.0.0.1), `TECTUM_DATA_DIR` (./data), `TECTUM_SECRET_KEY`
(32 bytes en base64; si falta se genera `data/secret.key`), `TECTUM_SECURE_COOKIES=1` detrás de HTTPS,
`TECTUM_TRUST_PROXY=1` detrás de un proxy propio, `LOG_LEVEL`.

Los datos viven en `TECTUM_DATA_DIR`: `tectum.db` (SQLite), `files/` (adjuntos) y `secret.key`.
**Resguardá `secret.key`**: sin ella no se pueden descifrar las API Keys guardadas.

El modo demostración es estático: servir `dist/demo/` con cualquier servidor de archivos.

## Estructura

```
src/core/        Dominio sin dependencias de entorno: esquemas Zod, catálogo, motor de Blueprint
src/server/      Aplicación (rutas, servicios), repositorios, adaptadores de IA
src/server/node/ Adaptador HTTP de Node, criptografía y archivos
src/demo/        Backend del modo demostración (la misma aplicación dentro del navegador)
src/web/         Interfaz React + Tailwind
tests/           Pruebas unitarias, de integración, HTTP y de punta a punta
docs/            Arquitectura y decisiones
```

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para las decisiones técnicas y el plan de fases.
