import { es, type Messages } from './es';

/** Idiomas disponibles. Inglés y portugués se agregan implementando `Messages`. */
const catalogs: Record<string, Messages> = { es };

let current: Messages = es;

export function setLocale(locale: string) {
  current = catalogs[locale] ?? es;
}

/** Devuelve los textos del idioma activo. */
export const useT = (): Messages => current;

export type { Messages, ModuleSlug } from './es';
