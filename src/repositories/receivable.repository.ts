import { Prisma, type PaymentMethod, type ReceivableStatus } from '@prisma/client';
import { currentLocale, type Locale } from '../lib/locale';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { ListReceivablesQuery } from '../validators/receivable.schemas';
import { sqlDate } from './sql';
import type { DbClient } from './types';

export const customerSummarySelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

export interface ReceivableCreateData {
  customerId: string;
  description: string;
  totalAmount: number;
  issueDate: Date;
  dueDate: Date;
  status: ReceivableStatus;
}

export type ReceivableUpdateData = Partial<Omit<ReceivableCreateData, 'customerId'>> & {
  paidAmount?: number | { increment: number };
};

function buildWhere(query: Partial<ListReceivablesQuery>): Prisma.ReceivableWhereInput {
  const where: Prisma.ReceivableWhereInput = {};
  if (query.status?.length) where.status = { in: query.status };
  if (query.customerId) where.customerId = query.customerId;
  if (query.search) {
    where.OR = [
      { description: { contains: query.search, mode: 'insensitive' } },
      { customer: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  if (query.dueFrom || query.dueTo) {
    where.dueDate = {
      ...(query.dueFrom && { gte: query.dueFrom }),
      ...(query.dueTo && { lte: query.dueTo }),
    };
  }
  return where;
}

function buildOrderBy(
  query: Pick<ListReceivablesQuery, 'sortBy' | 'sortDir'>,
): Prisma.ReceivableOrderByWithRelationInput[] {
  const primary: Prisma.ReceivableOrderByWithRelationInput =
    query.sortBy === 'customer'
      ? { customer: { name: query.sortDir } }
      : { [query.sortBy]: query.sortDir };
  // Stable secondary order so pagination never repeats or skips rows.
  return [primary, { createdAt: 'asc' }, { id: 'asc' }];
}

/** `ILIKE` pattern for a user search: `%` and `_` are matched literally. */
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Position of each payment method in alphabetical order of its label in each language, so the
 * list sorts by what the user reads ("Efectivo, Plin, Transferencia, Yape"), not by the code.
 */
const METHOD_ORDER: Record<Locale, PaymentMethod[]> = {
  es: ['cash', 'plin', 'bank_transfer', 'yape'],
  en: ['bank_transfer', 'cash', 'plin', 'yape'],
};

/** Sort keys Prisma cannot express: the open balance and the method of the latest payment. */
function rawOrder(sortBy: 'outstanding' | 'paymentMethod'): Prisma.Sql {
  if (sortBy === 'outstanding') return Prisma.sql`(r."totalAmount" - r."paidAmount")`;
  const cases = METHOD_ORDER[currentLocale()].map(
    (method, index) => Prisma.sql`WHEN ${method} THEN ${index}`,
  );
  return Prisma.sql`(
    SELECT CASE p."method"::text ${Prisma.join(cases, ' ')} END
    FROM "payments" p
    WHERE p."receivableId" = r."id"
    ORDER BY p."date" DESC, p."id" DESC
    LIMIT 1
  )`;
}

/**
 * Ids of one page ordered by a computed key (see `rawOrder`). Same filters as `buildWhere`,
 * with the tenant filter explicit (raw queries skip the tenant scope). Receivables without a
 * value (no payments yet) always go last.
 */
function idsByRawOrder(query: ListReceivablesQuery, sortBy: 'outstanding' | 'paymentMethod') {
  const conditions: Prisma.Sql[] = [Prisma.sql`r."tenantId" = ${requireTenantId()}`];
  if (query.status?.length) {
    conditions.push(Prisma.sql`r."status"::text IN (${Prisma.join(query.status)})`);
  }
  if (query.customerId) conditions.push(Prisma.sql`r."customerId" = ${query.customerId}`);
  if (query.search) {
    const pattern = likePattern(query.search);
    conditions.push(Prisma.sql`(r."description" ILIKE ${pattern} OR c."name" ILIKE ${pattern})`);
  }
  if (query.dueFrom) conditions.push(Prisma.sql`r."dueDate" >= ${sqlDate(query.dueFrom)}`);
  if (query.dueTo) conditions.push(Prisma.sql`r."dueDate" <= ${sqlDate(query.dueTo)}`);
  const direction = Prisma.raw(query.sortDir === 'desc' ? 'DESC' : 'ASC');
  return prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r."id"
    FROM "receivables" r
    JOIN "customers" c ON c."id" = r."customerId"
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY ${rawOrder(sortBy)} ${direction} NULLS LAST, r."createdAt" ASC, r."id" ASC
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
  `;
}

export const receivableRepository = {
  async findManyByRawOrder(query: ListReceivablesQuery, sortBy: 'outstanding' | 'paymentMethod') {
    const [ids, total] = await Promise.all([
      idsByRawOrder(query, sortBy),
      prisma.receivable.count({ where: buildWhere(query) }),
    ]);
    const rows = await prisma.receivable.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: {
        customer: { select: customerSummarySelect },
        payments: { select: { method: true }, orderBy: { date: 'desc' } },
      },
    });
    const position = new Map(ids.map((row, index) => [row.id, index]));
    rows.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    return [rows, total] as const;
  },

  findMany(query: ListReceivablesQuery) {
    const where = buildWhere(query);
    return prisma.$transaction([
      prisma.receivable.findMany({
        where,
        include: {
          customer: { select: customerSummarySelect },
          // Only the method of each payment: the list shows how a receivable was paid.
          payments: { select: { method: true }, orderBy: { date: 'desc' } },
        },
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.receivable.count({ where }),
    ]);
  },

  findById(id: string, db: DbClient = prisma) {
    return db.receivable.findUnique({
      where: { id },
      include: { customer: { select: customerSummarySelect } },
    });
  },

  findByIdWithDetails(id: string) {
    return prisma.receivable.findUnique({
      where: { id },
      include: {
        customer: { select: customerSummarySelect },
        payments: { orderBy: { date: 'desc' } },
        notifications: { orderBy: { sentAt: 'desc' }, take: 20 },
      },
    });
  },

  /** Unpaid receivables due on or before `until`, with customer contact data. */
  findReminderCandidates(until: Date) {
    return prisma.receivable.findMany({
      where: { status: { not: 'paid' }, dueDate: { lte: until } },
      include: { customer: { select: customerSummarySelect } },
      orderBy: { dueDate: 'asc' },
    });
  },

  /** Balances of all unpaid receivables (dashboard and reports). */
  findOutstanding() {
    return prisma.receivable.findMany({
      where: { status: { not: 'paid' } },
      select: {
        id: true,
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        status: true,
        customer: { select: customerSummarySelect },
      },
    });
  },

  findOverdue(take: number) {
    return prisma.receivable.findMany({
      where: { status: 'overdue' },
      include: { customer: { select: customerSummarySelect } },
      orderBy: { dueDate: 'asc' },
      take,
    });
  },

  statusTotals() {
    return prisma.receivable.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { totalAmount: true, paidAmount: true },
    });
  },

  create(data: ReceivableCreateData) {
    return prisma.receivable.create({
      data: { ...data, tenantId: requireTenantId() },
      include: { customer: { select: customerSummarySelect } },
    });
  },

  update(id: string, data: ReceivableUpdateData, db: DbClient = prisma) {
    return db.receivable.update({
      where: { id },
      data,
      include: { customer: { select: customerSummarySelect } },
    });
  },

  delete(id: string) {
    return prisma.receivable.delete({ where: { id } });
  },

  /** Flags unpaid receivables whose due date has passed as overdue. */
  markOverdue(today: Date) {
    return prisma.receivable.updateMany({
      where: { status: { in: ['pending', 'partial'] }, dueDate: { lt: today } },
      data: { status: 'overdue' },
    });
  },
};
