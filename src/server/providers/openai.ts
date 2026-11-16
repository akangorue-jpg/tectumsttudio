/**
 * Adaptador de OpenAI sobre la API oficial: Models API y Chat Completions API.
 * Requiere una API Key de la plataforma de OpenAI; una suscripción a ChatGPT no la incluye.
 */
import { ProviderError, providerFetch, type AiProviderAdapter, type FetchLike } from './types';

const NOT_CHAT = /embedding|whisper|tts|dall-e|audio|realtime|image|moderation|transcribe|search|instruct|codex|babbage|davinci/;
const CHAT_PREFIX = /^(gpt-|chatgpt-|o\d)/;

export function createOpenAiAdapter(fetchImpl: FetchLike, baseUrl = 'https://api.openai.com'): AiProviderAdapter {
  const label = 'OpenAI';
  const headers = (apiKey: string) => ({ authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' });

  return {
    id: 'openai',
    label: 'OpenAI',

    async listModels(apiKey) {
      const payload = (await providerFetch(fetchImpl, label, `${baseUrl}/v1/models`, { method: 'GET', headers: headers(apiKey) }, 15_000)) as {
        data?: { id?: unknown; created?: unknown }[];
      };
      const models = (payload.data ?? [])
        .filter((m): m is { id: string; created?: unknown } => typeof m.id === 'string' && CHAT_PREFIX.test(m.id) && !NOT_CHAT.test(m.id))
        .sort((a, b) => Number(b.created ?? 0) - Number(a.created ?? 0))
        .map((m) => ({ id: m.id, label: m.id }));
      if (models.length === 0) throw new ProviderError('respuesta', 'OpenAI no informó modelos de chat disponibles para esta API Key.');
      return models;
    },

    async complete(apiKey, request) {
      const payload = (await providerFetch(
        fetchImpl,
        label,
        `${baseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: headers(apiKey),
          body: JSON.stringify({
            model: request.model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            max_completion_tokens: request.maxTokens,
            ...(request.json ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        180_000,
      )) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) throw new ProviderError('respuesta', 'OpenAI devolvió una respuesta sin texto.');
      return { text, inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 };
    },
  };
}
