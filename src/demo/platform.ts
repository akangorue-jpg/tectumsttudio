/**
 * Platform para el modo demostración: toda la aplicación corre dentro del navegador.
 * No hay backend, por lo que no se guardan credenciales y los datos viven en este navegador.
 */
import { errors } from '../core/errors';
import type { FileStore, Platform } from '../server/deps';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Hash no criptográfico de respaldo para entornos sin WebCrypto. Sólo se usa en la demostración local. */
function weakHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

async function sha256(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return `w${weakHash(text)}`;
  return hex(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function derive(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return `debil$${salt}$${weakHash(`${salt}:${password}`)}`;
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256);
  return `pbkdf2$${salt}$${hex(new Uint8Array(bits))}`;
}

function createMemoryFileStore(): FileStore {
  const files = new Map<string, Uint8Array>();
  return {
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

export function createBrowserPlatform(): Platform {
  return {
    mode: 'demo',
    secureSecrets: false,
    now: () => Date.now(),
    id: () => (typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : hex(randomBytes(16))),
    token: () => hex(randomBytes(24)),
    hashPassword: (password) => derive(password, hex(randomBytes(8))),
    async verifyPassword(password, stored) {
      const salt = stored.split('$')[1] ?? '';
      return (await derive(password, salt)) === stored;
    },
    hashToken: sha256,
    async encrypt() {
      throw errors.unavailable('El modo demostración no guarda credenciales.');
    },
    async decrypt() {
      throw errors.unavailable('El modo demostración no guarda credenciales.');
    },
    // Los adjuntos de la demostración viven sólo mientras la página está abierta.
    files: createMemoryFileStore(),
    builtinAi: null,
  };
}
