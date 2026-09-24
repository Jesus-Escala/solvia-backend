import { outstandingAmount } from '../domain/receivableStatus';
import { AppError } from '../errors/AppError';
import { roundMoney, toNumber } from '../lib/money';
import { customerRepository } from '../repositories/customer.repository';
import { paginate } from '../validators/common.schemas';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '../validators/customer.schemas';
import { toCustomerDto, toPaymentDto, toReceivableDto } from './dto';
import { riskScoreFor } from './risk.service';
import { planService } from './plan.service';

type ReceivableBalanceRow = {
  totalAmount: Parameters<typeof toNumber>[0];
  paidAmount: Parameters<typeof toNumber>[0];
  status: string;
};

function balanceSummary(receivables: ReceivableBalanceRow[]) {
  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let overdueCount = 0;
  let openCount = 0;
  for (const receivable of receivables) {
    const totalAmount = toNumber(receivable.totalAmount);
    const paidAmount = toNumber(receivable.paidAmount);
    totalBilled += totalAmount;
    totalPaid += paidAmount;
    totalOutstanding += outstandingAmount({ totalAmount, paidAmount });
    if (receivable.status === 'overdue') overdueCount += 1;
    if (receivable.status !== 'paid') openCount += 1;
  }
  return {
    totalBilled: roundMoney(totalBilled),
    totalPaid: roundMoney(totalPaid),
    totalOutstanding: roundMoney(totalOutstanding),
    openReceivables: openCount,
    overdueReceivables: overdueCount,
  };
}

export const customerService = {
  async list(query: ListCustomersQuery) {
    // Risk and balances are computed on the fly, so filtering or sorting by them needs every match.
    const computed = ['outstanding', 'risk', 'open', 'overdue'].includes(query.sortBy);
    const inMemory = Boolean(query.risk) || computed;
    const [customers, total] = await customerRepository.findMany({
      search: query.search,
      pagination: inMemory ? undefined : query,
      orderBy: inMemory
        ? undefined
        : { field: query.sortBy as 'name' | 'phone' | 'createdAt', dir: query.sortDir },
    });

    const rows = customers.map(({ receivables, ...customer }) => ({
      ...toCustomerDto(customer),
      risk: riskScoreFor(receivables),
      summary: balanceSummary(receivables),
    }));

    if (!inMemory) {
      return paginate(rows, total, query);
    }

    const direction = query.sortDir === 'desc' ? -1 : 1;
    const sortValue = (row: (typeof rows)[number]): number | string =>
      query.sortBy === 'outstanding'
        ? row.summary.totalOutstanding
        : query.sortBy === 'risk'
          ? row.risk.points
          : query.sortBy === 'open'
            ? row.summary.openReceivables
            : query.sortBy === 'overdue'
              ? row.summary.overdueReceivables
              : query.sortBy === 'createdAt'
                ? row.createdAt
                : query.sortBy === 'phone'
                  ? row.phone
                  : row.name.toLowerCase();
    const filtered = rows
      .filter((row) => !query.risk || row.risk.level === query.risk)
      .sort((a, b) => {
        const left = sortValue(a);
        const right = sortValue(b);
        return (left < right ? -1 : left > right ? 1 : 0) * direction;
      });
    const start = (query.page - 1) * query.pageSize;
    return paginate(filtered.slice(start, start + query.pageSize), filtered.length, query);
  },

  /** Picker search: id, name, phone and what the customer owes (computed in SQL). */
  async lookup(search: string, limit: number) {
    const rows = await customerRepository.lookup(search, limit);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      outstanding: roundMoney(toNumber(row.outstanding)),
    }));
  },

  async getById(id: string) {
    const customer = await customerRepository.findByIdWithHistory(id);
    if (!customer) throw AppError.notFound('Customer');

    const { receivables, ...data } = customer;
    const payments = receivables
      .flatMap((receivable) =>
        receivable.payments.map((payment) => ({
          ...toPaymentDto(payment),
          receivableDescription: receivable.description,
        })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      ...toCustomerDto(data),
      risk: riskScoreFor(receivables),
      summary: balanceSummary(receivables),
      receivables: receivables.map((receivable) => toReceivableDto(receivable)),
      payments,
    };
  },

  async getRisk(id: string) {
    const customer = await customerRepository.findByIdWithHistory(id);
    if (!customer) throw AppError.notFound('Customer');
    return riskScoreFor(customer.receivables);
  },

  async create(input: CreateCustomerInput) {
    await planService.assertCanAddCustomer();
    return toCustomerDto(await customerRepository.create(input));
  },

  async update(id: string, input: UpdateCustomerInput) {
    await this.ensureExists(id);
    return toCustomerDto(await customerRepository.update(id, input));
  },

  async delete(id: string) {
    await this.ensureExists(id);
    await customerRepository.delete(id);
  },

  async ensureExists(id: string) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw AppError.notFound('Customer');
    return customer;
  },
};
