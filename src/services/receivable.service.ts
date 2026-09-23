import { env } from '../config/env';
import { deriveReceivableStatus, outstandingAmount } from '../domain/receivableStatus';
import { AppError } from '../errors/AppError';
import { todayInTimezone } from '../lib/dates';
import { toNumber } from '../lib/money';
import { paymentProvider } from '../providers/payment';
import { customerRepository } from '../repositories/customer.repository';
import { receivableRepository } from '../repositories/receivable.repository';
import { paginate } from '../validators/common.schemas';
import type {
  CreateReceivableInput,
  ListReceivablesQuery,
  UpdateReceivableInput,
} from '../validators/receivable.schemas';
import { toNotificationDto, toPaymentDto, toReceivableDto } from './dto';

const today = () => todayInTimezone(env.APP_TIMEZONE);

export const receivableService = {
  async list(query: ListReceivablesQuery) {
    const [receivables, total] = await receivableRepository.findMany(query);
    return paginate(receivables.map(toReceivableDto), total, query);
  },

  async getById(id: string) {
    const receivable = await receivableRepository.findByIdWithDetails(id);
    if (!receivable) throw AppError.notFound('Receivable');
    const { payments, notifications, ...data } = receivable;
    return {
      ...toReceivableDto(data),
      payments: payments.map(toPaymentDto),
      notifications: notifications.map(toNotificationDto),
    };
  },

  async create(input: CreateReceivableInput) {
    // The scoped client guarantees the customer belongs to the current tenant.
    const customer = await customerRepository.findById(input.customerId);
    if (!customer) throw AppError.notFound('Customer');

    const status = deriveReceivableStatus(
      { totalAmount: input.totalAmount, paidAmount: 0, dueDate: input.dueDate },
      today(),
    );
    return toReceivableDto(await receivableRepository.create({ ...input, status }));
  },

  async update(id: string, input: UpdateReceivableInput) {
    const existing = await this.findOrFail(id);

    const totalAmount = input.totalAmount ?? toNumber(existing.totalAmount);
    const paidAmount = toNumber(existing.paidAmount);
    const issueDate = input.issueDate ?? existing.issueDate;
    const dueDate = input.dueDate ?? existing.dueDate;

    if (totalAmount < paidAmount) {
      throw AppError.unprocessable('Total amount cannot be lower than the amount already paid');
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      throw AppError.badRequest('Due date cannot be earlier than the issue date');
    }

    const status = deriveReceivableStatus({ totalAmount, paidAmount, dueDate }, today());
    return toReceivableDto(await receivableRepository.update(id, { ...input, status }));
  },

  async delete(id: string) {
    await this.findOrFail(id);
    await receivableRepository.delete(id);
  },

  async createPaymentLink(id: string) {
    const receivable = await this.findOrFail(id);
    const outstanding = outstandingAmount({
      totalAmount: toNumber(receivable.totalAmount),
      paidAmount: toNumber(receivable.paidAmount),
    });
    if (outstanding <= 0) {
      throw AppError.unprocessable('This receivable is already paid');
    }
    const link = await paymentProvider.createPaymentLink({
      reference: receivable.id,
      amount: outstanding,
      currency: env.CURRENCY,
      description: receivable.description,
      customer: { name: receivable.customer.name, phone: receivable.customer.phone },
    });
    return { ...link, amount: outstanding, currency: env.CURRENCY };
  },

  /** Marks unpaid receivables past their due date as overdue. Returns the number updated. */
  async refreshOverdueStatuses(referenceDate = today()) {
    const { count } = await receivableRepository.markOverdue(referenceDate);
    return count;
  },

  async findOrFail(id: string) {
    const receivable = await receivableRepository.findById(id);
    if (!receivable) throw AppError.notFound('Receivable');
    return receivable;
  },
};
