import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Languages the customer-facing output (PDF statements, WhatsApp messages) is written in. */
export type Locale = 'es' | 'en';

/** Used outside a request (scheduled jobs, scripts) or when the client sends no preference. */
export const DEFAULT_LOCALE: Locale = 'en';

/** `Intl` locale used to format dates and amounts for each language. */
export const INTL_LOCALES: Record<Locale, string> = { es: 'es-PE', en: 'en-US' };

const storage = new AsyncLocalStorage<Locale>();

/** First supported language of an `Accept-Language` header, e.g. "es-PE,es;q=0.9" -> "es". */
export function parseLocale(header: string | undefined): Locale {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.startsWith('es')) return 'es';
    if (tag.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

/**
 * Runs the rest of the request with the interface language the client sent, so everything the
 * request produces for the customer — including work it starts in the background, like the
 * statement sent after a payment — uses it.
 */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run(parseLocale(req.headers['accept-language']), next);
}

export function runWithLocale<T>(locale: Locale, callback: () => T): T {
  return storage.run(locale, callback);
}

export function currentLocale(): Locale {
  return storage.getStore() ?? DEFAULT_LOCALE;
}
