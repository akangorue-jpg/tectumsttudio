import type { ProviderId } from '../../core/types';

export interface AiModel {
  id: string;
  label: string;
}

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** Pide al proveedor una respuesta en JSON cuando lo soporta de forma nativa. */
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type ProviderErrorKind = 'credenciales' | 'limite' | 'red' | 'solicitud' | 'respuesta';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;
  constructor(kind: ProviderErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Interfaz común de los proveedores de IA. Cada adaptador habla con la API oficial de su
 * proveedor; el resto de la plataforma sólo conoce este contrato.
 */
export interface AiProviderAdapter {
  id: ProviderId;
  label: string;
  /** Verifica la credencial y devuelve los modelos disponibles para esa cuenta. */
  listModels(apiKey: string): Promise<AiModel[]>;
  complete(apiKey: string, request: CompletionRequest): Promise<CompletionResult>;
}

export interface ProviderDescriptor {
  id: ProviderId | 'gemini';
  label: string;
  availability: 'implementado' | 'pendiente';
}

export interface ProviderRegistry {
  get(id: ProviderId): AiProviderAdapter;
  describe(): ProviderDescriptor[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Ejecuta una llamada HTTP y traduce fallas de red y de estado a ProviderError. */
export async function providerFetch(fetchImpl: FetchLike, label: string, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ProviderError('red', timedOut ? `${label} no respondió a tiempo.` : `No se pudo conectar con ${label}. Revisá la conexión de red del servidor.`);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = extractErrorMessage(payload);
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('credenciales', `${label} rechazó la API Key${detail ? `: ${detail}` : '.'}`, response.status);
    }
    if (response.status === 429) {
      throw new ProviderError('limite', `${label} informó que se superó el límite de uso o no hay crédito disponible${detail ? `: ${detail}` : '.'}`, 429);
    }
    throw new ProviderError(response.status >= 500 ? 'red' : 'solicitud', `${label} devolvió un error (${response.status})${detail ? `: ${detail}` : '.'}`, response.status);
  }
  if (payload === null || typeof payload !== 'object') throw new ProviderError('respuesta', `${label} devolvió una respuesta que no se pudo interpretar.`);
  return payload;
}

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === 'string') return error.slice(0, 300);
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message.slice(0, 300);
    }
  }
  return '';
}
