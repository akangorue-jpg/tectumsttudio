/**
 * Cliente de la API. La interfaz no sabe si habla con el servidor por HTTP o con el backend
 * de demostración dentro del navegador: sólo conoce un `Transport`.
 */

export interface TransportRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  file?: Blob;
}

export interface TransportResponse {
  status: number;
  json: unknown;
  blob?: Blob;
  filename?: string;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let transport: Transport = async () => {
  throw new Error('Transporte no configurado');
};
export const setTransport = (next: Transport) => {
  transport = next;
};

let onUnauthenticated: () => void = () => {};
export const setUnauthenticatedHandler = (handler: () => void) => {
  onUnauthenticated = handler;
};

async function send(request: TransportRequest): Promise<TransportResponse> {
  let response: TransportResponse;
  try {
    response = await transport(request);
  } catch {
    throw new ApiError(0, 'sin_conexion', 'No se pudo conectar con el servidor. Revisá tu conexión y volvé a intentarlo.');
  }
  if (response.status >= 400) {
    const error = (response.json as { error?: { code?: string; message?: string } } | null)?.error;
    if (response.status === 401 && error?.code === 'no_autenticado') onUnauthenticated();
    throw new ApiError(response.status, error?.code ?? 'error', error?.message ?? 'Ocurrió un error inesperado.');
  }
  return response;
}

export const api = {
  get: async <T>(path: string, query?: Record<string, string>) => (await send({ method: 'GET', path, query })).json as T,
  post: async <T>(path: string, body?: unknown) => (await send({ method: 'POST', path, body: body ?? {} })).json as T,
  patch: async <T>(path: string, body: unknown) => (await send({ method: 'PATCH', path, body })).json as T,
  put: async <T>(path: string, body: unknown) => (await send({ method: 'PUT', path, body })).json as T,
  del: async <T>(path: string) => (await send({ method: 'DELETE', path })).json as T,
  upload: async <T>(path: string, name: string, file: Blob) => (await send({ method: 'POST', path, query: { name }, file })).json as T,
  download: (path: string) => send({ method: 'GET', path }),
};

/** Transporte HTTP contra el servidor de TECTUM STUDIO (misma procedencia, cookie de sesión httpOnly). */
export const httpTransport: Transport = async ({ method, path, query, body, file }) => {
  const search = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query)}` : '';
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (file) {
    headers['content-type'] = file.type || 'application/octet-stream';
    payload = file;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${path}${search}`, { method, headers, body: payload, credentials: 'same-origin' });
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return { status: response.status, json: await response.json() };
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  return { status: response.status, json: null, blob: await response.blob(), filename: match ? decodeURIComponent(match[1]!) : 'archivo' };
};
