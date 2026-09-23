import type { ReceivableStatus } from '@prisma/client';
import { env } from '../config/env';
import { projectCashFlow, type CashFlowGrouping } from '../domain/cashFlow';
import { agingBuckets, monthlySeries, topDebtors } from '../domain/portfolio';
import { outstandingAmount } from '../domain/receivableStatus';
import type { RiskLevel } from '../domain/riskScore';
import { addDays, addMonths, diffInDays, startOfMonth, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { customerRepository } from '../repositories/customer.repository';
import { monthlyReportRepository } from '../repositories/monthlyReport.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { toMonthlyReportDto, toReceivableDto } from './dto';
import { riskScoreFor } from './risk.service';

const STATUSES: ReceivableStatus[] = ['pending', 'partial', 'overdue', 'paid'];
const TREND_MONTHS = 6;
const TOP_DEBTORS = 6;

/** Same day of the previous month, clamped to that month's last day (e.g. Mar 31 → Feb 28). */
function sameDayLastMonth(today: Date) {
  const lastMonthStart = addMonths(startOfMonth(today), -1);
  const lastMonthEnd = addDays(startOfMonth(today), -1);
  const candidate = addDays(lastMonthStart, today.getUTCDate() - 1);
  return candidate.getTime() > lastMonthEnd.getTime() ? lastMonthEnd : candidate;
}

export const dashboardService = {
  async summary() {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const trendStart = addMonths(startOfMonth(today), -(TREND_MONTHS - 1));

    const [statusTotals, recentPayments, outstanding, overdue, latestReport, [customers]] =
      await Promise.all([
        receivableRepository.statusTotals(),
        paymentRepository.listBetween(trendStart, today),
        receivableRepository.findOutstanding(),
        receivableRepository.findOverdue(10),
        monthlyReportRepository.latest(),
        customerRepository.findMany({}),
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

    // Collections: this month-to-date vs the same period of the previous month.
    const payments = recentPayments.map((payment) => ({
      date: payment.date,
      amount: toNumber(payment.amount),
    }));
    const sumWithin = (from: Date, to: Date) =>
      roundMoney(
        payments
          .filter(
            (payment) =>
              payment.date.getTime() >= from.getTime() && payment.date.getTime() <= to.getTime(),
          )
          .reduce((sum, payment) => sum + payment.amount, 0),
      );
    const collectedThisMonth = sumWithin(startOfMonth(today), today);
    const collectedLastMonthToDate = sumWithin(
      addMonths(startOfMonth(today), -1),
      sameDayLastMonth(today),
    );

    const balances = outstanding.map((receivable) => ({
      customerId: receivable.customer.id,
      name: receivable.customer.name,
      dueDate: receivable.dueDate,
      isOverdue: receivable.status === 'overdue',
      outstanding: outstandingAmount({
        totalAmount: toNumber(receivable.totalAmount),
        paidAmount: toNumber(receivable.paidAmount),
      }),
    }));
    const nextWeek = addDays(today, 7);
    const dueNext7Days = balances.filter(
      (item) =>
        item.dueDate.getTime() >= today.getTime() && item.dueDate.getTime() <= nextWeek.getTime(),
    );

    const riskDistribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0 };
    for (const customer of customers) {
      riskDistribution[riskScoreFor(customer.receivables, today).level] += 1;
    }

    return {
      currency: env.CURRENCY,
      totals: {
        outstanding: totalOutstanding,
        overdue: byStatus.overdue.outstandingAmount,
        collectedThisMonth,
        collectedLastMonthToDate,
        collectedAllTime: totalCollected,
        overdueRate:
          totalOutstanding > 0
            ? roundMoney(byStatus.overdue.outstandingAmount / totalOutstanding)
            : 0,
        dueNext7Days: {
          amount: roundMoney(dueNext7Days.reduce((sum, item) => sum + item.outstanding, 0)),
          count: dueNext7Days.length,
        },
        customers: customers.length,
      },
      byStatus,
      aging: agingBuckets(balances, today),
      collectionTrend: monthlySeries(payments, today, TREND_MONTHS),
      topDebtors: topDebtors(balances, TOP_DEBTORS),
      riskDistribution,
      overdueAlerts: overdue.map((receivable) => ({
        ...toReceivableDto(receivable),
        daysOverdue: diffInDays(today, receivable.dueDate),
      })),
      latestMonthlyReport: latestReport ? toMonthlyReportDto(latestReport) : null,
      generatedAt: new Date().toISOString(),
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
