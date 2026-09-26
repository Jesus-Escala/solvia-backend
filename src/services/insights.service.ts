import type { PaymentMethod } from '@prisma/client';
import { env } from '../config/env';
import { roundQuantity } from '../domain/sales';
import { addDays, diffInDays, formatDateOnly } from '../lib/dates';
import { currentLocale, INTL_LOCALES, type Locale } from '../lib/locale';
import { roundMoney, toNumber } from '../lib/money';
import { insightsRepository } from '../repositories/insights.repository';
import { reportRepository } from '../repositories/report.repository';
import type { InsightReport, ReportRange } from '../validators/report.schemas';

/**
 * Sales and purchases analysis: the self-describing reports (columns, rows, totals and headline
 * figures in the request language, the same for the screen, the PDF and the Excel) and the sales
 * and purchases dashboards.
 */

export type CellKind = 'text' | 'money' | 'number' | 'date';
export type Cell = string | number | null;

export interface TableColumn {
  header: string;
  kind: CellKind;
  /** Relative width (PDF columns share the page in this proportion). */
  weight: number;
}

export interface Kpi {
  label: string;
  value: number;
  kind: 'money' | 'number';
  tone: 'default' | 'success' | 'warning' | 'danger';
}

export interface TableLayout {
  title: string;
  dated: boolean;
  columns: TableColumn[];
  rows: Cell[][];
  totals: Cell[] | null;
  empty: string;
  kpis: Kpi[];
}

const TEXT = {
  es: {
    total: 'Total',
    walkIn: 'Cliente de paso',
    noSupplier: 'Sin proveedor',
    noCategory: 'Sin categoría',
    noSeller: 'Sin usuario',
    credit: 'Fiado',
    cash: 'Al contado',
    voided: 'Anulada',
    completed: 'Válida',
    methods: { cash: 'Efectivo', yape: 'Yape', plin: 'Plin', bank_transfer: 'Transferencia' },
    docTypes: { none: '', sale_note: 'Nota de venta', receipt: 'Boleta', invoice: 'Factura' },
    titles: {
      'sales-detail': 'Detalle de ventas (tickets)',
      'sales-by-day': 'Ventas por día',
      'sales-by-method': 'Ventas por método de pago',
      'sales-by-category': 'Ventas por categoría',
      'sales-by-seller': 'Ventas por vendedor',
      'purchases-detail': 'Detalle de compras',
      'purchases-by-supplier': 'Compras por proveedor',
      'purchases-by-product': 'Compras por producto',
    },
    empty: {
      sales: 'No hay ventas en esas fechas.',
      purchases: 'No hay compras en esas fechas.',
    },
    c: {
      ticket: 'Ticket',
      date: 'Fecha',
      time: 'Hora',
      customer: 'Cliente',
      seller: 'Vendedor',
      type: 'Tipo',
      document: 'Comprobante',
      products: 'Productos',
      units: 'Unidades',
      discount: 'Descuento',
      total: 'Total',
      paidWith: 'Pagó con',
      owes: 'Debe',
      status: 'Estado',
      sales: 'Ventas',
      cash: 'Al contado',
      credit: 'Fiado',
      average: 'Ticket promedio',
      averagePurchase: 'Compra promedio',
      method: 'Método',
      amount: 'Monto',
      share: '% del total',
      category: 'Categoría',
      productsCount: 'Productos distintos',
      revenue: 'Vendido',
      cost: 'Costo',
      profit: 'Ganancia',
      margin: 'Margen %',
      purchase: 'Compra',
      supplier: 'Proveedor',
      paidWithYou: 'Pagaste con',
      recordedBy: 'Registró',
      purchases: 'Compras',
      lastPurchase: 'Última compra',
      product: 'Producto',
      unit: 'Unidad',
      quantity: 'Cantidad',
      spent: 'Gastado',
      averageCost: 'Costo promedio',
      lastCost: 'Último costo',
    },
    k: {
      sold: 'Vendido',
      tickets: 'Ventas',
      average: 'Ticket promedio',
      averagePurchase: 'Compra promedio',
      discounts: 'Descuentos',
      credit: 'Fiado',
      days: 'Días con ventas',
      bestDay: 'Mejor día',
      categories: 'Categorías',
      profit: 'Ganancia estimada',
      sellers: 'Vendedores',
      spent: 'Comprado',
      purchases: 'Compras',
      suppliers: 'Proveedores',
      products: 'Productos',
    },
    units: {
      unit: 'Unidad',
      kg: 'Kilo',
      liter: 'Litro',
      box: 'Caja',
      pack: 'Paquete',
      dozen: 'Docena',
      meter: 'Metro',
    } as Record<string, string>,
  },
  en: {
    total: 'Total',
    walkIn: 'Walk-in customer',
    noSupplier: 'No supplier',
    noCategory: 'No category',
    noSeller: 'No user',
    credit: 'On credit',
    cash: 'Cash',
    voided: 'Voided',
    completed: 'Valid',
    methods: { cash: 'Cash', yape: 'Yape', plin: 'Plin', bank_transfer: 'Bank transfer' },
    docTypes: { none: '', sale_note: 'Sale note', receipt: 'Receipt', invoice: 'Invoice' },
    titles: {
      'sales-detail': 'Sales detail (tickets)',
      'sales-by-day': 'Sales by day',
      'sales-by-method': 'Sales by payment method',
      'sales-by-category': 'Sales by category',
      'sales-by-seller': 'Sales by seller',
      'purchases-detail': 'Purchases detail',
      'purchases-by-supplier': 'Purchases by supplier',
      'purchases-by-product': 'Purchases by product',
    },
    empty: {
      sales: 'No sales in those dates.',
      purchases: 'No purchases in those dates.',
    },
    c: {
      ticket: 'Ticket',
      date: 'Date',
      time: 'Time',
      customer: 'Customer',
      seller: 'Seller',
      type: 'Type',
      document: 'Receipt',
      products: 'Products',
      units: 'Units',
      discount: 'Discount',
      total: 'Total',
      paidWith: 'Paid with',
      owes: 'Owes',
      status: 'Status',
      sales: 'Sales',
      cash: 'Cash',
      credit: 'On credit',
      average: 'Average ticket',
      averagePurchase: 'Average purchase',
      method: 'Method',
      amount: 'Amount',
      share: '% of total',
      category: 'Category',
      productsCount: 'Different products',
      revenue: 'Sold',
      cost: 'Cost',
      profit: 'Profit',
      margin: 'Margin %',
      purchase: 'Purchase',
      supplier: 'Supplier',
      paidWithYou: 'You paid with',
      recordedBy: 'Recorded by',
      purchases: 'Purchases',
      lastPurchase: 'Last purchase',
      product: 'Product',
      unit: 'Unit',
      quantity: 'Quantity',
      spent: 'Spent',
      averageCost: 'Average cost',
      lastCost: 'Last cost',
    },
    k: {
      sold: 'Sold',
      tickets: 'Sales',
      average: 'Average ticket',
      averagePurchase: 'Average purchase',
      discounts: 'Discounts',
      credit: 'On credit',
      days: 'Days with sales',
      bestDay: 'Best day',
      categories: 'Categories',
      profit: 'Estimated profit',
      sellers: 'Sellers',
      spent: 'Bought',
      purchases: 'Purchases',
      suppliers: 'Suppliers',
      products: 'Products',
    },
    units: {
      unit: 'Unit',
      kg: 'Kilo',
      liter: 'Liter',
      box: 'Box',
      pack: 'Pack',
      dozen: 'Dozen',
      meter: 'Meter',
    } as Record<string, string>,
  },
} satisfies Record<Locale, unknown>;

type Text = (typeof TEXT)[Locale];

const money = (value: Parameters<typeof toNumber>[0]) => roundMoney(toNumber(value));
const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0));
const col = (header: string, kind: CellKind, weight: number): TableColumn => ({
  header,
  kind,
  weight,
});
const kpi = (
  label: string,
  value: number,
  kind: Kpi['kind'] = 'money',
  tone: Kpi['tone'] = 'default',
): Kpi => ({ label, value, kind, tone });
const percent = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/** "cash:4.00;yape:3.00" → "Efectivo 4.00 + Yape 3.00" (or just "Efectivo" with one). */
function methodsText(raw: string | null, text: Text, locale: Locale): string {
  if (!raw) return '';
  const parts = raw.split(';').map((part) => {
    const [method, amount] = part.split(':');
    return { name: text.methods[method as PaymentMethod] ?? method, amount: Number(amount) };
  });
  if (parts.length === 1) return parts[0]!.name;
  const number = new Intl.NumberFormat(INTL_LOCALES[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return parts.map((part) => `${part.name} ${number.format(part.amount)}`).join(' + ');
}

function localTime(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: env.APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function salesLayouts(report: InsightReport, range: ReportRange, text: Text, locale: Locale) {
  const { c, k } = text;
  const { from, to } = range;
  switch (report) {
    case 'sales-detail': {
      const rows = await insightsRepository.salesDetail(from, to);
      const valid = rows.filter((row) => row.status === 'completed');
      const total = sum(valid.map((row) => money(row.total)));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.ticket, 'text', 1.2),
          col(c.date, 'date', 1.6),
          col(c.time, 'text', 1.1),
          col(c.customer, 'text', 2.6),
          col(c.products, 'text', 5),
          col(c.units, 'number', 1.2),
          col(c.type, 'text', 1.5),
          col(c.paidWith, 'text', 2.8),
          col(c.discount, 'money', 1.5),
          col(c.total, 'money', 1.7),
          col(c.owes, 'money', 1.5),
          col(c.seller, 'text', 2),
          col(c.document, 'text', 2),
          col(c.status, 'text', 1.3),
        ],
        rows: rows.map((row) => [
          `#${row.number}`,
          formatDateOnly(row.date),
          localTime(row.createdAt, locale),
          row.customer ?? text.walkIn,
          row.items ?? '',
          row.units === null ? null : roundQuantity(toNumber(row.units)),
          row.paymentType === 'credit' ? text.credit : text.cash,
          row.paymentType === 'credit' ? '' : methodsText(row.methods, text, locale),
          money(row.discount),
          money(row.total),
          row.outstanding === null ? null : money(row.outstanding),
          row.seller ?? '',
          `${text.docTypes[row.docType as keyof Text['docTypes']] ?? ''} ${row.docNumber ?? ''}`.trim(),
          row.status === 'voided' ? text.voided : text.completed,
        ]),
        totals: [
          text.total,
          null,
          null,
          null,
          null,
          roundQuantity(valid.reduce((all, row) => all + toNumber(row.units), 0)),
          null,
          null,
          sum(valid.map((row) => money(row.discount))),
          total,
          sum(valid.map((row) => (row.outstanding === null ? 0 : money(row.outstanding)))),
          null,
          null,
          null,
        ],
        empty: text.empty.sales,
        kpis: [
          kpi(k.sold, total, 'money', 'success'),
          kpi(k.tickets, valid.length, 'number'),
          kpi(k.average, valid.length === 0 ? 0 : roundMoney(total / valid.length)),
          kpi(
            k.credit,
            sum(valid.filter((row) => row.paymentType === 'credit').map((row) => money(row.total))),
            'money',
            'warning',
          ),
        ],
      };
    }
    case 'sales-by-day': {
      const rows = (await insightsRepository.salesByDay(from, to)).map((row) => ({
        date: formatDateOnly(row.date),
        sales: row.sales,
        total: money(row.total),
        cash: money(row.cash),
        credit: money(row.credit),
        discount: money(row.discount),
      }));
      const total = sum(rows.map((row) => row.total));
      const sales = rows.reduce((all, row) => all + row.sales, 0);
      const best = rows.reduce<(typeof rows)[number] | null>(
        (top, row) => (top === null || row.total > top.total ? row : top),
        null,
      );
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.date, 'date', 2),
          col(c.sales, 'number', 1.4),
          col(c.cash, 'money', 2),
          col(c.credit, 'money', 2),
          col(c.discount, 'money', 1.8),
          col(c.total, 'money', 2),
          col(c.average, 'money', 2),
        ],
        rows: rows.map((row) => [
          row.date,
          row.sales,
          row.cash,
          row.credit,
          row.discount,
          row.total,
          row.sales === 0 ? 0 : roundMoney(row.total / row.sales),
        ]),
        totals: [
          text.total,
          sales,
          sum(rows.map((row) => row.cash)),
          sum(rows.map((row) => row.credit)),
          sum(rows.map((row) => row.discount)),
          total,
          sales === 0 ? 0 : roundMoney(total / sales),
        ],
        empty: text.empty.sales,
        kpis: [
          kpi(k.sold, total, 'money', 'success'),
          kpi(k.tickets, sales, 'number'),
          kpi(k.days, rows.length, 'number'),
          kpi(k.bestDay, best?.total ?? 0),
        ],
      };
    }
    case 'sales-by-method': {
      const rows = (await insightsRepository.salesByMethod(from, to)).map((row) => ({
        name: row.method === null ? text.credit : text.methods[row.method],
        sales: row.sales,
        amount: money(row.amount),
      }));
      const total = sum(rows.map((row) => row.amount));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.method, 'text', 3),
          col(c.sales, 'number', 1.5),
          col(c.amount, 'money', 2),
          col(c.share, 'number', 1.5),
        ],
        rows: rows.map((row) => [row.name, row.sales, row.amount, percent(row.amount, total)]),
        totals: [text.total, null, total, 100],
        empty: text.empty.sales,
        kpis: rows
          .slice(0, 4)
          .map((row, index) =>
            kpi(row.name, row.amount, 'money', index === 0 ? 'success' : 'default'),
          ),
      };
    }
    case 'sales-by-category': {
      const rows = (await insightsRepository.salesByCategory(from, to)).map((row) => {
        const revenue = money(row.revenue);
        const cost = row.cost === null ? null : money(row.cost);
        return {
          name: row.name ?? text.noCategory,
          products: row.products,
          quantity: roundQuantity(toNumber(row.quantity)),
          revenue,
          cost,
          profit: cost === null ? null : roundMoney(revenue - cost),
          sales: row.sales,
        };
      });
      const revenue = sum(rows.map((row) => row.revenue));
      const profit = sum(rows.map((row) => row.profit ?? 0));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.category, 'text', 3),
          col(c.revenue, 'money', 2),
          col(c.share, 'number', 1.4),
          col(c.units, 'number', 1.4),
          col(c.productsCount, 'number', 1.8),
          col(c.cost, 'money', 2),
          col(c.profit, 'money', 2),
          col(c.margin, 'number', 1.4),
        ],
        rows: rows.map((row) => [
          row.name,
          row.revenue,
          percent(row.revenue, revenue),
          row.quantity,
          row.products,
          row.cost,
          row.profit,
          row.profit === null ? null : percent(row.profit, row.revenue),
        ]),
        totals: [
          text.total,
          revenue,
          100,
          null,
          null,
          sum(rows.map((row) => row.cost ?? 0)),
          profit,
          percent(profit, revenue),
        ],
        empty: text.empty.sales,
        kpis: [
          kpi(k.sold, revenue, 'money', 'success'),
          kpi(k.profit, profit),
          kpi(k.categories, rows.length, 'number'),
        ],
      };
    }
    case 'sales-by-seller': {
      const rows = (await insightsRepository.salesBySeller(from, to)).map((row) => ({
        name: row.name ?? text.noSeller,
        sales: row.sales,
        total: money(row.total),
      }));
      const total = sum(rows.map((row) => row.total));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.seller, 'text', 3),
          col(c.sales, 'number', 1.4),
          col(c.total, 'money', 2),
          col(c.average, 'money', 2),
          col(c.share, 'number', 1.4),
        ],
        rows: rows.map((row) => [
          row.name,
          row.sales,
          row.total,
          row.sales === 0 ? 0 : roundMoney(row.total / row.sales),
          percent(row.total, total),
        ]),
        totals: [text.total, rows.reduce((all, row) => all + row.sales, 0), total, null, 100],
        empty: text.empty.sales,
        kpis: [kpi(k.sold, total, 'money', 'success'), kpi(k.sellers, rows.length, 'number')],
      };
    }
    default:
      return null;
  }
}

async function purchaseLayouts(
  report: InsightReport,
  range: ReportRange,
  text: Text,
  locale: Locale,
) {
  const { c, k } = text;
  const { from, to } = range;
  switch (report) {
    case 'purchases-detail': {
      const rows = await insightsRepository.purchasesDetail(from, to);
      const valid = rows.filter((row) => row.status === 'completed');
      const total = sum(valid.map((row) => money(row.total)));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.purchase, 'text', 1.2),
          col(c.date, 'date', 1.6),
          col(c.supplier, 'text', 2.6),
          col(c.products, 'text', 5.4),
          col(c.units, 'number', 1.2),
          col(c.paidWithYou, 'text', 2.8),
          col(c.total, 'money', 1.8),
          col(c.document, 'text', 2),
          col(c.recordedBy, 'text', 2),
          col(c.status, 'text', 1.3),
        ],
        rows: rows.map((row) => [
          `#${row.number}`,
          formatDateOnly(row.date),
          row.supplier ?? text.noSupplier,
          row.items ?? '',
          row.units === null ? null : roundQuantity(toNumber(row.units)),
          methodsText(row.methods, text, locale),
          money(row.total),
          `${text.docTypes[row.docType as keyof Text['docTypes']] ?? ''} ${row.docNumber ?? ''}`.trim(),
          row.user ?? '',
          row.status === 'voided' ? text.voided : text.completed,
        ]),
        totals: [
          text.total,
          null,
          null,
          null,
          roundQuantity(valid.reduce((all, row) => all + toNumber(row.units), 0)),
          null,
          total,
          null,
          null,
          null,
        ],
        empty: text.empty.purchases,
        kpis: [
          kpi(k.spent, total, 'money', 'warning'),
          kpi(k.purchases, valid.length, 'number'),
          kpi(k.averagePurchase, valid.length === 0 ? 0 : roundMoney(total / valid.length)),
        ],
      };
    }
    case 'purchases-by-supplier': {
      const rows = (await insightsRepository.purchasesBySupplier(from, to)).map((row) => ({
        name: row.name ?? text.noSupplier,
        purchases: row.purchases,
        total: money(row.total),
        last: formatDateOnly(row.lastPurchase),
      }));
      const total = sum(rows.map((row) => row.total));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.supplier, 'text', 3.4),
          col(c.spent, 'money', 2),
          col(c.share, 'number', 1.4),
          col(c.purchases, 'number', 1.4),
          col(c.averagePurchase, 'money', 2),
          col(c.lastPurchase, 'date', 2),
        ],
        rows: rows.map((row) => [
          row.name,
          row.total,
          percent(row.total, total),
          row.purchases,
          row.purchases === 0 ? 0 : roundMoney(row.total / row.purchases),
          row.last,
        ]),
        totals: [
          text.total,
          total,
          100,
          rows.reduce((all, row) => all + row.purchases, 0),
          null,
          null,
        ],
        empty: text.empty.purchases,
        kpis: [kpi(k.spent, total, 'money', 'warning'), kpi(k.suppliers, rows.length, 'number')],
      };
    }
    case 'purchases-by-product': {
      const rows = (await insightsRepository.purchasesByProduct(from, to)).map((row) => {
        const quantity = roundQuantity(toNumber(row.quantity));
        const total = money(row.total);
        return {
          name: row.name,
          unit: text.units[row.unit] ?? row.unit,
          quantity,
          total,
          average: quantity === 0 ? null : roundMoney(total / quantity),
          last: row.lastCost === null ? null : money(row.lastCost),
          purchases: row.purchases,
          lastDate: formatDateOnly(row.lastPurchase),
        };
      });
      const total = sum(rows.map((row) => row.total));
      return {
        title: text.titles[report],
        dated: true,
        columns: [
          col(c.product, 'text', 3.6),
          col(c.spent, 'money', 2),
          col(c.quantity, 'number', 1.4),
          col(c.unit, 'text', 1.3),
          col(c.averageCost, 'money', 1.8),
          col(c.lastCost, 'money', 1.8),
          col(c.purchases, 'number', 1.3),
          col(c.lastPurchase, 'date', 1.8),
        ],
        rows: rows.map((row) => [
          row.name,
          row.total,
          row.quantity,
          row.unit,
          row.average,
          row.last,
          row.purchases,
          row.lastDate,
        ]),
        totals: [text.total, total, null, null, null, null, null, null],
        empty: text.empty.purchases,
        kpis: [kpi(k.spent, total, 'money', 'warning'), kpi(k.products, rows.length, 'number')],
      };
    }
    default:
      return null;
  }
}

/** The previous range of the same length (to compare "vs the period before"). */
function previousRange({ from, to }: ReportRange): ReportRange {
  const days = diffInDays(to, from) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

export const insightsService = {
  /** One of the self-describing reports, in the request language. */
  async layout(report: InsightReport, range: ReportRange): Promise<TableLayout> {
    const locale = currentLocale();
    const text = TEXT[locale];
    const layout =
      (await salesLayouts(report, range, text, locale)) ??
      (await purchaseLayouts(report, range, text, locale));
    if (!layout) throw new Error(`Unknown report ${report}`);
    return layout;
  },

  /**
   * Sales dashboard of a range: totals (and the previous range of the same length), by day, by
   * hour, the best-selling products, the best customers, how it was paid and by category.
   */
  async sales(range: ReportRange) {
    const { from, to } = range;
    const previous = previousRange(range);
    const [byDay, before, byHour, products, customers, methods, categories] = await Promise.all([
      insightsRepository.salesByDay(from, to),
      insightsRepository.salesByDay(previous.from, previous.to),
      insightsRepository.salesByHour(from, to),
      reportRepository.salesByProduct(from, to),
      reportRepository.salesByCustomer(from, to),
      insightsRepository.salesByMethod(from, to),
      insightsRepository.salesByCategory(from, to),
    ]);
    const days = byDay.map((row) => ({
      date: formatDateOnly(row.date),
      sales: row.sales,
      total: money(row.total),
      cash: money(row.cash),
      credit: money(row.credit),
    }));
    const total = sum(days.map((row) => row.total));
    const sales = days.reduce((all, row) => all + row.sales, 0);
    const previousTotal = sum(before.map((row) => money(row.total)));
    const previousSales = before.reduce((all, row) => all + row.sales, 0);
    const productRows = products.map((row) => {
      const revenue = money(row.revenue);
      const cost = row.cost === null ? null : money(row.cost);
      return {
        productId: row.productId,
        name: row.name,
        unit: row.unit,
        quantity: roundQuantity(toNumber(row.quantity)),
        revenue,
        profit: cost === null ? null : roundMoney(revenue - cost),
        sales: row.sales,
      };
    });
    return {
      period: { from: formatDateOnly(from), to: formatDateOnly(to) },
      previousPeriod: { from: formatDateOnly(previous.from), to: formatDateOnly(previous.to) },
      totals: {
        total,
        sales,
        average: sales === 0 ? 0 : roundMoney(total / sales),
        cash: sum(days.map((row) => row.cash)),
        credit: sum(days.map((row) => row.credit)),
        profit: sum(productRows.map((row) => row.profit ?? 0)),
        units: roundQuantity(productRows.reduce((all, row) => all + row.quantity, 0)),
        customers: customers.filter((row) => row.customerId !== null).length,
      },
      previous: {
        total: previousTotal,
        sales: previousSales,
        average: previousSales === 0 ? 0 : roundMoney(previousTotal / previousSales),
      },
      byDay: days,
      byHour: byHour.map((row) => ({ hour: row.hour, sales: row.sales, total: money(row.total) })),
      topProducts: productRows.slice(0, 10),
      topCustomers: customers
        .filter((row) => row.customerId !== null)
        .slice(0, 10)
        .map((row) => ({
          customerId: row.customerId,
          name: row.name,
          sales: row.sales,
          total: money(row.total),
          lastSale: formatDateOnly(row.lastSale),
        })),
      walkIn: (() => {
        const row = customers.find((item) => item.customerId === null);
        return row ? { sales: row.sales, total: money(row.total) } : null;
      })(),
      byMethod: methods.map((row) => ({
        method: row.method,
        sales: row.sales,
        amount: money(row.amount),
      })),
      byCategory: categories.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        revenue: money(row.revenue),
        quantity: roundQuantity(toNumber(row.quantity)),
      })),
    };
  },

  /** Purchases dashboard of a range: totals, by day, top suppliers and products, methods. */
  async purchases(range: ReportRange) {
    const { from, to } = range;
    const previous = previousRange(range);
    const [byDay, before, suppliers, products, methods] = await Promise.all([
      insightsRepository.purchasesByDay(from, to),
      insightsRepository.purchasesByDay(previous.from, previous.to),
      insightsRepository.purchasesBySupplier(from, to),
      insightsRepository.purchasesByProduct(from, to),
      insightsRepository.purchasesByMethod(from, to),
    ]);
    const days = byDay.map((row) => ({
      date: formatDateOnly(row.date),
      purchases: row.purchases,
      total: money(row.total),
    }));
    const total = sum(days.map((row) => row.total));
    const purchases = days.reduce((all, row) => all + row.purchases, 0);
    return {
      period: { from: formatDateOnly(from), to: formatDateOnly(to) },
      previousPeriod: { from: formatDateOnly(previous.from), to: formatDateOnly(previous.to) },
      totals: {
        total,
        purchases,
        average: purchases === 0 ? 0 : roundMoney(total / purchases),
        suppliers: suppliers.filter((row) => row.supplierId !== null).length,
        products: products.length,
      },
      previous: {
        total: sum(before.map((row) => money(row.total))),
        purchases: before.reduce((all, row) => all + row.purchases, 0),
      },
      byDay: days,
      topSuppliers: suppliers.slice(0, 10).map((row) => ({
        supplierId: row.supplierId,
        name: row.name,
        purchases: row.purchases,
        total: money(row.total),
      })),
      topProducts: products.slice(0, 10).map((row) => ({
        productId: row.productId,
        name: row.name,
        unit: row.unit,
        quantity: roundQuantity(toNumber(row.quantity)),
        total: money(row.total),
      })),
      byMethod: methods.map((row) => ({
        method: row.method,
        purchases: row.purchases,
        amount: money(row.amount),
      })),
    };
  },
};
