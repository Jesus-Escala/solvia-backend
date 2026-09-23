import { env } from '../config/env';
import { outstandingAmount } from '../domain/receivableStatus';
import { AppError } from '../errors/AppError';
import {
  addDays,
  addMonths,
  formatPeriod,
  startOfMonth,
  todayInTimezone,
  toDateOnly,
} from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { monthlyReportRepository } from '../repositories/monthlyReport.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { toMonthlyReportDto } from './dto';
import { receivableService } from './receivable.service';

// A type alias (not an interface) so it is assignable to Prisma's JSON input type.
export type TopOverdueCustomer = {
  customerId: string;
  name: string;
  phone: string;
  overdueAmount: number;
  overdueCount: number;
};

const TOP_OVERDUE_LIMIT = 5;

export const monthlyReportService = {
  /**
   * Builds (or rebuilds) the summary for the month containing `referenceDate`:
   * total collected in the month, total pending right now and the top 5 overdue customers.
   */
  async generateForCurrentTenant(referenceDate = todayInTimezone(env.APP_TIMEZONE)) {
    await receivableService.refreshOverdueStatuses();

    const monthStart = startOfMonth(referenceDate);
    const monthEnd = addDays(addMonths(monthStart, 1), -1);
    const [totalCollected, outstanding] = await Promise.all([
      paymentRepository.sumBetween(monthStart, monthEnd),
      receivableRepository.findOutstanding(),
    ]);

    let totalPending = 0;
    const overdueByCustomer = new Map<string, TopOverdueCustomer>();
    for (const receivable of outstanding) {
      const balance = outstandingAmount({
        totalAmount: toNumber(receivable.totalAmount),
        paidAmount: toNumber(receivable.paidAmount),
      });
      totalPending += balance;
      if (receivable.status !== 'overdue') continue;

      const entry = overdueByCustomer.get(receivable.customer.id) ?? {
        customerId: receivable.customer.id,
        name: receivable.customer.name,
        phone: receivable.customer.phone,
        overdueAmount: 0,
        overdueCount: 0,
      };
      entry.overdueAmount = roundMoney(entry.overdueAmount + balance);
      entry.overdueCount += 1;
      overdueByCustomer.set(receivable.customer.id, entry);
    }

    const topOverdueCustomers = [...overdueByCustomer.values()]
      .sort((a, b) => b.overdueAmount - a.overdueAmount)
      .slice(0, TOP_OVERDUE_LIMIT);

    const report = await monthlyReportRepository.upsert({
      period: formatPeriod(monthStart),
      totalCollected: roundMoney(totalCollected),
      totalPending: roundMoney(totalPending),
      topOverdueCustomers,
    });
    return toMonthlyReportDto(report);
  },

  async list(limit = 12) {
    const reports = await monthlyReportRepository.list(limit);
    return reports.map(toMonthlyReportDto);
  },

  async getByPeriod(period: string) {
    const report = await monthlyReportRepository.findByPeriod(period);
    if (!report) throw AppError.notFound('Monthly report');
    return toMonthlyReportDto(report);
  },

  /** Parses a `YYYY-MM` period into the first day of that month. */
  periodToDate(period: string) {
    return toDateOnly(`${period}-01`);
  },
};
