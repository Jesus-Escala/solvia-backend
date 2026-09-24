import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { Pagination, SortDir } from '../validators/common.schemas';
import { escapeLike } from './sql';
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
    orderBy?: { field: 'name' | 'phone' | 'createdAt'; dir: SortDir };
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

  /**
   * Picker search: id, name, phone and what the customer owes, computed in SQL (no receivable
   * rows loaded). Without text, the ones who owe the most first; with text, names starting with
   * it first. Matches name (trigram index), phone digits or document. Raw SQL: explicit tenant.
   */
  lookup(search: string, limit: number) {
    const tenantId = requireTenantId();
    const text = search.trim();
    const pattern = escapeLike(text);
    const digits = text.replace(/\D/g, '');
    return prisma.$queryRaw<
      Array<{ id: string; name: string; phone: string; outstanding: Prisma.Decimal | null }>
    >`
      SELECT c."id", c."name", c."phone",
             SUM(GREATEST(r."totalAmount" - r."paidAmount", 0))
               FILTER (WHERE r."status" <> 'paid') AS "outstanding"
      FROM "customers" c
      LEFT JOIN "receivables" r ON r."customerId" = c."id" AND r."tenantId" = ${tenantId}
      WHERE c."tenantId" = ${tenantId}
        AND (${text} = ''
             OR c."name" ILIKE '%' || ${pattern} || '%'
             OR (${digits} <> '' AND length(${digits}) >= 3 AND c."phone" LIKE '%' || ${digits} || '%')
             OR c."documentId" = ${text})
      GROUP BY c."id", c."name", c."phone"
      ORDER BY CASE WHEN ${text} = '' THEN 0 ELSE (c."name" ILIKE ${pattern} || '%')::int END DESC,
               CASE WHEN ${text} = '' THEN COALESCE(SUM(GREATEST(r."totalAmount" - r."paidAmount", 0))
                 FILTER (WHERE r."status" <> 'paid'), 0) ELSE 0 END DESC,
               c."name" ASC, c."id" ASC
      LIMIT ${limit}
    `;
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
