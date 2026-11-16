# Arquitectura y decisiones — TECTUM STUDIO 0.1.0

## 1. Entorno relevado y stack elegido

La primera versión se construyó en un entorno **sin acceso a registros de paquetes**. Se usó lo que estaba
instalado y se dejó cada pieza detrás de una interfaz para poder migrar al stack preferido sin reescribir.

| Preferido en el plan | Usado en 0.1.0 | Motivo | Camino de migración |
| --- | --- | --- | --- |
| Next.js | React 19 + servidor HTTP propio sobre Node | Next.js no estaba disponible | Los manejadores reciben `ApiRequest` y devuelven `ApiResponse` (sin Node ni cookies): se montan tal cual en Route Handlers. Las páginas son componentes React. |
| Tailwind CSS | Tailwind CSS 4 | Disponible | — |
| shadcn/ui | Componentes propios con el mismo enfoque (`clsx`, `tailwind-merge`) | Radix y el CLI no estaban disponibles | Reemplazar `src/web/ui/kit.tsx` y `overlay.tsx` componente por componente. |
| PostgreSQL + Prisma/Drizzle | SQLite (`node:sqlite`) con SQL parametrizado y migraciones numeradas | No había driver de PostgreSQL para Node | Implementar el contrato `Repos` (`src/server/repos/types.ts`) con Drizzle. El SQL actual es portable salvo `AUTOINCREMENT` y `ON CONFLICT`. |
| Monaco, Recharts | No usados todavía | Corresponden a las Fases 4 y 7 | — |
| Zod | Zod 3 | Disponible | — |
| Vitest | Runner nativo de Node (`node --test`) con `tsx` | Vitest no estaba disponible | Las pruebas usan `node:assert`; migrar es mecánico. |
| Playwright | Playwright | Disponible | — |

## 2. Capas

```
Interfaz (src/web)  ──Transport──►  Aplicación (src/server/app.ts)  ──►  Repos · Platform · Providers
                                          │
                                          └── Núcleo (src/core): esquemas, catálogo, motor de Blueprint
```

- **Núcleo (`src/core`)**: isomórfico. Los esquemas Zod son la única fuente de verdad de tipos y validaciones.
- **Aplicación (`src/server`)**: función pura `handle(ApiRequest) → ApiResponse`. Rutas por dominio
  (`routes/auth.ts`, `routes/projects.ts`, `routes/providers.ts`); toda ruta protegida verifica sesión y
  propiedad del recurso.
- **Repos**: contrato de persistencia con dos implementaciones, SQLite (servidor) y memoria (pruebas y demo).
- **Platform**: lo que depende del entorno (hash de contraseñas, cifrado, archivos, IA integrada).
- **Providers**: `AiProviderAdapter` con adaptadores de Anthropic (Models + Messages API) y OpenAI
  (Models + Chat Completions). Gemini está declarado como pendiente en el registro.
- **Adaptadores de transporte**: `src/server/node` (HTTP real) y `src/demo` (la misma aplicación dentro del
  navegador). Las pruebas de integración corren la aplicación sobre ambos repositorios.

## 3. Motor de Blueprint

1. **Motor local** (`src/core/blueprint/engine.ts` + `knowledge.ts`): 30 arquetipos de solución y 11
   capacidades transversales. Combina categorías elegidas, palabras clave de la descripción y la configuración
   adicional. Marca cada módulo como pedido o implícito y explica por qué. Formula hasta 3 preguntas sólo
   cuando falta información.
2. **IA** (`src/core/blueprint/ai.ts`): el modelo recibe la especificación y el borrador del motor local, y
   debe devolver JSON con la misma estructura. La respuesta se valida con Zod; si no cumple, se descarta.
3. **Servicio** (`src/server/blueprint-service.ts`): proveedor principal conectado → IA integrada del entorno
   → motor local. Registra consumo de tokens. Toda falla queda como aviso en el Blueprint y en el Historial.

Los adjuntos se guardan pero **todavía no se analizan**; eso corresponde a AURA (Fase 5).

## 4. Seguridad

- Contraseñas con scrypt (N=16384) y comparación en tiempo constante.
- Sesiones: token aleatorio de 256 bits; en la base sólo se guarda su SHA-256. Cookie `HttpOnly`,
  `SameSite=Lax`, `Secure` opcional. Cerrar sesión invalida el token en el servidor.
- CSRF: las escrituras con encabezado `Origin` distinto del host se rechazan.
- API Keys de IA: se verifican contra el proveedor, se cifran con AES-256-GCM y nunca vuelven al navegador.
  En el modo demostración no se aceptan credenciales.
- Límite de solicitudes por IP (más estricto en ingreso y registro), límite de tamaño de cuerpo y de adjuntos.
- Adjuntos: lista de extensiones permitidas, nombre saneado, claves de almacenamiento generadas por el
  servidor, entrega siempre como descarga (`application/octet-stream`).
- Encabezados: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Errores centralizados (`AppError`); los inesperados no exponen detalles. Logs estructurados en JSON.
- Auditoría: cada acción relevante se registra con actor (usuario, AURA o sistema) y nivel.

Pendiente para fases posteriores: recuperación de contraseña, 2FA, roles por proyecto y colaboradores,
ejecución aislada de código generado (Fases 3 y 4).

## 5. Internacionalización

Los textos de la interfaz están en `src/web/i18n/es.ts` con el tipo `Messages`. Sumar inglés o portugués es
crear otro archivo con esa forma y registrarlo en `i18n/index.ts`. El contenido que genera el motor local
está sólo en español.

## 6. Pruebas

- `tests/engine.test.ts`: catálogo, detección, las 86 categorías producen Blueprints válidos, configuración.
- `tests/api.test.ts`: cuentas, ciclo de vida del proyecto, aislamiento entre usuarios, adjuntos, proveedores
  de IA contra un servidor local que imita las APIs oficiales, persistencia. Corre sobre memoria y SQLite.
- `tests/http.test.ts`: cookies, CSRF, límites, archivos estáticos, límite de intentos.
- `tests/e2e.mjs`: recorrido completo en Chromium contra el servidor compilado y contra el modo demostración.

### Lo que no se pudo verificar en el entorno de construcción

- **Generación con IA contra los proveedores reales**: no había API Keys. Los adaptadores se probaron contra
  un servidor local que imita las APIs; contra la API real de Anthropic sólo se comprobó el rechazo de una
  clave inválida.
- **Tipos de la interfaz con `@types/react`**: no estaban instalados. Se verificó con un sustituto mínimo;
  conviene correr `npm run typecheck:web` tras `npm install`.
- **Pruebas de componentes**: no había jsdom ni Testing Library. La interfaz está cubierta por la prueba de
  punta a punta.
- **Tipografía Geist**: se carga desde Google Fonts; en el entorno de construcción se vio con la de respaldo.

## 7. Plan de fases

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Estructura, dashboard, navegación, proyectos, creación | Hecha |
| 2 | AI Builder, interpretación, Blueprint | Hecha |
| 3 | Generación de la aplicación, entorno de proyecto, vista previa, editor visual | Siguiente |
| 4 | Editor de código, versiones y puntos de recuperación | Pendiente |
| 5 | AURA conversacional y agentes especializados | Pendiente |
| 6 | Asignación de proveedores por tarea, Git (GitHub, GitLab, Bitbucket), integraciones | Parcial: conexión de Anthropic y OpenAI |
| 7 | Project Management y Data Intelligence | Pendiente |
| 8 | Deployment, endurecimiento, optimización | Pendiente |

Punto de enganche de la Fase 3: un Blueprint aprobado (`blueprints.status = 'aprobado'`) con módulos, modelo
de datos, roles y navegación ya estructurados y validados es la entrada del generador.
