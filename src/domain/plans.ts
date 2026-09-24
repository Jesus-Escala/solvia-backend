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

/** Paid plans by number of modules (Cobranza always counts as one). */
export const PAID_ALLOWANCES: Record<1 | 2 | 3, PlanAllowance> = {
  1: { automaticMessages: 150, users: 2, customers: 500 },
  2: { automaticMessages: 400, users: 4, customers: 2000 },
  3: { automaticMessages: 1000, users: 8, customers: null },
};

/** Size of one pack of extra automatic messages (added to the current month). */
export const MESSAGE_PACK_SIZE = 500;

export function planAllowance(plan: TenantPlan, modules: readonly TenantModule[]): PlanAllowance {
  if (plan === 'free') return FREE_ALLOWANCE;
  const count = Math.min(3, 1 + new Set(modules).size) as 1 | 2 | 3;
  return PAID_ALLOWANCES[count];
}

/** Whether one more can be added without going over the limit (null limit: always). */
export function hasRoom(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}
