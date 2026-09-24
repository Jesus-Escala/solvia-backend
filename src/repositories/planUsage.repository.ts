import { basePrisma, prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import { sqlDate } from './sql';

/**
 * What a tenant used of its plan. Raw SQL filters by `requireTenantId()` explicitly (it bypasses
 * the tenant-scope extension); the counts go through the scoped client.
 */
export const planUsageRepository = {
  /** Automatic WhatsApp messages sent since `monthStart` (local calendar, `timeZone`). */
  async automaticMessagesSince(monthStart: Date, timeZone: string): Promise<number> {
    const tenantId = requireTenantId();
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "notifications" n
      JOIN "receivables" r ON r."id" = n."receivableId"
      WHERE r."tenantId" = ${tenantId}
        AND n."automatic" = true
        AND n."status" = 'sent'
        AND n."sentAt" >= ((${sqlDate(monthStart)}::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC')
    `;
    return row?.count ?? 0;
  },

  /** Extra messages bought for the month starting on `monthStart`. */
  async packMessages(monthStart: Date): Promise<number> {
    const tenantId = requireTenantId();
    const result = await basePrisma.messagePack.aggregate({
      where: { tenantId, month: monthStart },
      _sum: { messages: true },
    });
    return result._sum.messages ?? 0;
  },

  countActiveUsers() {
    return prisma.user.count({ where: { active: true } });
  },

  countCustomers() {
    return prisma.customer.count();
  },

  /** Platform admins add packs to any tenant (cross-tenant by design). */
  addPack(tenantId: string, monthStart: Date, messages: number) {
    return basePrisma.messagePack.create({ data: { tenantId, month: monthStart, messages } });
  },
};
