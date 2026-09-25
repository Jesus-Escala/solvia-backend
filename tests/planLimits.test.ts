import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planService } from '../src/services/plan.service';

/** Plan checks with the counts mocked: going over a limit is refused with a clear code. */

const state = vi.hoisted(() => ({
  tenant: { plan: 'free', modules: [] as string[] },
  sent: 0,
  packs: 0,
  users: 0,
  customers: 0,
}));

vi.mock('../src/repositories/tenant.repository', () => ({
  tenantRepository: { findCurrent: () => Promise.resolve(state.tenant) },
}));
vi.mock('../src/repositories/planUsage.repository', () => ({
  planUsageRepository: {
    automaticMessagesSince: () => Promise.resolve(state.sent),
    packMessages: () => Promise.resolve(state.packs),
    countActiveUsers: () => Promise.resolve(state.users),
    countCustomers: () => Promise.resolve(state.customers),
  },
}));

describe('plan limits', () => {
  beforeEach(() => {
    Object.assign(state, {
      tenant: { plan: 'free', modules: ['collections'] },
      sent: 0,
      packs: 0,
      users: 0,
      customers: 0,
    });
  });

  it('refuses a customer over the limit and allows it below', async () => {
    state.customers = 25;
    await expect(planService.assertCanAddCustomer()).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_CUSTOMER_LIMIT',
    });
    state.customers = 24;
    await expect(planService.assertCanAddCustomer()).resolves.toBeUndefined();
  });

  it('never limits customers with the three modules', async () => {
    state.tenant = { plan: 'pro', modules: ['collections', 'sales', 'inventory'] };
    state.customers = 50_000;
    await expect(planService.assertCanAddCustomer()).resolves.toBeUndefined();
  });

  it('refuses a user over the limit', async () => {
    state.tenant = { plan: 'starter', modules: ['collections'] };
    state.users = 2;
    await expect(planService.assertCanAddUser()).rejects.toMatchObject({ code: 'PLAN_USER_LIMIT' });
  });

  it('adds the month packs to the automatic messages and never goes below zero', async () => {
    state.tenant = { plan: 'starter', modules: ['collections', 'sales'] };
    state.sent = 450;
    state.packs = 500;
    const usage = await planService.usage();
    expect(usage.automaticMessages).toMatchObject({
      included: 400,
      extra: 500,
      limit: 900,
      left: 450,
    });
    state.sent = 1200;
    expect(await planService.automaticMessagesLeft()).toBe(0);
  });
});
