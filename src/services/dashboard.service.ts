import type { ReceivableStatus } from '@prisma/client';
import { env } from '../config/env';
import { projectCashFlow, type CashFlowGrouping } from '../domain/cashFlow';
import { outstandingAmount } from '../domain/receivableStatus';
import { diffInDays, startOfMonth, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { monthlyReportRepository } from '../repositories/monthlyReport.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { toMonthlyReportDto, toReceivableDto } from './dto';

const STATUSES: ReceivableStatus[] = ['pending', 'partial', 'overdue', 'paid'];

export const dashboardService = {
  async summary() {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const [statusTotals, collectedThisMonth, overdue, latestReport] = await Promise.all([
      receivableRepository.statusTotals(),
      paymentRepository.sumBetween(startOfMonth(today), today),
      receivableRepository.findOverdue(10),
      monthlyReportRepository.latest(),
    ]);

    const byStatus = Object.fromEntries(
      STATUSES.map((status) => {
        const row = statusTotals.find((item) => item.status === status);
        const totalAmount = toNumber(row?._sum.totalAmount);
        const paidAmount = toNumber(row?._sum.paidAmount);
        return [
          status,
          {
            count: row?._count._all ?? 0,
            totalAmount: roundMoney(totalAmount),
            outstandingAmount: outstandingAmount({ totalAmount, paidAmount }),
          },
        ];
      }),
    ) as Record<
      ReceivableStatus,
      { count: number; totalAmount: number; outstandingAmount: number }
    >;

    const totalOutstanding = roundMoney(
      byStatus.pending.outstandingAmount +
        byStatus.partial.outstandingAmount +
        byStatus.overdue.outstandingAmount,
    );
    const totalCollected = roundMoney(
      statusTotals.reduce((sum, row) => sum + toNumber(row._sum.paidAmount), 0),
    );

    return {
      currency: env.CURRENCY,
      totals: {
        outstanding: totalOutstanding,
        overdue: byStatus.overdue.outstandingAmount,
        collectedThisMonth: roundMoney(collectedThisMonth),
        collectedAllTime: totalCollected,
        overdueRate:
          totalOutstanding > 0
            ? roundMoney(byStatus.overdue.outstandingAmount / totalOutstanding)
            : 0,
      },
      byStatus,
      overdueAlerts: overdue.map((receivable) => ({
        ...toReceivableDto(receivable),
        daysOverdue: diffInDays(today, receivable.dueDate),
      })),
      latestMonthlyReport: latestReport ? toMonthlyReportDto(latestReport) : null,
    };
  },

  async cashFlow(groupBy: CashFlowGrouping, periods: number) {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const receivables = await receivableRepository.findOutstanding();
    const projection = projectCashFlow(
      receivables.map((receivable) => ({
        dueDate: receivable.dueDate,
        outstanding: outstandingAmount({
          totalAmount: toNumber(receivable.totalAmount),
          paidAmount: toNumber(receivable.paidAmount),
        }),
      })),
      groupBy,
      today,
      periods,
    );
    return { currency: env.CURRENCY, ...projection };
  },
};
