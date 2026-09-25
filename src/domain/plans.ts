import type { TenantModule, TenantPlan } from '@prisma/client';

/**
 * What a business may use each month, by plan and modules (the same numbers the landing sells,
 * solvia-landing `sections/plans.ts`). Generous in what costs little (customers, users, manual
 * WhatsApp reminders from the owner's own phone, never limited) and measured in what costs money:
 * automatic WhatsApp messages sent by Solvia through the provider.
 */
export interface PlanAllowance {
  /** Automatic WhatsApp messages per calendar month (before extra packs). */
  automaticMessages: number;
  users: number;
  /** null: unlimited. */
  customers: number | null;
}

/** The free plan: Cobranza for a business that is starting, manual reminders only. */
export const FREE_ALLOWANCE: PlanAllowance = { automaticMessages: 0, users: 1, customers: 25 };

/** Paid plans by number of modules (any of Cobranza, Ventas, Inventario). */
export const PAID_ALLOWANCES: Record<1 | 2 | 3, PlanAllowance> = {
  1: { automaticMessages: 150, users: 2, customers: 500 },
  2: { automaticMessages: 400, users: 4, customers: 2000 },
  3: { automaticMessages: 1000, users: 8, customers: null },
};

/** Size of one pack of extra automatic messages (added to the current month). */
export const MESSAGE_PACK_SIZE = 500;

/** Number of modules, 1..3 (a business always has at least one). */
function moduleCount(modules: readonly TenantModule[]): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, new Set(modules).size)) as 1 | 2 | 3;
}

/**
 * Automatic WhatsApp messages are the payment reminders and statements of Cobranza: a business
 * without it gets none.
 */
export function planAllowance(plan: TenantPlan, modules: readonly TenantModule[]): PlanAllowance {
  if (plan === 'free') return FREE_ALLOWANCE;
  const allowance = PAID_ALLOWANCES[moduleCount(modules)];
  return modules.includes('collections') ? allowance : { ...allowance, automaticMessages: 0 };
}

/** Whether one more can be added without going over the limit (null limit: always). */
export function hasRoom(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}

/** Reference monthly prices (PEN) of each module. */
export const MODULE_PRICES = { collections: 39, sales: 29, inventory: 29 } as const;

/** Discount on the sum of module prices, by number of modules. */
export const MODULE_DISCOUNTS: Record<1 | 2 | 3, number> = { 1: 0, 2: 0.1, 3: 0.15 };

/** Yearly billing: 12 months for the price of 10. */
export const ANNUAL_MONTHS_PAID = 10;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * What a business pays per month for its modules: `starter` bills monthly, `pro` yearly (spread
 * over 12 months); null on the free plan.
 */
export function planPrice(plan: TenantPlan, modules: readonly TenantModule[]) {
  if (plan === 'free') return null;
  const chosen = [...new Set(modules)];
  const count = moduleCount(chosen);
  const list = chosen.reduce((sum, module) => sum + MODULE_PRICES[module], 0);
  const monthly = round2(list * (1 - MODULE_DISCOUNTS[count]));
  const billing = plan === 'pro' ? ('annual' as const) : ('monthly' as const);
  return {
    billing,
    list,
    discount: MODULE_DISCOUNTS[count],
    perMonth: billing === 'annual' ? round2((monthly * ANNUAL_MONTHS_PAID) / 12) : monthly,
  };
}
