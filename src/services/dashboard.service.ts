import {
  MessageTemplateType,
  PaymentMethod,
  type Prisma,
  type ReceivableStatus,
} from '@prisma/client';
import { env } from '../config/env';
import {
  bucketSeries,
  completeBreakdown,
  moneyMetric,
  openBalanceWithin,
  ratio,
  sumWithin,
  weekdayTotals,
  type AnalyticsPeriod,
  type DateRange,
} from '../domain/analytics';
import { projectCashFlow, type CashFlowGrouping } from '../domain/cashFlow';
import { CLASS_THRESHOLDS, debtConcentration } from '../domain/concentration';
import { agingBuckets } from '../domain/portfolio';
import { outstandingAmount } from '../domain/receivableStatus';
import { riskScoreFromOutcomes, type RiskLevel, type RiskOutcome } from '../domain/riskScore';
import {
  addDays,
  addMonths,
  diffInDays,
  formatDateOnly,
  startOfMonth,
  todayInTimezone,
} from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { analyticsRepository } from '../repositories/analytics.repository';
import { monthlyReportRepository } from '../repositories/monthlyReport.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { toMonthlyReportDto, toReceivableDto } from './dto';

const STATUSES: ReceivableStatus[] = ['pending', 'partial', 'overdue', 'paid'];
const PAYMENT_METHODS = Object.values(PaymentMethod);
const TEMPLATE_TYPES = Object.values(MessageTemplateType);
/** A reminded receivable counts as "paid after reminder" with a payment within these days. */
const PAID_AFTER_REMINDER_DAYS = 7;
const TREND_MONTHS = 6;
const TOP_DEBTORS = 6;
const TOP_PAYERS = 8;

/** Same day of the previous month, clamped to that month's last day (e.g. Mar 31 → Feb 28). */
function sameDayLastMonth(today: Date) {
  const lastMonthStart = addMonths(startOfMonth(today), -1);
  const lastMonthEnd = addDays(startOfMonth(today), -1);
  const candidate = addDays(lastMonthStart, today.getUTCDate() - 1);
  return candidate.getTime() > lastMonthEnd.getTime() ? lastMonthEnd : candidate;
}

type StatusTotals = Awaited<ReturnType<typeof receivableRepository.statusTotals>>;

/** Count, total and open balance per receivable status, plus the portfolio totals. */
function statusBreakdown(statusTotals: StatusTotals) {
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
  ) as Record<ReceivableStatus, { count: number; totalAmount: number; outstandingAmount: number }>;

  const outstanding = roundMoney(
    byStatus.pending.outstandingAmount +
      byStatus.partial.outstandingAmount +
      byStatus.overdue.outstandingAmount,
  );
  const overdue = byStatus.overdue.outstandingAmount;
  return {
    byStatus,
    outstanding,
    overdue,
    overdueRate: outstanding > 0 ? roundMoney(overdue / outstanding) : 0,
    openReceivables: byStatus.pending.count + byStatus.partial.count + byStatus.overdue.count,
    collectedAllTime: roundMoney(
      statusTotals.reduce((sum, row) => sum + toNumber(row._sum.paidAmount), 0),
    ),
  };
}

/**
 * Risk level counts. Only customers with receivables have outcomes; the rest (no history) are
 * low risk, so they are added from the total customer count.
 */
function riskDistribution(
  outcomes: Array<RiskOutcome & { customerId: string }>,
  customers: number,
  today: Date,
): Record<RiskLevel, number> {
  const perCustomer = new Map<string, RiskOutcome[]>();
  for (const { customerId, ...outcome } of outcomes) {
    const list = perCustomer.get(customerId) ?? [];
    list.push(outcome);
    perCustomer.set(customerId, list);
  }
  const distribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0 };
  for (const list of perCustomer.values()) {
    distribution[riskScoreFromOutcomes(list, today).level] += 1;
  }
  distribution.low += Math.max(0, customers - perCustomer.size);
  return distribution;
}

function toDailyPayments(rows: Awaited<ReturnType<typeof analyticsRepository.paymentsByDay>>) {
  return rows.map((row) => ({
    day: row.day,
    amount: toNumber(row.amount),
    count: row.count,
    daysToPay: row.daysToPay ?? 0,
  }));
}

const money = (value: Prisma.Decimal | null | undefined) => roundMoney(toNumber(value));

export const dashboardService = {
  async summary() {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const trendStart = addMonths(startOfMonth(today), -(TREND_MONTHS - 1));

    const [
      statusTotals,
      paymentRows,
      openByDueDate,
      debtors,
      outcomes,
      overdue,
      latestReport,
      customers,
    ] = await Promise.all([
      receivableRepository.statusTotals(),
      analyticsRepository.paymentsByDay(trendStart, today),
      analyticsRepository.openBalancesByDueDate(),
      analyticsRepository.topDebtors(TOP_DEBTORS),
      analyticsRepository.riskOutcomes(),
      receivableRepository.findOverdue(10),
      monthlyReportRepository.latest(),
      analyticsRepository.countCustomers(),
    ]);

    const status = statusBreakdown(statusTotals);

    // Collections: this month-to-date vs the same period of the previous month.
    const payments = toDailyPayments(paymentRows);
    const collectedWithin = (range: DateRange) => roundMoney(sumWithin(payments, range, 'amount'));
    const collectedThisMonth = collectedWithin({ from: startOfMonth(today), to: today });
    const collectedLastMonthToDate = collectedWithin({
      from: addMonths(startOfMonth(today), -1),
      to: sameDayLastMonth(today),
    });

    const balances = openByDueDate.map((row) => ({
      dueDate: row.dueDate,
      outstanding: toNumber(row.outstanding),
      openCount: row.openCount,
      count: row.count,
    }));
    const nextWeek = addDays(today, 7);
    const dueNext7Days = balances.filter(
      (row) =>
        row.dueDate.getTime() >= today.getTime() && row.dueDate.getTime() <= nextWeek.getTime(),
    );

    return {
      currency: env.CURRENCY,
      totals: {
        outstanding: status.outstanding,
        overdue: status.overdue,
        collectedThisMonth,
        collectedLastMonthToDate,
        collectedAllTime: status.collectedAllTime,
        overdueRate: status.overdueRate,
        dueNext7Days: {
          amount: roundMoney(dueNext7Days.reduce((sum, row) => sum + row.outstanding, 0)),
          count: dueNext7Days.reduce((sum, row) => sum + row.count, 0),
        },
        customers,
      },
      byStatus: status.byStatus,
      aging: agingBuckets(
        balances.map((row) => ({
          dueDate: row.dueDate,
          outstanding: row.outstanding,
          count: row.openCount,
        })),
        today,
      ),
      collectionTrend: bucketSeries(
        { from: trendStart, to: today, granularity: 'month' },
        ['amount', 'count'],
        payments,
      ).map((point) => ({
        period: point.bucket.slice(0, 7),
        amount: point.amount,
        count: point.count,
      })),
      topDebtors: debtors.map((row) => ({
        customerId: row.customerId,
        name: row.name,
        outstanding: money(row.outstanding),
        overdue: money(row.overdue),
        receivables: row.receivables,
      })),
      riskDistribution: riskDistribution(outcomes, customers, today),
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
    const rows = await analyticsRepository.openBalancesByDueDate();
    const projection = projectCashFlow(
      rows.map((row) => ({
        dueDate: row.dueDate,
        outstanding: toNumber(row.outstanding),
        count: row.openCount,
      })),
      groupBy,
      today,
      periods,
    );
    return { currency: env.CURRENCY, ...projection };
  },

  /**
   * Pareto / ABC of the debtors: classes, the concentration curve and the `limit` largest
   * debtors with their class and cumulative share.
   */
  async concentration(limit: number) {
    const [rows, customers] = await Promise.all([
      analyticsRepository.topDebtors(),
      analyticsRepository.countCustomers(),
    ]);
    const { total, debtors, classes, curve, ranked } = debtConcentration(
      rows.map((row) => ({
        customerId: row.customerId,
        name: row.name,
        outstanding: toNumber(row.outstanding),
        overdue: toNumber(row.overdue),
        receivables: row.receivables,
      })),
    );
    return {
      currency: env.CURRENCY,
      thresholds: CLASS_THRESHOLDS,
      totals: { outstanding: total, debtors, customers },
      classes,
      curve,
      debtors: ranked.slice(0, limit),
      generatedAt: new Date().toISOString(),
    };
  },

  /** Period KPIs vs the previous period, series, breakdowns and a snapshot of the portfolio. */
  async analytics(period: AnalyticsPeriod) {
    const today = todayInTimezone(env.APP_TIMEZONE);
    const current: DateRange = { from: period.from, to: period.to };
    const { previous } = period;

    const [
      paymentRows,
      methodRows,
      payerRows,
      issuedRows,
      dueRows,
      customerRows,
      statusTotals,
      customers,
      openByDueDate,
      notificationRows,
      remindedRows,
    ] = await Promise.all([
      analyticsRepository.paymentsByDay(previous.from, period.to),
      analyticsRepository.paymentsByMethod(period.from, period.to),
      analyticsRepository.topPayers(period.from, period.to, TOP_PAYERS),
      analyticsRepository.issuedByDay(previous.from, period.to),
      analyticsRepository.dueByDay(previous.from, period.to),
      analyticsRepository.customersCreatedByDay(previous.from, period.to, env.APP_TIMEZONE),
      receivableRepository.statusTotals(),
      analyticsRepository.countCustomers(),
      analyticsRepository.openBalancesByDueDate(),
      analyticsRepository.notificationsByDay(previous.from, period.to, env.APP_TIMEZONE),
      analyticsRepository.remindedReceivables(
        previous.from,
        period.from,
        period.to,
        PAID_AFTER_REMINDER_DAYS,
        env.APP_TIMEZONE,
      ),
    ]);

    const payments = toDailyPayments(paymentRows);
    const issued = issuedRows.map((row) => ({
      day: row.issueDate,
      amount: toNumber(row._sum.totalAmount),
      count: row._count._all,
    }));
    const due = dueRows.map((row) => ({
      day: row.dueDate,
      amount: toNumber(row._sum.totalAmount),
      paid: toNumber(row._sum.paidAmount),
    }));
    const newCustomers = customerRows.map((row) => ({ day: row.day, count: row.count }));

    const kpisFor = (range: DateRange) => {
      const collected = sumWithin(payments, range, 'amount');
      const paymentCount = sumWithin(payments, range, 'count');
      const dueAmount = sumWithin(due, range, 'amount');
      return {
        collected,
        payments: paymentCount,
        averagePayment: ratio(collected, paymentCount, 2),
        issued: sumWithin(issued, range, 'amount'),
        receivablesIssued: sumWithin(issued, range, 'count'),
        dueInPeriod: dueAmount,
        collectionRate: ratio(sumWithin(due, range, 'paid'), dueAmount, 4),
        averageDaysToPay: ratio(sumWithin(payments, range, 'daysToPay'), paymentCount, 2),
        newCustomers: sumWithin(newCustomers, range, 'count'),
      };
    };
    const now = kpisFor(current);
    const before = kpisFor(previous);
    const metric = <K extends keyof typeof now>(key: K) => ({
      value: now[key],
      previous: before[key],
    });
    const status = statusBreakdown(statusTotals);

    const notifications = notificationRows.map((row) => ({
      day: row.day,
      type: row.type,
      sent: row.status === 'sent' ? row.count : 0,
      failed: row.status === 'failed' ? row.count : 0,
    }));
    const reminded = (isCurrent: boolean) => {
      const row = remindedRows.find((candidate) => candidate.current === isCurrent);
      return ratio(row?.paid ?? 0, row?.reminded ?? 0, 4);
    };
    const openBalances = openByDueDate.map((row) => ({
      dueDate: row.dueDate,
      outstanding: toNumber(row.outstanding),
      count: row.openCount,
    }));
    const beforeMonth = addDays(today, -31);

    return {
      period: {
        from: formatDateOnly(period.from),
        to: formatDateOnly(period.to),
        granularity: period.granularity,
        previous: { from: formatDateOnly(previous.from), to: formatDateOnly(previous.to) },
      },
      kpis: {
        collected: moneyMetric(now.collected, before.collected),
        payments: metric('payments'),
        averagePayment: metric('averagePayment'),
        issued: moneyMetric(now.issued, before.issued),
        receivablesIssued: metric('receivablesIssued'),
        dueInPeriod: moneyMetric(now.dueInPeriod, before.dueInPeriod),
        collectionRate: metric('collectionRate'),
        averageDaysToPay: metric('averageDaysToPay'),
        newCustomers: metric('newCustomers'),
      },
      snapshot: {
        outstanding: status.outstanding,
        overdue: status.overdue,
        overdueRate: status.overdueRate,
        openReceivables: status.openReceivables,
        customers,
        dueToday: openBalanceWithin(openBalances, { from: today, to: today }),
        dueNext30Days: openBalanceWithin(openBalances, { from: today, to: addDays(today, 30) }),
        overdueOver30Days: openBalanceWithin(openBalances, {
          from: new Date(0),
          to: beforeMonth,
        }),
      },
      reminders: {
        sent: {
          value: sumWithin(notifications, current, 'sent'),
          previous: sumWithin(notifications, previous, 'sent'),
        },
        failed: {
          value: sumWithin(notifications, current, 'failed'),
          previous: sumWithin(notifications, previous, 'failed'),
        },
        byType: TEMPLATE_TYPES.map((type) => {
          const ofType = notifications.filter((row) => row.type === type);
          return {
            type,
            sent: sumWithin(ofType, current, 'sent'),
            failed: sumWithin(ofType, current, 'failed'),
          };
        }),
        paidAfterReminder: { value: reminded(true), previous: reminded(false) },
      },
      series: bucketSeries(
        period,
        ['collected', 'issued', 'due', 'payments'],
        [
          ...payments.map((row) => ({ day: row.day, collected: row.amount, payments: row.count })),
          ...issued.map((row) => ({ day: row.day, issued: row.amount })),
          ...due.map((row) => ({ day: row.day, due: row.amount })),
        ],
      ),
      byMethod: completeBreakdown(
        PAYMENT_METHODS,
        methodRows.map((row) => ({
          key: row.method,
          amount: toNumber(row._sum.amount),
          count: row._count._all,
        })),
      ).map(({ key, amount, count }) => ({ method: key, amount, count })),
      byWeekday: weekdayTotals(payments, current),
      topPayers: payerRows.map((row) => ({
        customerId: row.customerId,
        name: row.name,
        amount: money(row.amount),
        payments: row.payments,
      })),
      generatedAt: new Date().toISOString(),
    };
  },
};
