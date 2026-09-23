import type {
  AccessRequest,
  Customer,
  MonthlyReport,
  Notification,
  Payment,
  Prisma,
  Receivable,
  User,
} from '@prisma/client';
import { outstandingAmount } from '../domain/receivableStatus';
import { formatDateOnly } from '../lib/dates';
import { toNumber } from '../lib/money';

type CustomerSummary = Pick<Customer, 'id' | 'name' | 'phone'>;

export function toCustomerDto(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    documentId: customer.documentId,
    notes: customer.notes,
    createdAt: customer.createdAt.toISOString(),
  };
}

export function toPaymentDto(payment: Payment) {
  return {
    id: payment.id,
    receivableId: payment.receivableId,
    amount: toNumber(payment.amount),
    date: formatDateOnly(payment.date),
    method: payment.method,
    proofUrl: payment.proofUrl,
  };
}

export function toNotificationDto(notification: Notification) {
  return {
    id: notification.id,
    receivableId: notification.receivableId,
    channel: notification.channel,
    templateType: notification.templateType,
    status: notification.status,
    sentAt: notification.sentAt.toISOString(),
    sentContent: notification.sentContent,
  };
}

export function toReceivableDto(receivable: Receivable & { customer?: CustomerSummary }) {
  const totalAmount = toNumber(receivable.totalAmount);
  const paidAmount = toNumber(receivable.paidAmount);
  return {
    id: receivable.id,
    customerId: receivable.customerId,
    ...(receivable.customer && { customer: receivable.customer }),
    description: receivable.description,
    totalAmount,
    paidAmount,
    outstandingAmount: outstandingAmount({ totalAmount, paidAmount }),
    issueDate: formatDateOnly(receivable.issueDate),
    dueDate: formatDateOnly(receivable.dueDate),
    status: receivable.status,
    createdAt: receivable.createdAt.toISOString(),
  };
}

export function toMonthlyReportDto(report: MonthlyReport) {
  return {
    id: report.id,
    period: report.period,
    totalCollected: toNumber(report.totalCollected),
    totalPending: toNumber(report.totalPending),
    topOverdueCustomers: report.topOverdueCustomers as Prisma.JsonArray,
    generatedAt: report.generatedAt.toISOString(),
  };
}

/** Team member as listed to tenant admins and in the platform backoffice. */
export function toTenantUserDto(
  user: Pick<
    User,
    | 'id'
    | 'name'
    | 'email'
    | 'role'
    | 'active'
    | 'mustChangePassword'
    | 'googleId'
    | 'lastLoginAt'
    | 'createdAt'
  >,
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    hasGoogle: user.googleId !== null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAccessRequestDto(request: AccessRequest) {
  return {
    id: request.id,
    businessName: request.businessName,
    contactName: request.contactName,
    email: request.email,
    phone: request.phone,
    industry: request.industry,
    message: request.message,
    status: request.status,
    tenantId: request.tenantId,
    createdAt: request.createdAt.toISOString(),
  };
}

export type CustomerDto = ReturnType<typeof toCustomerDto>;
export type ReceivableDto = ReturnType<typeof toReceivableDto>;
export type PaymentDto = ReturnType<typeof toPaymentDto>;
export type TenantUserDto = ReturnType<typeof toTenantUserDto>;
export type AccessRequestDto = ReturnType<typeof toAccessRequestDto>;
