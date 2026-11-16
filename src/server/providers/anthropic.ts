/**
 * Adaptador de Anthropic (Claude) sobre la API oficial: Models API y Messages API.
 * Requiere una API Key de la Claude Console; la suscripción a Claude no la reemplaza
 * (algunos planes incluyen crédito mensual de API que se reclama en la Console).
 */
import { ProviderError, providerFetch, type AiProviderAdapter, type FetchLike } from './types';

const API_VERSION = '2023-06-01';

export function createAnthropicAdapter(fetchImpl: FetchLike, baseUrl = 'https://api.anthropic.com'): AiProviderAdapter {
  const label = 'Anthropic';
  const headers = (apiKey: string) => ({
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'content-type': 'application/json',
  });

  return {
    id: 'anthropic',
    label: 'Anthropic Claude',

    async listModels(apiKey) {
      const payload = (await providerFetch(fetchImpl, label, `${baseUrl}/v1/models?limit=100`, { method: 'GET', headers: headers(apiKey) }, 15_000)) as {
        data?: { id?: unknown; display_name?: unknown }[];
      };
      // La API devuelve primero los modelos más recientes; se conserva ese orden.
      const models = (payload.data ?? [])
        .filter((m): m is { id: string; display_name?: unknown } => typeof m.id === 'string')
        .map((m) => ({ id: m.id, label: typeof m.display_name === 'string' ? m.display_name : m.id }));
      if (models.length === 0) throw new ProviderError('respuesta', 'Anthropic no informó modelos disponibles para esta API Key.');
      return models;
    },

    async complete(apiKey, request) {
      const payload = (await providerFetch(
        fetchImpl,
        label,
        `${baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers: headers(apiKey),
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.user }],
          }),
        },
        180_000,
      )) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = (payload.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('');
      if (!text) throw new ProviderError('respuesta', 'Anthropic devolvió una respuesta sin texto.');
      return { text, inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0 };
    },
  };
}
