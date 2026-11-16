import type { ProviderId } from '../../core/types';
import { createAnthropicAdapter } from './anthropic';
import { createOpenAiAdapter } from './openai';
import type { AiProviderAdapter, FetchLike, ProviderRegistry } from './types';

export interface RegistryOptions {
  fetch: FetchLike;
  /** Permite apuntar a servidores alternativos (pruebas o proxies corporativos). */
  baseUrls?: Partial<Record<ProviderId, string>>;
}

/**
 * Registro de proveedores de IA. Para sumar un proveedor nuevo (por ejemplo Google Gemini)
 * alcanza con implementar AiProviderAdapter y registrarlo acá.
 */
export function createProviderRegistry(options: RegistryOptions): ProviderRegistry {
  const adapters: Record<ProviderId, AiProviderAdapter> = {
    anthropic: createAnthropicAdapter(options.fetch, options.baseUrls?.anthropic),
    openai: createOpenAiAdapter(options.fetch, options.baseUrls?.openai),
  };
  return {
    get: (id) => adapters[id],
    describe: () => [
      { id: 'anthropic', label: adapters.anthropic.label, availability: 'implementado' },
      { id: 'openai', label: adapters.openai.label, availability: 'implementado' },
      { id: 'gemini', label: 'Google Gemini', availability: 'pendiente' },
    ],
  };
}
