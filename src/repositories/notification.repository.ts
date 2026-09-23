import type { MessageTemplateType, NotificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { Pagination } from '../validators/common.schemas';

export interface NotificationCreateData {
  receivableId: string;
  templateType: MessageTemplateType | null;
  status: NotificationStatus;
  sentContent: string;
}

export const notificationRepository = {
  create(data: NotificationCreateData) {
    return prisma.notification.create({ data: { ...data, channel: 'whatsapp' } });
  },

  findMany(
    filters: { receivableId?: string; status?: NotificationStatus },
    pagination: Pagination,
  ) {
    const where: Prisma.NotificationWhereInput = {
      ...(filters.receivableId && { receivableId: filters.receivableId }),
      ...(filters.status && { status: filters.status }),
    };
    return prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        include: {
          receivable: {
            select: { id: true, description: true, customer: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);
  },

  /** Latest successful send per receivable and template type. */
  lastSuccessfulSends(receivableIds: string[], types: MessageTemplateType[]) {
    return prisma.notification.groupBy({
      by: ['receivableId', 'templateType'],
      where: { receivableId: { in: receivableIds }, templateType: { in: types }, status: 'sent' },
      _max: { sentAt: true },
    });
  },
};
