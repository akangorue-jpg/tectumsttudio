/**
 * Implementación de Platform para el servidor Node: criptografía nativa y archivos en disco.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { errors } from '../../core/errors';
import type { FileStore, Platform } from '../deps';

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

function scryptAsync(password: string, salt: Buffer, params = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, params.keyLength, { N: params.N, r: params.r, p: params.p }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export function createDiskFileStore(root: string): FileStore {
  const resolve = (key: string) => {
    // Las claves las genera el servidor (uuid/uuid); cualquier otra forma se rechaza para evitar recorridos de ruta.
    if (!/^[a-f0-9-]{8,}\/[a-f0-9-]{8,}$/.test(key)) throw errors.validation('Clave de archivo inválida.');
    return path.join(root, key);
  };
  return {
    async put(key, data) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data, { mode: 0o600 });
    },
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(resolve(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async delete(key) {
      await fs.rm(resolve(key), { force: true });
    },
  };
}

export interface NodePlatformOptions {
  /** Clave maestra de 32 bytes para cifrar credenciales (AES-256-GCM). */
  secretKey: Buffer;
  filesDir: string;
}

export function createNodePlatform({ secretKey, filesDir }: NodePlatformOptions): Platform {
  if (secretKey.length !== 32) throw new Error('La clave maestra debe tener 32 bytes.');
  return {
    mode: 'servidor',
    secureSecrets: true,
    now: () => Date.now(),
    id: () => randomUUID(),
    token: () => randomBytes(32).toString('base64url'),

    async hashPassword(password) {
      const salt = randomBytes(16);
      const key = await scryptAsync(password, salt);
      return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
    },
    async verifyPassword(password, stored) {
      const [scheme, n, r, p, salt, hash] = stored.split('$');
      if (scheme !== 'scrypt' || !salt || !hash) return false;
      const expected = Buffer.from(hash, 'base64');
      const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p), keyLength: expected.length });
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
    async hashToken(token) {
      return createHash('sha256').update(token).digest('hex');
    },

    async encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', secretKey, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
    },
    async decrypt(payload) {
      const [version, iv, tag, data] = payload.split('.');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de credencial cifrada desconocido.');
      const decipher = createDecipheriv('aes-256-gcm', secretKey, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    },

    files: createDiskFileStore(filesDir),
    builtinAi: null,
  };
}

/** Carga la clave maestra desde TECTUM_SECRET_KEY o desde un archivo local que se crea en el primer arranque. */
export async function loadSecretKey(dataDir: string, envValue: string | undefined): Promise<{ key: Buffer; source: 'entorno' | 'archivo' | 'archivo_nuevo' }> {
  if (envValue) {
    const key = Buffer.from(envValue, 'base64');
    if (key.length !== 32) throw new Error('TECTUM_SECRET_KEY debe ser una clave de 32 bytes codificada en base64.');
    return { key, source: 'entorno' };
  }
  const file = path.join(dataDir, 'secret.key');
  try {
    const key = Buffer.from((await fs.readFile(file, 'utf8')).trim(), 'base64');
    if (key.length !== 32) throw new Error(`El archivo ${file} no contiene una clave válida.`);
    return { key, source: 'archivo' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const key = randomBytes(32);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, key.toString('base64'), { mode: 0o600 });
  return { key, source: 'archivo_nuevo' };
}
