import type { MessageTemplateType, NotificationStatus } from '@prisma/client';
import type { TemplateVariables } from '../domain/template';
import { logger } from '../lib/logger';
import { whatsAppProvider, type WhatsAppProvider } from '../providers/whatsapp';
import { notificationRepository } from '../repositories/notification.repository';
import { paginate, type Pagination } from '../validators/common.schemas';
import { toNotificationDto } from './dto';

export interface SendMessageParams {
  receivableId: string;
  to: string;
  templateType: MessageTemplateType;
  templateText: string;
  variables: TemplateVariables;
}

export function createNotificationService(provider: WhatsAppProvider) {
  return {
    /** Sends a WhatsApp message and logs the attempt (sent or failed) in the Notification table. */
    async sendWhatsApp(params: SendMessageParams) {
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
      });
      return toNotificationDto(notification);
    },

    async list(
      filters: { receivableId?: string; status?: NotificationStatus },
      pagination: Pagination,
    ) {
      const [notifications, total] = await notificationRepository.findMany(filters, pagination);
      const rows = notifications.map(({ receivable, ...notification }) => ({
        ...toNotificationDto(notification),
        receivable,
      }));
      return paginate(rows, total, pagination);
    },
  };
}

export const notificationService = createNotificationService(whatsAppProvider);
