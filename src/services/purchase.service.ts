import { Prisma, type Purchase, type PurchaseItem, type Supplier } from '@prisma/client';
import { env } from '../config/env';
import { roundQuantity, shortageOf } from '../domain/sales';
import { AppError } from '../errors/AppError';
import { formatDateOnly, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { DbClient } from '../repositories/types';
import { paginate } from '../validators/common.schemas';
import type { CreatePurchaseInput, ListPurchasesQuery } from '../validators/inventory.schemas';

type PurchaseWithRelations = Purchase & {
  supplier: Pick<Supplier, 'id' | 'name' | 'phone'> | null;
  items: PurchaseItem[];
};

const purchaseInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.PurchaseInclude;

export function toPurchaseDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    description: item.description,
    quantity: toNumber(item.quantity),
    unitCost: roundMoney(toNumber(item.unitCost)),
    subtotal: roundMoney(toNumber(item.subtotal)),
  }));
  return {
    id: purchase.id,
    number: purchase.number,
    date: formatDateOnly(purchase.date),
    supplier: purchase.supplier,
    docType: purchase.docType,
    docNumber: purchase.docNumber,
    total: roundMoney(toNumber(purchase.total)),
    status: purchase.status,
    createdAt: purchase.createdAt.toISOString(),
    voidedAt: purchase.voidedAt?.toISOString() ?? null,
    items,
    summary: items
      .map((item) =>
        item.quantity === 1 ? item.description : `${item.description} ×${item.quantity}`,
      )
      .join(', '),
  };
}

const today = () => todayInTimezone(env.APP_TIMEZONE);
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

async function findOrFail(id: string, db: DbClient = prisma) {
  const purchase = await db.purchase.findUnique({ where: { id }, include: purchaseInclude });
  if (!purchase) throw AppError.notFound('Purchase');
  return purchase;
}

export const purchaseService = {
  async list(query: ListPurchasesQuery) {
    const { search, from, to, status, ...pagination } = query;
    const number = search && /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : null;
    const where: Prisma.PurchaseWhereInput = {
      ...(status && { status }),
      ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      ...(search &&
        (number !== null
          ? { number }
          : { supplier: { name: { contains: search, mode: 'insensitive' } } })),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.purchase.findMany({
        where,
        include: purchaseInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.purchase.count({ where }),
    ]);
    return paginate(rows.map(toPurchaseDto), total, pagination);
  },

  async getById(id: string) {
    return toPurchaseDto(await findOrFail(id));
  },

  /**
   * Records goods bought: counted products enter stock (one `purchase` movement each with the
   * balance it left) and, by default, each product's cost becomes what was paid now. Products
   * that are not counted (trackStock off) only get their cost updated.
   */
  async create(input: CreatePurchaseInput, userId: string | null) {
    const date = input.date ?? today();
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (input.supplierId) {
            const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
            if (!supplier) throw AppError.notFound('Supplier');
          }
          const ids = [...new Set(input.items.map((item) => item.productId))];
          const products = new Map(
            (await tx.product.findMany({ where: { id: { in: ids } } })).map((p) => [p.id, p]),
          );
          if (products.size !== ids.length) throw AppError.notFound('Product');

          const lines = input.items.map((item, position) => {
            const quantity = roundQuantity(item.quantity);
            const unitCost = roundMoney(item.unitCost);
            return {
              productId: item.productId,
              position,
              description: products.get(item.productId)!.name,
              quantity,
              unitCost,
              subtotal: roundMoney(quantity * unitCost),
            };
          });
          const total = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
          const last = await tx.purchase.aggregate({ _max: { number: true } });

          const purchase = await tx.purchase.create({
            data: {
              tenantId: requireTenantId(),
              number: (last._max.number ?? 0) + 1,
              supplierId: input.supplierId ?? null,
              date,
              docType: input.docType,
              docNumber: input.docNumber ?? null,
              total,
              createdById: userId,
              items: { create: lines },
            },
          });

          for (const line of lines) {
            const product = products.get(line.productId)!;
            const data: Prisma.ProductUpdateInput = {
              ...(product.trackStock && { stock: { increment: line.quantity } }),
              ...(input.updateCosts && { cost: line.unitCost }),
            };
            if (Object.keys(data).length === 0) continue;
            const updated = await tx.product.update({ where: { id: line.productId }, data });
            if (product.trackStock) {
              await tx.stockMovement.create({
                data: {
                  tenantId: requireTenantId(),
                  productId: line.productId,
                  type: 'purchase',
                  quantity: line.quantity,
                  balanceAfter: updated.stock,
                  purchaseId: purchase.id,
                  createdById: userId,
                },
              });
            }
          }
          return toPurchaseDto(await findOrFail(purchase.id, tx));
        });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 3) continue;
        throw error;
      }
    }
  },

  /**
   * Voids a purchase: what entered leaves again (`purchase_void` movements). If part of it was
   * already sold, stock may go negative; the movement keeps that part as `shortage`.
   */
  async void(id: string, userId: string | null) {
    return prisma.$transaction(async (tx) => {
      const purchase = await findOrFail(id, tx);
      if (purchase.status === 'voided') {
        throw new AppError(422, 'PURCHASE_ALREADY_VOIDED', 'This purchase is already voided');
      }
      const entered = await tx.stockMovement.findMany({
        where: { purchaseId: id, type: 'purchase' },
      });
      for (const movement of entered) {
        const quantity = toNumber(movement.quantity);
        const updated = await tx.product.update({
          where: { id: movement.productId },
          data: { stock: { decrement: quantity } },
        });
        const after = toNumber(updated.stock);
        await tx.stockMovement.create({
          data: {
            tenantId: requireTenantId(),
            productId: movement.productId,
            type: 'purchase_void',
            quantity: -quantity,
            balanceAfter: after,
            shortage: shortageOf(roundQuantity(after + quantity), quantity),
            purchaseId: id,
            createdById: userId,
            note: `Purchase #${purchase.number} voided`,
          },
        });
      }
      await tx.purchase.update({ where: { id }, data: { status: 'voided', voidedAt: new Date() } });
      return toPurchaseDto(await findOrFail(id, tx));
    });
  },
};
