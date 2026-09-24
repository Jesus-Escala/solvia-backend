import type { MessageTemplateType } from '@prisma/client';
import { env } from '../config/env';
import { outstandingAmount } from '../domain/receivableStatus';
import {
  determineReminder,
  type ReminderDecision,
  type ReminderType,
} from '../domain/reminderRules';
import type { TemplateVariables } from '../domain/template';
import { AppError } from '../errors/AppError';
import { addDays, diffInDays, formatDisplayDate, todayInTimezone } from '../lib/dates';
import { logger } from '../lib/logger';
import { formatMoney, toNumber } from '../lib/money';
import { paymentProvider } from '../providers/payment';
import { notificationRepository } from '../repositories/notification.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { tenantRepository } from '../repositories/tenant.repository';
import { notificationService } from './notification.service';
import { receivableService } from './receivable.service';
import { whatsAppChatUrl } from '../lib/whatsapp';
import { whatsAppProvider } from '../providers/whatsapp';
import { settingsService } from './settings.service';

const REMINDER_TYPES: ReminderType[] = ['pre_due_reminder', 'due_reminder', 'overdue_reminder'];

type ReminderReceivable = NonNullable<Awaited<ReturnType<typeof receivableRepository.findById>>>;

export interface ReminderRunSummary {
  markedOverdue: number;
  evaluated: number;
  sent: number;
  failed: number;
}

async function buildVariables(
  receivable: ReminderReceivable,
  decision: ReminderDecision,
  businessName: string,
): Promise<TemplateVariables> {
  const outstanding = outstandingAmount({
    totalAmount: toNumber(receivable.totalAmount),
    paidAmount: toNumber(receivable.paidAmount),
  });

  let paymentLink = '';
  try {
    const link = await paymentProvider.createPaymentLink({
      reference: receivable.id,
      amount: outstanding,
      currency: env.CURRENCY,
      description: receivable.description,
      customer: { name: receivable.customer.name, phone: receivable.customer.phone },
    });
    paymentLink = link.url;
  } catch (error) {
    logger.error(`Could not create a payment link for receivable ${receivable.id}`, error);
  }

  return {
    name: receivable.customer.name,
    business: businessName,
    amount: formatMoney(outstanding, env.CURRENCY),
    date: formatDisplayDate(receivable.dueDate),
    description: receivable.description,
    daysOverdue: decision.daysOverdue,
    paymentLink,
  };
}

async function send(
  receivable: ReminderReceivable,
  decision: ReminderDecision,
  context: { businessName: string; templates: Record<MessageTemplateType, string> },
) {
  return notificationService.sendWhatsApp({
    receivableId: receivable.id,
    to: receivable.customer.phone,
    templateType: decision.type,
    templateText: context.templates[decision.type],
    variables: await buildVariables(receivable, decision, context.businessName),
  });
}

export const reminderService = {
  /**
   * Reminder engine for the current tenant: refreshes overdue statuses, evaluates every unpaid
   * receivable against the tenant's rules and sends the reminders that are due.
   */
  async runForCurrentTenant(now = new Date()): Promise<ReminderRunSummary> {
    const today = todayInTimezone(env.APP_TIMEZONE, now);
    const summary: ReminderRunSummary = {
      markedOverdue: await receivableService.refreshOverdueStatuses(today),
      evaluated: 0,
      sent: 0,
      failed: 0,
    };

    const rules = await settingsService.getReminderRules();
    if (!rules.enabled) return summary;

    const candidates = await receivableRepository.findReminderCandidates(
      addDays(today, Math.max(rules.daysBeforeDue, 0)),
    );
    if (candidates.length === 0) return summary;

    const lastSends = await notificationRepository.lastSuccessfulSends(
      candidates.map((receivable) => receivable.id),
      REMINDER_TYPES,
    );
    const lastSentByReceivable = new Map<string, Partial<Record<ReminderType, Date>>>();
    for (const row of lastSends) {
      if (!row.templateType || !row._max.sentAt) continue;
      const entry = lastSentByReceivable.get(row.receivableId) ?? {};
      entry[row.templateType as ReminderType] = todayInTimezone(env.APP_TIMEZONE, row._max.sentAt);
      lastSentByReceivable.set(row.receivableId, entry);
    }

    const [tenant, templates] = await Promise.all([
      tenantRepository.findCurrent(),
      settingsService.getTemplateTexts(),
    ]);
    const context = { businessName: tenant?.name ?? 'Solvia', templates };

    for (const receivable of candidates) {
      summary.evaluated += 1;
      const decision = determineReminder(
        {
          totalAmount: toNumber(receivable.totalAmount),
          paidAmount: toNumber(receivable.paidAmount),
          dueDate: receivable.dueDate,
          lastSent: lastSentByReceivable.get(receivable.id) ?? {},
        },
        rules,
        today,
      );
      if (!decision) continue;

      const notification = await send(receivable, decision, context);
      if (notification.status === 'sent') summary.sent += 1;
      else summary.failed += 1;
    }

    return summary;
  },

  /** Sends a reminder right now, choosing the template from the due date. Ignores the schedule. */
  async sendNow(receivableId: string) {
    const receivable = await receivableService.findOrFail(receivableId);
    const outstanding = outstandingAmount({
      totalAmount: toNumber(receivable.totalAmount),
      paidAmount: toNumber(receivable.paidAmount),
    });
    if (outstanding <= 0) {
      throw new AppError(422, 'RECEIVABLE_ALREADY_PAID', 'This receivable is already paid');
    }

    const today = todayInTimezone(env.APP_TIMEZONE);
    const daysUntilDue = diffInDays(receivable.dueDate, today);
    const decision: ReminderDecision =
      daysUntilDue > 0
        ? { type: 'pre_due_reminder', daysOverdue: 0 }
        : daysUntilDue === 0
          ? { type: 'due_reminder', daysOverdue: 0 }
          : { type: 'overdue_reminder', daysOverdue: -daysUntilDue };

    const [tenant, templates] = await Promise.all([
      tenantRepository.findCurrent(),
      settingsService.getTemplateTexts(),
    ]);
    const notification = await send(receivable, decision, {
      businessName: tenant?.name ?? 'Solvia',
      templates,
    });
    // Without a real provider nothing reaches the customer: like the statement, hand back a
    // click-to-chat link with the same message so the user can send it from their WhatsApp.
    const whatsappUrl =
      whatsAppProvider.name === 'mock'
        ? whatsAppChatUrl(receivable.customer.phone, notification.sentContent)
        : undefined;
    return { ...notification, whatsappUrl };
  },
};
