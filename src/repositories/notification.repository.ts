import type { MessageTemplateType, NotificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { Pagination, SortDir } from '../validators/common.schemas';

export interface NotificationCreateData {
  receivableId: string;
  templateType: MessageTemplateType | null;
  status: NotificationStatus;
  sentContent: string;
  /** Sent by Solvia through the provider (counts against the plan). */
  automatic?: boolean;
}

export interface NotificationOrder {
  field: 'sentAt' | 'customer' | 'type' | 'status' | 'content';
  dir: SortDir;
}

/** Newest first by default; any other column keeps the newest first among equals. */
function notificationOrderBy(
  orderBy: NotificationOrder | null,
): Prisma.NotificationOrderByWithRelationInput[] {
  if (!orderBy) return [{ sentAt: 'desc' }, { id: 'desc' }];
  const { field, dir } = orderBy;
  const first: Prisma.NotificationOrderByWithRelationInput =
    field === 'customer'
      ? { receivable: { customer: { name: dir } } }
      : field === 'type'
        ? { templateType: { sort: dir, nulls: 'last' } }
        : field === 'content'
          ? { sentContent: dir }
          : { [field]: dir };
  return [first, { sentAt: 'desc' }, { id: 'desc' }];
}

export const notificationRepository = {
  create(data: NotificationCreateData) {
    return prisma.notification.create({ data: { ...data, channel: 'whatsapp' } });
  },

  findMany(
    filters: { receivableId?: string; customerId?: string; status?: NotificationStatus },
    pagination: Pagination,
    orderBy: NotificationOrder | null = null,
  ) {
    const where: Prisma.NotificationWhereInput = {
      ...(filters.receivableId && { receivableId: filters.receivableId }),
      // Merged with the tenant filter on `receivable` by the scoped client.
      ...(filters.customerId && { receivable: { customerId: filters.customerId } }),
      ...(filters.status && { status: filters.status }),
    };
    return prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: notificationOrderBy(orderBy),
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
