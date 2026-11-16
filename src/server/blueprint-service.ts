/**
 * Motor de generación de Blueprint: decide con qué se genera (proveedor de IA conectado,
 * IA integrada del entorno o motor local) y garantiza siempre un resultado válido.
 */
import { buildBlueprintPrompt, parseBlueprintResponse } from '../core/blueprint/ai';
import { buildBlueprint, interpret, type EngineInput } from '../core/blueprint/engine';
import type { BlueprintContent, BlueprintSource, Interpretation, Project, User } from '../core/types';
import type { Deps } from './deps';
import { ProviderError } from './providers/types';

export interface GeneratedBlueprint {
  source: BlueprintSource;
  sourceLabel: string;
  model: string | null;
  interpretation: Interpretation;
  content: BlueprintContent;
  notes: string[];
}

export const engineInput = (project: Project): EngineInput => ({ name: project.name, categories: project.categories, spec: project.spec });

const TOKEN_BUDGETS = [16_000, 8_000];

export async function generateBlueprint(deps: Deps, user: User, project: Project, engine: 'auto' | 'local'): Promise<GeneratedBlueprint> {
  const input = engineInput(project);
  const draft = { interpretation: interpret(input), blueprint: buildBlueprint(input) };
  const local = (notes: string[] = []): GeneratedBlueprint => ({
    source: 'motor_local',
    sourceLabel: 'el motor local',
    model: null,
    interpretation: draft.interpretation,
    content: draft.blueprint,
    notes,
  });
  if (engine === 'local') return local();

  const prompt = buildBlueprintPrompt(input, draft);
  const records = await deps.repos.providers.list(user.id);
  const connected = records.filter((r) => r.status === 'conectado' && r.model);
  const record = connected.find((r) => r.primary) ?? connected[0];

  if (record && record.model) {
    const adapter = deps.providers.get(record.provider);
    try {
      const apiKey = await deps.platform.decrypt(record.encryptedKey);
      let lastError: unknown = null;
      for (const maxTokens of TOKEN_BUDGETS) {
        try {
          const result = await adapter.complete(apiKey, { model: record.model, system: prompt.system, user: prompt.user, maxTokens, json: true });
          await deps.repos.usage.add({
            id: deps.platform.id(),
            userId: user.id,
            provider: record.provider,
            model: record.model,
            purpose: 'blueprint',
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            createdAt: deps.platform.now(),
          });
          const parsed = parseBlueprintResponse(result.text);
          return { source: record.provider, sourceLabel: adapter.label, model: record.model, interpretation: parsed.interpretation, content: parsed.blueprint, notes: [] };
        } catch (error) {
          lastError = error;
          // Sólo se reintenta con menos tokens si el modelo rechazó el máximo de salida pedido.
          const tokenLimit = error instanceof ProviderError && error.kind === 'solicitud' && /max_tokens|max_completion_tokens|maximum/i.test(error.message);
          if (!tokenLimit) break;
        }
      }
      throw lastError;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error desconocido';
      deps.log('warn', 'blueprint_ai_fallback', { provider: record.provider, model: record.model, reason });
      if (error instanceof ProviderError && error.kind === 'credenciales') {
        await deps.repos.providers.upsert({ ...record, status: 'error', lastError: reason });
      }
      return local([`No se pudo generar con ${adapter.label}: ${reason} Se usó el motor local.`]);
    }
  }

  const builtin = deps.platform.builtinAi;
  if (builtin) {
    try {
      const result = await builtin.complete(prompt);
      const parsed = parseBlueprintResponse(result.text);
      await deps.repos.usage.add({
        id: deps.platform.id(),
        userId: user.id,
        provider: 'claude_integrado',
        model: null,
        purpose: 'blueprint',
        inputTokens: 0,
        outputTokens: 0,
        createdAt: deps.platform.now(),
      });
      return { source: 'claude_integrado', sourceLabel: builtin.label, model: null, interpretation: parsed.interpretation, content: parsed.blueprint, notes: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error desconocido';
      deps.log('warn', 'blueprint_builtin_fallback', { reason });
      return local([`No se pudo generar con ${builtin.label}: ${reason} Se usó el motor local.`]);
    }
  }

  return local();
}
