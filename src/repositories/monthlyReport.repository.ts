import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';

export interface MonthlyReportData {
  period: string;
  totalCollected: number;
  totalPending: number;
  topOverdueCustomers: Prisma.InputJsonValue;
}

export const monthlyReportRepository = {
  async upsert(data: MonthlyReportData) {
    const existing = await prisma.monthlyReport.findFirst({ where: { period: data.period } });
    if (existing) {
      return prisma.monthlyReport.update({
        where: { id: existing.id },
        data: { ...data, generatedAt: new Date() },
      });
    }
    return prisma.monthlyReport.create({ data: { ...data, tenantId: requireTenantId() } });
  },

  list(take: number) {
    return prisma.monthlyReport.findMany({ orderBy: { period: 'desc' }, take });
  },

  findByPeriod(period: string) {
    return prisma.monthlyReport.findFirst({ where: { period } });
  },

  latest() {
    return prisma.monthlyReport.findFirst({ orderBy: { period: 'desc' } });
  },
};
