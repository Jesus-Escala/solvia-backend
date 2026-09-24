import { env } from '../config/env';
import { hasRoom, MESSAGE_PACK_SIZE, planAllowance } from '../domain/plans';
import { AppError } from '../errors/AppError';
import { formatDateOnly, startOfMonth, todayInTimezone } from '../lib/dates';
import { runWithTenant } from '../lib/tenantContext';
import { planUsageRepository } from '../repositories/planUsage.repository';
import { tenantRepository } from '../repositories/tenant.repository';

const currentMonth = () => startOfMonth(todayInTimezone(env.APP_TIMEZONE));

/**
 * Plan limits of the current tenant: what it may use, what it used this month, and the checks
 * that stop going over them (customers, users, automatic WhatsApp messages).
 */
export const planService = {
  async usage() {
    const tenant = await tenantRepository.findCurrent();
    if (!tenant) throw AppError.notFound('Tenant');
    const month = currentMonth();
    const allowance = planAllowance(tenant.plan, tenant.modules);
    const [sent, packs, users, customers] = await Promise.all([
      planUsageRepository.automaticMessagesSince(month, env.APP_TIMEZONE),
      planUsageRepository.packMessages(month),
      planUsageRepository.countActiveUsers(),
      planUsageRepository.countCustomers(),
    ]);
    const messageLimit = allowance.automaticMessages + packs;
    return {
      plan: tenant.plan,
      modules: tenant.modules,
      month: formatDateOnly(month).slice(0, 7),
      automaticMessages: {
        used: sent,
        included: allowance.automaticMessages,
        extra: packs,
        limit: messageLimit,
        left: Math.max(0, messageLimit - sent),
      },
      users: { used: users, limit: allowance.users },
      customers: { used: customers, limit: allowance.customers },
      packSize: MESSAGE_PACK_SIZE,
    };
  },

  /** Automatic messages the tenant can still send this month. */
  async automaticMessagesLeft() {
    return (await this.usage()).automaticMessages.left;
  },

  async assertCanAddCustomer() {
    const { customers } = await this.usage();
    if (!hasRoom(customers.used, customers.limit)) {
      throw new AppError(
        409,
        'PLAN_CUSTOMER_LIMIT',
        `The plan allows up to ${customers.limit} customers`,
        { limit: customers.limit },
      );
    }
  },

  async assertCanAddUser() {
    const { users } = await this.usage();
    if (!hasRoom(users.used, users.limit)) {
      throw new AppError(409, 'PLAN_USER_LIMIT', `The plan allows up to ${users.limit} users`, {
        limit: users.limit,
      });
    }
  },

  /** Platform admin: adds `packs` packs of extra automatic messages to the tenant's current month. */
  async addMessagePacks(tenantId: string, packs: number) {
    await planUsageRepository.addPack(tenantId, currentMonth(), packs * MESSAGE_PACK_SIZE);
    return runWithTenant(tenantId, () => this.usage());
  },

  /** Usage of any tenant, for the backoffice. */
  usageOf(tenantId: string) {
    return runWithTenant(tenantId, () => this.usage());
  },
};
