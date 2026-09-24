import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATES_ES, resolveTemplate } from '../src/domain/template';
import { formatDisplayDate } from '../src/lib/dates';
import { parseLocale, runWithLocale } from '../src/lib/locale';
import { formatMoney } from '../src/lib/money';

describe('parseLocale', () => {
  it('picks the first supported language of Accept-Language', () => {
    expect(parseLocale('es-PE,es;q=0.9,en;q=0.8')).toBe('es');
    expect(parseLocale('fr-FR,en-US;q=0.8')).toBe('en');
    expect(parseLocale('en')).toBe('en');
  });

  it('falls back to English without a supported language', () => {
    expect(parseLocale(undefined)).toBe('en');
    expect(parseLocale('de-DE')).toBe('en');
  });
});

describe('resolveTemplate', () => {
  it('translates a template that still has the built-in text', () => {
    expect(resolveTemplate('statement', DEFAULT_TEMPLATES.statement, 'es')).toBe(
      DEFAULT_TEMPLATES_ES.statement,
    );
    expect(resolveTemplate('statement', undefined, 'en')).toBe(DEFAULT_TEMPLATES.statement);
  });

  it('keeps a customised template as written', () => {
    const custom = 'Hola {{name}}, aquí tu estado: {{statementUrl}}';
    expect(resolveTemplate('statement', custom, 'en')).toBe(custom);
  });
});

describe('localized formatting', () => {
  const date = new Date('2026-09-23T00:00:00.000Z');

  it('formats dates and money in the request language', () => {
    expect(runWithLocale('en', () => formatDisplayDate(date))).toBe('Sep 23, 2026');
    expect(runWithLocale('es', () => formatDisplayDate(date))).toMatch(/^23 set/);
    expect(runWithLocale('es', () => formatMoney(1254, 'PEN')).replace(/\s/g, ' ')).toBe(
      'S/ 1,254.00',
    );
  });
});
