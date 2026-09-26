import { z } from 'zod';

export const templateTypeSchema = z.enum([
  'pre_due_reminder',
  'due_reminder',
  'overdue_reminder',
  'statement',
]);

export const templateTypeParamSchema = z.object({ type: templateTypeSchema });

export const updateTemplateSchema = z.object({
  text: z.string().trim().min(10, 'Template must be at least 10 characters').max(1000),
});

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  daysBeforeDue: z.number().int().min(0).max(30),
  onDueDate: z.boolean(),
  overdueEveryDays: z.number().int().min(0).max(30),
});

/** Business settings: the language automatic reminders are written in. */
export const businessSettingsSchema = z.object({ language: z.enum(['es', 'en']) });

export const cashFlowQuerySchema = z.object({
  groupBy: z.enum(['week', 'month']).default('week'),
  periods: z.coerce.number().int().min(1).max(24).default(8),
});

export const concentrationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(20),
});

/** Reporting period in `YYYY-MM` format. */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must use the YYYY-MM format');

export const reportPeriodParamSchema = z.object({ period: periodSchema });

export const generateReportSchema = z.object({ period: periodSchema.optional() });

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;
