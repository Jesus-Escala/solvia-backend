import { Prisma, type Customer, type Sale, type SaleItem } from '@prisma/client';
import { env } from '../config/env';
import { deriveReceivableStatus, outstandingAmount } from '../domain/receivableStatus';
import {
  priceSale,
  roundQuantity,
  shortageOf,
  summarizeItems,
  UnknownProductError,
} from '../domain/sales';
import { AppError } from '../errors/AppError';
import { formatDateOnly, todayInTimezone } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';
import type { DbClient } from '../repositories/types';
import { paginate } from '../validators/common.schemas';
import type { CreateSaleInput, ListSalesQuery } from '../validators/sale.schemas';
import { hasModule } from '../domain/modules';
import { tenantRepository } from '../repositories/tenant.repository';

type SaleWithRelations = Sale & {
  customer: Pick<Customer, 'id' | 'name' | 'phone'> | null;
  items: SaleItem[];
  receivable: {
    id: string;
    status: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
  } | null;
};

const saleInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  items: { orderBy: { position: 'asc' } },
  receivable: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
} satisfies Prisma.SaleInclude;

export function toSaleDto(sale: SaleWithRelations) {
  const receivable = sale.receivable;
  return {
    id: sale.id,
    number: sale.number,
    date: formatDateOnly(sale.date),
    customer: sale.customer,
    paymentType: sale.paymentType,
    method: sale.method,
    docType: sale.docType,
    docNumber: sale.docNumber,
    total: roundMoney(toNumber(sale.total)),
    status: sale.status,
    createdAt: sale.createdAt.toISOString(),
    voidedAt: sale.voidedAt?.toISOString() ?? null,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: roundMoney(toNumber(item.unitPrice)),
      subtotal: roundMoney(toNumber(item.subtotal)),
      shortage: toNumber(item.shortage),
    })),
    summary: summarizeItems(
      sale.items.map((item) => ({
        description: item.description,
        quantity: toNumber(item.quantity),
      })),
    ),
    hasShortage: sale.hasShortage,
    receivable: receivable && {
      id: receivable.id,
      status: receivable.status,
      outstanding: outstandingAmount({
        totalAmount: toNumber(receivable.totalAmount),
        paidAmount: toNumber(receivable.paidAmount),
      }),
    },
  };
}

const today = () => todayInTimezone(env.APP_TIMEZONE);

/** Next sequential number of the business ("Venta #12"). */
async function nextNumber(tx: DbClient) {
  const last = await tx.sale.aggregate({ _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

async function findOrFail(id: string, db: DbClient = prisma) {
  const sale = await db.sale.findUnique({ where: { id }, include: saleInclude });
  if (!sale) throw AppError.notFound('Sale');
  return sale;
}

/** Newest first by default; other columns keep the newest first among equals. */
function saleOrderBy(
  field: NonNullable<ListSalesQuery['sortBy']> | null,
  dir: Prisma.SortOrder,
): Prisma.SaleOrderByWithRelationInput[] {
  const newest: Prisma.SaleOrderByWithRelationInput[] = [{ date: 'desc' }, { number: 'desc' }];
  switch (field) {
    case null:
      return newest;
    case 'number':
      return [{ number: dir }];
    case 'date':
      return [{ date: dir }, { number: dir }];
    case 'customer':
      // Walk-in sales (no customer) go last.
      return [{ customer: { name: dir } }, ...newest];
    case 'items':
      return [{ items: { _count: dir } }, ...newest];
    default:
      return [{ [field]: dir }, ...newest];
  }
}

export const saleService = {
  async list(query: ListSalesQuery) {
    const { search, from, to, paymentType, status, shortage, sortBy, sortDir, ...pagination } =
      query;
    const number = search && /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : undefined;
    const where: Prisma.SaleWhereInput = {
      ...(paymentType && { paymentType }),
      ...(status && { status }),
      ...(shortage && { hasShortage: true }),
      ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      ...(search &&
        (number !== undefined
          ? { number }
          : { customer: { name: { contains: search, mode: 'insensitive' } } })),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: saleOrderBy(sortBy ?? null, sortDir),
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.sale.count({ where }),
    ]);
    return paginate(rows.map(toSaleDto), total, pagination);
  },

  async getById(id: string) {
    return toSaleDto(await findOrFail(id));
  },

  /**
   * Records a sale: prices its lines from the catalog, takes the sold quantities out of stock
   * (stock may go negative: the sale is never blocked) and, when it is on credit, creates the
   * receivable with what was taken. Returns the sale and the products left at or below their
   * alert level.
   *
   * Traceability: every stock movement keeps the balance it left and the part sold without stock
   * (`shortage`); the sale line and the sale are marked too, so differences can be explained.
   */
  async create(input: CreateSaleInput, userId?: string) {
    const date = input.date ?? today();
    if (input.paymentType === 'credit') {
      // A credit sale becomes a receivable: that is the Cobranza module.
      const tenant = await tenantRepository.findCurrent();
      if (!tenant || !hasModule(tenant.modules, 'collections')) {
        throw new AppError(403, 'MODULE_NOT_ENABLED', 'Credit sales need the collections module');
      }
    }
    if (input.dueDate && input.dueDate.getTime() < date.getTime()) {
      throw new AppError(400, 'DUE_BEFORE_ISSUE', 'Due date cannot be earlier than the sale date');
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (input.customerId) {
            const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
            if (!customer) throw AppError.notFound('Customer');
          }

          const ids = [...new Set(input.items.map((item) => item.productId))];
          const products = await tx.product.findMany({ where: { id: { in: ids } } });
          let priced;
          try {
            priced = priceSale(
              input.items,
              new Map(
                products.map((product) => [
                  product.id,
                  {
                    id: product.id,
                    name: product.name,
                    price: toNumber(product.price),
                    trackStock: product.trackStock,
                  },
                ]),
              ),
            );
          } catch (error) {
            if (error instanceof UnknownProductError) throw AppError.notFound('Product');
            throw error;
          }

          const sale = await tx.sale.create({
            data: {
              tenantId: requireTenantId(),
              number: await nextNumber(tx),
              customerId: input.customerId ?? null,
              date,
              paymentType: input.paymentType,
              method: input.paymentType === 'cash' ? input.method : null,
              docType: input.docType,
              docNumber: input.docNumber ?? null,
              total: priced.total,
              createdById: userId ?? null,
            },
          });

          // Stock: the product's running total first (atomic decrement), then one movement per
          // counted product with the balance it left and what was sold without stock.
          const lowStock: Array<{ productId: string; name: string; stock: number }> = [];
          // Per line: a product repeated at two prices has two lines, each with its movement.
          const shortages = priced.items.map(() => 0);
          for (const [index, item] of priced.items.entries()) {
            if (!item.trackStock) continue;
            const product = await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
            const after = toNumber(product.stock);
            const shortage = shortageOf(roundQuantity(after + item.quantity), item.quantity);
            shortages[index] = shortage;
            await tx.stockMovement.create({
              data: {
                tenantId: requireTenantId(),
                productId: item.productId,
                type: 'sale',
                quantity: -item.quantity,
                balanceAfter: after,
                shortage,
                saleId: sale.id,
              },
            });
            const alertAt = product.minStock === null ? 0 : toNumber(product.minStock);
            if (after <= alertAt) {
              lowStock.push({ productId: product.id, name: product.name, stock: after });
            }
          }

          // Lines are added once their shortage is known (nested: the tenant scope requires it).
          const hasShortage = shortages.some((value) => value > 0);
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              hasShortage,
              items: {
                create: priced.items.map(({ trackStock: _trackStock, ...item }, position) => ({
                  ...item,
                  position,
                  shortage: shortages[position],
                })),
              },
            },
          });

          if (input.paymentType === 'credit' && input.customerId && input.dueDate) {
            await tx.receivable.create({
              data: {
                tenantId: requireTenantId(),
                customerId: input.customerId,
                description: summarizeItems(priced.items),
                totalAmount: priced.total,
                issueDate: date,
                dueDate: input.dueDate,
                status: deriveReceivableStatus(
                  { totalAmount: priced.total, paidAmount: 0, dueDate: input.dueDate },
                  today(),
                ),
                saleId: sale.id,
              },
            });
          }

          return { sale: toSaleDto(await findOrFail(sale.id, tx)), lowStock };
        });
      } catch (error) {
        // Two sales at the same time took the same number: try again with the next one.
        if (isUniqueViolation(error) && attempt < 3) continue;
        throw error;
      }
    }
  },

  /**
   * Voids a sale: its products go back into stock and, for a credit sale, its receivable is
   * removed. A credit sale that already received payments cannot be voided (the money was
   * collected): 422 SALE_HAS_PAYMENTS.
   */
  async void(id: string) {
    return prisma.$transaction(async (tx) => {
      const sale = await findOrFail(id, tx);
      if (sale.status === 'voided') {
        throw new AppError(422, 'SALE_ALREADY_VOIDED', 'This sale is already voided');
      }
      if (sale.receivable && toNumber(sale.receivable.paidAmount) > 0) {
        throw new AppError(
          422,
          'SALE_HAS_PAYMENTS',
          'This sale already has payments; it cannot be voided',
        );
      }

      const counted = await tx.stockMovement.findMany({ where: { saleId: id, type: 'sale' } });
      for (const movement of counted) {
        const quantity = -toNumber(movement.quantity);
        const product = await tx.product.update({
          where: { id: movement.productId },
          data: { stock: { increment: quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: requireTenantId(),
            productId: movement.productId,
            type: 'sale_void',
            quantity,
            balanceAfter: product.stock,
            saleId: id,
            note: `Sale #${sale.number} voided`,
          },
        });
      }
      if (sale.receivable) await tx.receivable.delete({ where: { id: sale.receivable.id } });
      await tx.sale.update({ where: { id }, data: { status: 'voided', voidedAt: new Date() } });
      return toSaleDto(await findOrFail(id, tx));
    });
  },
};
