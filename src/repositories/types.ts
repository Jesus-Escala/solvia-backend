import type { ScopedPrismaClient } from '../lib/prisma';

/** Scoped Prisma client or an interactive transaction created from it. */
export type DbClient = Omit<
  ScopedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
