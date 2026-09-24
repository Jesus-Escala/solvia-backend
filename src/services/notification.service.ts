import type { MessageTemplateType, NotificationStatus } from '@prisma/client';
import { renderTemplate, type TemplateVariables } from '../domain/template';
import { logger } from '../lib/logger';
import { whatsAppProvider, type WhatsAppProvider } from '../providers/whatsapp';
import {
  notificationRepository,
  type NotificationOrder,
} from '../repositories/notification.repository';
import { paginate, type Pagination } from '../validators/common.schemas';
import { toNotificationDto } from './dto';
import { planService } from './plan.service';

export interface SendMessageParams {
  receivableId: string;
  to: string;
  templateType: MessageTemplateType;
  templateText: string;
  variables: TemplateVariables;
  /**
   * Sent by Solvia through the provider: counts against the plan's automatic messages of the
   * month, and is not sent once they are used up. False for manual reminders (the owner sends
   * them from their own WhatsApp), which are never limited.
   */
  automatic: boolean;
  /** Set by callers that already track the quota themselves (the reminder job). */
  quotaChecked?: boolean;
}

export function createNotificationService(provider: WhatsAppProvider) {
  return {
    /**
     * Sends a WhatsApp message and logs the attempt (sent or failed) in the Notification table.
     * `limitReached`: an automatic message was not sent because the month's quota is used up
     * (the caller can offer to send it manually).
     */
    async sendWhatsApp(params: SendMessageParams) {
      if (
        params.automatic &&
        !params.quotaChecked &&
        (await planService.automaticMessagesLeft()) <= 0
      ) {
        const notification = await notificationRepository.create({
          receivableId: params.receivableId,
          templateType: params.templateType,
          status: 'failed',
          sentContent: renderTemplate(params.templateText, params.variables),
        });
        return { ...toNotificationDto(notification), limitReached: true };
      }

      let status: NotificationStatus = 'failed';
      let content = params.templateText;
      try {
        const result = await provider.send(
          params.to,
          { type: params.templateType, text: params.templateText },
          params.variables,
        );
        status = result.success ? 'sent' : 'failed';
        content = result.content;
        if (!result.success) {
          logger.warn(
            `WhatsApp send failed for receivable ${params.receivableId}: ${result.error}`,
          );
        }
      } catch (error) {
        logger.error(`WhatsApp provider "${provider.name}" threw an error`, error);
      }

      const notification = await notificationRepository.create({
        receivableId: params.receivableId,
        templateType: params.templateType,
        status,
        sentContent: content,
        automatic: params.automatic,
      });
      return { ...toNotificationDto(notification), limitReached: false };
    },

    async list(
      filters: { receivableId?: string; customerId?: string; status?: NotificationStatus },
      pagination: Pagination,
      orderBy: NotificationOrder | null = null,
    ) {
      const [notifications, total] = await notificationRepository.findMany(
        filters,
        pagination,
        orderBy,
      );
      const rows = notifications.map(({ receivable, ...notification }) => ({
        ...toNotificationDto(notification),
        receivable,
      }));
      return paginate(rows, total, pagination);
    },
  };
}

export const notificationService = createNotificationService(whatsAppProvider);
