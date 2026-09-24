import type { MessageTemplateType } from '@prisma/client';
import type { Locale } from '../lib/locale';

export type TemplateVariables = Record<string, string | number | undefined>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replaces `{{placeholder}}` tokens with the given variables.
 * Unknown placeholders are left untouched so missing data is visible instead of silently dropped.
 */
export function renderTemplate(text: string, variables: TemplateVariables): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export const TEMPLATE_PLACEHOLDERS: Record<string, string> = {
  name: 'Customer name',
  business: 'Your business name',
  amount: 'Outstanding amount, formatted with currency',
  date: 'Due date (or statement date for statements)',
  description: 'Receivable description',
  daysOverdue: 'Days past the due date',
  paymentLink: 'Online payment link',
  statementUrl: 'Link to the PDF account statement (statements only)',
};

export const DEFAULT_TEMPLATES: Record<MessageTemplateType, string> = {
  pre_due_reminder:
    'Hi {{name}}, this is a friendly reminder from {{business}}: your payment of {{amount}} for "{{description}}" is due on {{date}}. You can pay online here: {{paymentLink}}',
  due_reminder:
    'Hi {{name}}, your payment of {{amount}} for "{{description}}" to {{business}} is due today ({{date}}). Pay securely here: {{paymentLink}}',
  overdue_reminder:
    'Hi {{name}}, your payment of {{amount}} for "{{description}}" to {{business}} was due on {{date}} and is now {{daysOverdue}} days overdue. Please settle it as soon as possible: {{paymentLink}}',
  statement:
    'Hi {{name}}, thank you for your payment to {{business}}. Your outstanding balance as of {{date}} is {{amount}}. Download your account statement here: {{statementUrl}}',
};

/** Built-in templates in Spanish, used while the tenant keeps the default text. */
export const DEFAULT_TEMPLATES_ES: Record<MessageTemplateType, string> = {
  pre_due_reminder:
    'Hola {{name}}, te recordamos de parte de {{business}} que tu pago de {{amount}} por "{{description}}" vence el {{date}}. Puedes pagar en línea aquí: {{paymentLink}}',
  due_reminder:
    'Hola {{name}}, tu pago de {{amount}} por "{{description}}" a {{business}} vence hoy ({{date}}). Paga de forma segura aquí: {{paymentLink}}',
  overdue_reminder:
    'Hola {{name}}, tu pago de {{amount}} por "{{description}}" a {{business}} venció el {{date}} y lleva {{daysOverdue}} días de atraso. Por favor regularízalo lo antes posible: {{paymentLink}}',
  statement:
    'Hola {{name}}, gracias por tu pago a {{business}}. Tu saldo pendiente al {{date}} es {{amount}}. Descarga tu estado de cuenta aquí: {{statementUrl}}',
};

const DEFAULTS_BY_LOCALE: Record<Locale, Record<MessageTemplateType, string>> = {
  en: DEFAULT_TEMPLATES,
  es: DEFAULT_TEMPLATES_ES,
};

/** The built-in text of a template in the given language. */
export function defaultTemplate(type: MessageTemplateType, locale: Locale): string {
  return DEFAULTS_BY_LOCALE[locale][type];
}

/** Whether `text` is still one of the built-in texts (in any language), i.e. not customised. */
export function isDefaultTemplate(type: MessageTemplateType, text: string): boolean {
  return Object.values(DEFAULTS_BY_LOCALE).some((defaults) => defaults[type] === text);
}

/**
 * The text to send: a customised template as written; a default one in the requested language
 * (tenants are created with the English defaults stored).
 */
export function resolveTemplate(
  type: MessageTemplateType,
  stored: string | undefined,
  locale: Locale,
): string {
  return stored && !isDefaultTemplate(type, stored) ? stored : defaultTemplate(type, locale);
}
