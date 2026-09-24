import { isLowStock } from '../domain/inventory';
import { roundQuantity } from '../domain/sales';
import { formatDateOnly } from '../lib/dates';
import { roundMoney, toNumber } from '../lib/money';
import { reportRepository } from '../repositories/report.repository';
import type { ReportRange } from '../validators/report.schemas';

const money = (value: Parameters<typeof toNumber>[0]) => roundMoney(toNumber(value));
const sum = <T>(rows: T[], pick: (row: T) => number) =>
  roundMoney(rows.reduce((total, row) => total + pick(row), 0));
const range = ({ from, to }: ReportRange) => ({
  from: formatDateOnly(from),
  to: formatDateOnly(to),
});

/** Tabular reports: rows plus the totals line each one shows at the bottom. */
export const reportService = {
  async salesByCustomer(period: ReportRange) {
    const rows = (await reportRepository.salesByCustomer(period.from, period.to)).map((row) => ({
      customerId: row.customerId,
      name: row.name,
      sales: row.sales,
      total: money(row.total),
      cash: money(row.cash),
      credit: money(row.credit),
      lastSale: formatDateOnly(row.lastSale),
    }));
    return {
      period: range(period),
      rows,
      totals: {
        sales: rows.reduce((total, row) => total + row.sales, 0),
        total: sum(rows, (row) => row.total),
        cash: sum(rows, (row) => row.cash),
        credit: sum(rows, (row) => row.credit),
      },
    };
  },

  async collectionsByCustomer(period: ReportRange) {
    const rows = (await reportRepository.collectionsByCustomer(period.from, period.to)).map(
      (row) => ({
        customerId: row.customerId,
        name: row.name,
        payments: row.payments,
        amount: money(row.amount),
        yape: money(row.yape),
        plin: money(row.plin),
        cash: money(row.cash),
        bankTransfer: money(row.bankTransfer),
        lastPayment: formatDateOnly(row.lastPayment),
      }),
    );
    return {
      period: range(period),
      rows,
      totals: {
        payments: rows.reduce((total, row) => total + row.payments, 0),
        amount: sum(rows, (row) => row.amount),
        yape: sum(rows, (row) => row.yape),
        plin: sum(rows, (row) => row.plin),
        cash: sum(rows, (row) => row.cash),
        bankTransfer: sum(rows, (row) => row.bankTransfer),
      },
    };
  },

  async salesByProduct(period: ReportRange) {
    const rows = (await reportRepository.salesByProduct(period.from, period.to)).map((row) => {
      const revenue = money(row.revenue);
      const cost = row.cost === null ? null : money(row.cost);
      return {
        productId: row.productId,
        name: row.name,
        unit: row.unit,
        quantity: roundQuantity(toNumber(row.quantity)),
        sales: row.sales,
        revenue,
        cost,
        profit: cost === null ? null : roundMoney(revenue - cost),
      };
    });
    return {
      period: range(period),
      rows,
      totals: {
        revenue: sum(rows, (row) => row.revenue),
        cost: sum(rows, (row) => row.cost ?? 0),
        profit: sum(rows, (row) => row.profit ?? 0),
      },
    };
  },

  /**
   * Stock valuation of counted products: what the stock is worth at cost and at sale price, and
   * which products are out of stock or running low. Negative stock counts as zero in the value.
   */
  async stock() {
    const rows = (await reportRepository.stock()).map((row) => {
      const stock = toNumber(row.stock);
      const minStock = row.minStock === null ? null : toNumber(row.minStock);
      const cost = row.cost === null ? null : money(row.cost);
      const price = money(row.price);
      const counted = Math.max(stock, 0);
      return {
        productId: row.id,
        name: row.name,
        code: row.code,
        unit: row.unit,
        stock,
        minStock,
        cost,
        price,
        value: cost === null ? null : roundMoney(counted * cost),
        retail: roundMoney(counted * price),
        status:
          stock <= 0 ? 'out' : isLowStock({ trackStock: true, stock, minStock }) ? 'low' : 'ok',
      } as const;
    });
    return {
      rows,
      totals: {
        products: rows.length,
        value: sum(rows, (row) => row.value ?? 0),
        retail: sum(rows, (row) => row.retail),
        out: rows.filter((row) => row.status === 'out').length,
        low: rows.filter((row) => row.status === 'low').length,
      },
    };
  },

  async shortages(period: ReportRange) {
    const rows = (await reportRepository.shortages(period.from, period.to)).map((row) => ({
      movementId: row.movementId,
      at: row.createdAt.toISOString(),
      sale: {
        id: row.saleId,
        number: row.saleNumber,
        date: formatDateOnly(row.saleDate),
        status: row.saleStatus,
      },
      customer: row.customer,
      productId: row.productId,
      product: row.product,
      quantity: roundQuantity(toNumber(row.quantity)),
      shortage: roundQuantity(toNumber(row.shortage)),
      balanceAfter: row.balanceAfter === null ? null : toNumber(row.balanceAfter),
    }));
    return {
      period: range(period),
      rows,
      totals: {
        lines: rows.length,
        units: roundQuantity(rows.reduce((total, row) => total + row.shortage, 0)),
      },
    };
  },
};
