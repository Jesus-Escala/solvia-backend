import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { toDateOnly } from '../lib/dates';
import { currentLocale, INTL_LOCALES, type Locale } from '../lib/locale';
import { formatMoney } from '../lib/money';
import { tenantRepository } from '../repositories/tenant.repository';
import { purchaseService } from './purchase.service';
import { saleService, type SaleDto } from './sale.service';

/** 80 mm, the width of a receipt printer roll, in PDF points. */
const WIDTH = 226.77;
const MARGIN = 12;
const INNER = WIDTH - MARGIN * 2;
/** Room for any ticket in the first pass (it is measured, then drawn at its real height). */
const DRAFT_HEIGHT = 20_000;

/** Every text printed on the tickets, in each supported language. */
const TEXT = {
  es: {
    saleTitle: 'TICKET DE VENTA',
    purchaseTitle: 'COMPRA',
    number: 'N° {n}',
    customer: 'Cliente',
    walkIn: 'Cliente de paso',
    supplier: 'Proveedor',
    noSupplier: 'Sin proveedor',
    docTypes: { none: '', sale_note: 'Nota de venta', receipt: 'Boleta', invoice: 'Factura' },
    quantity: 'Cant.',
    description: 'Descripción',
    amount: 'Importe',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    total: 'TOTAL',
    paidWith: 'Pagó con',
    youPaidWith: 'Pagaste con',
    credit: 'Al fiado',
    downPayment: 'Adelanto',
    owes: 'Queda debiendo',
    items: '{n} producto(s)',
    notes: 'Nota',
    saleVoided: '*** VENTA ANULADA ***',
    purchaseVoided: '*** COMPRA ANULADA ***',
    thanks: '¡Gracias por tu compra!',
    notReceipt: 'Este ticket no es un comprobante electrónico.',
    purchaseNote: 'Constancia interna de la mercadería que llegó.',
    methods: { cash: 'Efectivo', yape: 'Yape', plin: 'Plin', bank_transfer: 'Transferencia' },
    saleFile: 'ticket-venta-{n}.pdf',
    purchaseFile: 'compra-{n}.pdf',
  },
  en: {
    saleTitle: 'SALES TICKET',
    purchaseTitle: 'PURCHASE',
    number: 'No. {n}',
    customer: 'Customer',
    walkIn: 'Walk-in customer',
    supplier: 'Supplier',
    noSupplier: 'No supplier',
    docTypes: { none: '', sale_note: 'Sale note', receipt: 'Receipt', invoice: 'Invoice' },
    quantity: 'Qty',
    description: 'Description',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'TOTAL',
    paidWith: 'Paid with',
    youPaidWith: 'You paid with',
    credit: 'On credit',
    downPayment: 'Down payment',
    owes: 'Still owes',
    items: '{n} item(s)',
    notes: 'Note',
    saleVoided: '*** SALE VOIDED ***',
    purchaseVoided: '*** PURCHASE VOIDED ***',
    thanks: 'Thank you for your purchase!',
    notReceipt: 'This ticket is not an electronic receipt.',
    purchaseNote: 'Internal record of the goods that arrived.',
    methods: { cash: 'Cash', yape: 'Yape', plin: 'Plin', bank_transfer: 'Bank transfer' },
    saleFile: 'sales-ticket-{n}.pdf',
    purchaseFile: 'purchase-{n}.pdf',
  },
} satisfies Record<Locale, unknown>;

type Text = (typeof TEXT)[Locale];
type Doc = InstanceType<typeof PDFDocument>;

/** What a ticket prints, the same for a sale and a purchase. */
interface Ticket {
  business: string;
  title: string;
  number: number;
  /** Calendar day (`YYYY-MM-DD`) and when it was recorded. */
  date: string;
  createdAt: string;
  document: string | null;
  voided: string | null;
  /** "Cliente: …" or "Proveedor: …". */
  party: string;
  lines: Array<{ quantity: number; description: string; unit: number; amount: number }>;
  /** Label and value lines after the lines (subtotal, discount…); `strong` ones are big. */
  totals: Array<{ label: string; value: string; strong?: boolean; gap?: boolean }>;
  notes: string | null;
  footer: string[];
}

const padNumber = (n: number) => String(n).padStart(6, '0');

/** The ticket as drawn: first on a tall draft page to measure it, then on a page of that height. */
function draw(doc: Doc, ticket: Ticket, text: Text, locale: Locale) {
  const money = (value: number) => formatMoney(value, env.CURRENCY, locale);
  const plain = (value: number) =>
    new Intl.NumberFormat(INTL_LOCALES[locale], {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const quantity = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 3 });
  // The date is a calendar day (stored at UTC midnight); the time is when it was recorded.
  const when = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDateOnly(ticket.date));
  const time = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: env.APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ticket.createdAt));

  const rule = () => {
    doc.moveDown(0.35);
    const y = doc.y;
    doc
      .save()
      .dash(2, { space: 2 })
      .moveTo(MARGIN, y)
      .lineTo(WIDTH - MARGIN, y)
      .lineWidth(0.6)
      .stroke('#000')
      .restore();
    doc.y = y + 5;
  };
  const center = (value: string, font = 'Courier', size = 8.5) =>
    doc.font(font).fontSize(size).text(value, MARGIN, doc.y, { width: INNER, align: 'center' });
  /** A label on the left and an amount on the right, on one line. */
  const pair = (label: string, value: string, strong = false) => {
    const size = strong ? 11 : 8.5;
    doc.font(strong ? 'Courier-Bold' : 'Courier').fontSize(size);
    const y = doc.y;
    doc.text(label, MARGIN, y, { width: INNER * 0.6 });
    const after = doc.y;
    doc.text(value, MARGIN, y, { width: INNER, align: 'right' });
    doc.y = Math.max(after, doc.y);
  };

  // Header: the business, the ticket and when.
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000');
  doc.text(ticket.business, MARGIN, MARGIN, { width: INNER, align: 'center' });
  doc.moveDown(0.2);
  center(ticket.title, 'Courier-Bold', 9);
  center(text.number.replace('{n}', padNumber(ticket.number)));
  center(`${when}  ${time}`);
  if (ticket.document) center(ticket.document);
  if (ticket.voided) {
    doc.moveDown(0.3);
    center(ticket.voided, 'Courier-Bold', 9);
  }
  rule();
  doc.font('Courier').fontSize(8.5).text(ticket.party, MARGIN, doc.y, { width: INNER });
  rule();

  // Lines: quantity, description and amount in columns, the unit price under the name.
  const qtyWidth = 30;
  const amountWidth = 56;
  const descWidth = INNER - qtyWidth - amountWidth;
  doc.font('Courier-Bold').fontSize(8);
  let y = doc.y;
  doc.text(text.quantity, MARGIN, y, { width: qtyWidth });
  doc.text(text.description, MARGIN + qtyWidth, y, { width: descWidth });
  doc.text(text.amount, MARGIN + qtyWidth + descWidth, y, { width: amountWidth, align: 'right' });
  doc.moveDown(0.3);
  for (const line of ticket.lines) {
    y = doc.y;
    doc.font('Courier').fontSize(8.5);
    doc.text(quantity.format(line.quantity), MARGIN, y, { width: qtyWidth });
    doc.text(line.description, MARGIN + qtyWidth, y, { width: descWidth });
    const below = doc.y;
    doc.text(plain(line.amount), MARGIN + qtyWidth + descWidth, y, {
      width: amountWidth,
      align: 'right',
    });
    doc.y = below;
    doc
      .fontSize(7.5)
      .fillColor('#333')
      .text(`x ${money(line.unit)}`, MARGIN + qtyWidth, doc.y, { width: descWidth })
      .fillColor('#000');
    doc.moveDown(0.25);
  }
  rule();

  const count = ticket.lines.reduce((sum, line) => sum + line.quantity, 0);
  doc
    .font('Courier')
    .fontSize(7.5)
    .text(text.items.replace('{n}', quantity.format(count)), MARGIN, doc.y, { width: INNER });
  doc.moveDown(0.2);
  for (const line of ticket.totals) {
    if (line.gap) doc.moveDown(0.3);
    pair(line.label, line.value, line.strong ?? false);
  }
  if (ticket.notes) {
    rule();
    doc
      .font('Courier')
      .fontSize(8)
      .text(`${text.notes}: ${ticket.notes}`, MARGIN, doc.y, { width: INNER });
  }
  rule();
  ticket.footer.forEach((line, index) =>
    index === 0 ? center(line, 'Courier-Bold', 9) : center(line, 'Courier', 7),
  );
  center('Solvia', 'Courier', 7);
  return doc.y + MARGIN;
}

function render(
  height: number,
  build: (doc: Doc) => number,
): Promise<{ buffer: Buffer; bottom: number }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [WIDTH, height], margin: MARGIN, autoFirstPage: true });
    const chunks: Buffer[] = [];
    let bottom = 0;
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), bottom }));
    doc.on('error', reject);
    try {
      bottom = build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** Measures the ticket, then draws it on a page of exactly its height. */
async function toPdf(ticket: Ticket, text: Text, locale: Locale) {
  const draft = await render(DRAFT_HEIGHT, (doc) => draw(doc, ticket, text, locale));
  return (await render(Math.ceil(draft.bottom), (doc) => draw(doc, ticket, text, locale))).buffer;
}

function saleTicket(sale: SaleDto, business: string, text: Text, locale: Locale): Ticket {
  const money = (value: number) => formatMoney(value, env.CURRENCY, locale);
  const totals: Ticket['totals'] = [];
  if (sale.discount > 0) {
    totals.push({ label: text.subtotal, value: money(sale.subtotal) });
    totals.push({ label: text.discount, value: `-${money(sale.discount)}` });
  }
  totals.push({ label: text.total, value: money(sale.total), strong: true });
  if (sale.paymentType === 'cash') {
    if (sale.payments.length > 1) {
      totals.push({ label: text.paidWith, value: '', gap: true });
      for (const part of sale.payments) {
        totals.push({ label: `  ${text.methods[part.method]}`, value: money(part.amount) });
      }
    } else if (sale.method) {
      totals.push({ label: text.paidWith, value: text.methods[sale.method], gap: true });
    }
  } else {
    totals.push({ label: text.paidWith, value: text.credit, gap: true });
    if (sale.receivable) {
      if (sale.receivable.paid > 0) {
        totals.push({ label: text.downPayment, value: money(sale.receivable.paid) });
      }
      totals.push({ label: text.owes, value: money(sale.receivable.outstanding), strong: true });
    }
  }
  const docType = text.docTypes[sale.docType];
  return {
    business,
    title: text.saleTitle,
    number: sale.number,
    date: sale.date,
    createdAt: sale.createdAt,
    document: docType ? `${docType} ${sale.docNumber ?? ''}`.trim() : null,
    voided: sale.status === 'voided' ? text.saleVoided : null,
    party: `${text.customer}: ${sale.customer?.name ?? text.walkIn}`,
    lines: sale.items.map((item) => ({
      quantity: item.quantity,
      description: item.description,
      unit: item.unitPrice,
      amount: item.subtotal,
    })),
    totals,
    notes: sale.notes,
    footer: [text.thanks, text.notReceipt],
  };
}

export const ticketService = {
  /**
   * The ticket of a sale as an 80 mm PDF (what a receipt printer prints), in the request
   * language: business, number, date and time, customer, lines, totals and how it was paid.
   * It is a courtesy ticket, not an electronic receipt.
   */
  async salePdf(id: string) {
    const [sale, tenant] = await Promise.all([
      saleService.getById(id),
      tenantRepository.findCurrent(),
    ]);
    const locale = currentLocale();
    const text = TEXT[locale];
    const buffer = await toPdf(
      saleTicket(sale, tenant?.name ?? 'Solvia', text, locale),
      text,
      locale,
    );
    return { buffer, fileName: text.saleFile.replace('{n}', padNumber(sale.number)) };
  },

  /** The record of a purchase in the same 80 mm layout: supplier, lines, total and how it was paid. */
  async purchasePdf(id: string) {
    const [purchase, tenant] = await Promise.all([
      purchaseService.getById(id),
      tenantRepository.findCurrent(),
    ]);
    const locale = currentLocale();
    const text = TEXT[locale];
    const money = (value: number) => formatMoney(value, env.CURRENCY, locale);
    const totals: Ticket['totals'] = [
      { label: text.total, value: money(purchase.total), strong: true },
    ];
    if (purchase.payments.length > 1) {
      totals.push({ label: text.youPaidWith, value: '', gap: true });
      for (const part of purchase.payments) {
        totals.push({ label: `  ${text.methods[part.method]}`, value: money(part.amount) });
      }
    } else if (purchase.payments[0]) {
      totals.push({
        label: text.youPaidWith,
        value: text.methods[purchase.payments[0].method],
        gap: true,
      });
    }
    const docType = text.docTypes[purchase.docType];
    const buffer = await toPdf(
      {
        business: tenant?.name ?? 'Solvia',
        title: text.purchaseTitle,
        number: purchase.number,
        date: purchase.date,
        createdAt: purchase.createdAt,
        document: docType ? `${docType} ${purchase.docNumber ?? ''}`.trim() : null,
        voided: purchase.status === 'voided' ? text.purchaseVoided : null,
        party: `${text.supplier}: ${purchase.supplier?.name ?? text.noSupplier}`,
        lines: purchase.items.map((item) => ({
          quantity: item.quantity,
          description: item.description,
          unit: item.unitCost,
          amount: item.subtotal,
        })),
        totals,
        notes: null,
        footer: [text.purchaseNote],
      },
      text,
      locale,
    );
    return { buffer, fileName: text.purchaseFile.replace('{n}', padNumber(purchase.number)) };
  },
};
