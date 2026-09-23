import type { PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { DbClient } from './types';

export interface PaymentCreateData {
  receivableId: string;
  amount: number;
  date: Date;
  method: PaymentMethod;
  proofUrl?: string | null;
}

export const paymentRepository = {
  create(data: PaymentCreateData, db: DbClient = prisma) {
    return db.payment.create({ data });
  },

  listByReceivable(receivableId: string) {
    return prisma.payment.findMany({ where: { receivableId }, orderBy: { date: 'desc' } });
  },

  /** Sum of payments dated within [from, to]. */
  async sumBetween(from: Date, to: Date): Promise<number> {
    const result = await prisma.payment.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },
};
