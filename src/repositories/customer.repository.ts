import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import type { DbClient } from './types';

export interface CustomerWriteData {
  name: string;
  phone: string;
  documentId?: string | null;
  notes?: string | null;
}

/** Receivable fields needed to compute risk and balances. */
export const receivableHistorySelect = {
  id: true,
  totalAmount: true,
  paidAmount: true,
  dueDate: true,
  status: true,
  payments: { select: { amount: true, date: true } },
} satisfies Prisma.ReceivableSelect;

function searchFilter(search?: string): Prisma.CustomerWhereInput {
  if (!search) return {};
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { documentId: { contains: search } },
    ],
  };
}

export const customerRepository = {
  findMany(options: {
    search?: string;
    pagination?: Pagination;
    orderBy?: { field: 'name' | 'createdAt'; dir: SortDir };
  }) {
    const where = searchFilter(options.search);
    const { pagination, orderBy = { field: 'name', dir: 'asc' } } = options;
    return prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: [{ [orderBy.field]: orderBy.dir }, { id: 'asc' }],
        include: { receivables: { select: receivableHistorySelect } },
        ...(pagination && {
          skip: (pagination.page - 1) * pagination.pageSize,
          take: pagination.pageSize,
        }),
      }),
      prisma.customer.count({ where }),
    ]);
  },

  findById(id: string, db: DbClient = prisma) {
    return db.customer.findUnique({ where: { id } });
  },

  findByIdWithHistory(id: string) {
    return prisma.customer.findUnique({
      where: { id },
      include: {
        receivables: {
          orderBy: { dueDate: 'desc' },
          include: { payments: { orderBy: { date: 'desc' } } },
        },
      },
    });
  },

  create(data: CustomerWriteData) {
    return prisma.customer.create({ data: { ...data, tenantId: requireTenantId() } });
  },

  update(id: string, data: Partial<CustomerWriteData>) {
    return prisma.customer.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.customer.delete({ where: { id } });
  },
};
