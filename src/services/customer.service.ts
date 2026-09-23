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
    // Risk is computed on the fly, so filtering by risk requires evaluating every match first.
    const [customers, total] = await customerRepository.findMany({
      search: query.search,
      pagination: query.risk ? undefined : query,
    });

    const rows = customers.map(({ receivables, ...customer }) => ({
      ...toCustomerDto(customer),
      risk: riskScoreFor(receivables),
      summary: balanceSummary(receivables),
    }));

    if (!query.risk) {
      return paginate(rows, total, query);
    }
    const filtered = rows.filter((row) => row.risk.level === query.risk);
    const start = (query.page - 1) * query.pageSize;
    return paginate(filtered.slice(start, start + query.pageSize), filtered.length, query);
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
