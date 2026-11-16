import type { AiPrompt } from '../core/blueprint/ai';
import type { ProviderRegistry } from './providers/types';
import type { Repos } from './repos/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, event: string, data?: Record<string, unknown>) => void;

export interface FileStore {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

/**
 * Servicios que dependen del entorno de ejecución. El servidor Node y el modo demostración
 * del navegador aportan implementaciones distintas del mismo contrato.
 */
export interface Platform {
  mode: 'servidor' | 'demo';
  /** true sólo si las credenciales pueden cifrarse y guardarse fuera del navegador. */
  secureSecrets: boolean;
  now(): number;
  id(): string;
  token(): string;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashToken(token: string): Promise<string>;
  encrypt(plain: string): Promise<string>;
  decrypt(data: string): Promise<string>;
  files: FileStore;
  /** IA provista por el entorno sin API Key propia (por ejemplo, Claude dentro de una página de claude.ai). */
  builtinAi: { label: string; complete(prompt: AiPrompt): Promise<{ text: string }> } | null;
}

export interface Config {
  version: string;
  sessionTtlMs: number;
  attachmentBytes: number;
  maxAttachmentsPerProject: number;
}

export const defaultConfig: Config = {
  version: '0.1.0',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  attachmentBytes: 15 * 1024 * 1024,
  maxAttachmentsPerProject: 20,
};

export interface Deps {
  repos: Repos;
  platform: Platform;
  providers: ProviderRegistry;
  log: Logger;
  config: Config;
}
