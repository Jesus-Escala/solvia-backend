import type { MessageTemplateType } from '@prisma/client';

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
