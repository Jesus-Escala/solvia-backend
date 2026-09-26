import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { toDateOnly } from '../lib/dates';
import { currentLocale, INTL_LOCALES, type Locale } from '../lib/locale';
import { formatMoney } from '../lib/money';
import { tenantRepository } from '../repositories/tenant.repository';
import { saleService, type SaleDto } from './sale.service';

/** 80 mm, the width of a receipt printer roll, in PDF points. */
const WIDTH = 226.77;
const MARGIN = 12;
const INNER = WIDTH - MARGIN * 2;
/** Room for any ticket in the first pass (it is measured, then drawn at its real height). */
const DRAFT_HEIGHT = 20_000;

/** Every text printed on the ticket, in each supported language. */
const TEXT = {
  es: {
    title: 'TICKET DE VENTA',
    number: 'N° {n}',
    customer: 'Cliente',
    walkIn: 'Cliente de paso',
    docTypes: { none: '', sale_note: 'Nota de venta', receipt: 'Boleta', invoice: 'Factura' },
    quantity: 'Cant.',
    description: 'Descripción',
    amount: 'Importe',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    total: 'TOTAL',
    paidWith: 'Pagó con',
    credit: 'Al fiado',
    downPayment: 'Adelanto',
    owes: 'Queda debiendo',
    items: '{n} producto(s)',
    notes: 'Nota',
    voided: '*** VENTA ANULADA ***',
    thanks: '¡Gracias por tu compra!',
    notReceipt: 'Este ticket no es un comprobante electrónico.',
    methods: { cash: 'Efectivo', yape: 'Yape', plin: 'Plin', bank_transfer: 'Transferencia' },
    fileName: 'ticket-venta-{n}.pdf',
  },
  en: {
    title: 'SALES TICKET',
    number: 'No. {n}',
    customer: 'Customer',
    walkIn: 'Walk-in customer',
    docTypes: { none: '', sale_note: 'Sale note', receipt: 'Receipt', invoice: 'Invoice' },
    quantity: 'Qty',
    description: 'Description',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'TOTAL',
    paidWith: 'Paid with',
    credit: 'On credit',
    downPayment: 'Down payment',
    owes: 'Still owes',
    items: '{n} item(s)',
    notes: 'Note',
    voided: '*** SALE VOIDED ***',
    thanks: 'Thank you for your purchase!',
    notReceipt: 'This ticket is not an electronic receipt.',
    methods: { cash: 'Cash', yape: 'Yape', plin: 'Plin', bank_transfer: 'Bank transfer' },
    fileName: 'sales-ticket-{n}.pdf',
  },
} satisfies Record<Locale, unknown>;

type Doc = InstanceType<typeof PDFDocument>;

const padNumber = (n: number) => String(n).padStart(6, '0');

/** The ticket as drawn: first on a tall draft page to measure it, then on a page of that height. */
function draw(doc: Doc, sale: SaleDto, business: string, locale: Locale) {
  const text = TEXT[locale];
  const money = (value: number) => formatMoney(value, env.CURRENCY, locale);
  const plain = (value: number) =>
    new Intl.NumberFormat(INTL_LOCALES[locale], {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const quantity = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 3 });
  const created = new Date(sale.createdAt);
  // The sale date is a calendar day (stored at UTC midnight); the time is when it was recorded.
  const when = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDateOnly(sale.date));
  const time = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: env.APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(created);

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
  doc.text(business, MARGIN, MARGIN, { width: INNER, align: 'center' });
  doc.moveDown(0.2);
  center(text.title, 'Courier-Bold', 9);
  center(text.number.replace('{n}', padNumber(sale.number)));
  center(`${when}  ${time}`);
  const docType = text.docTypes[sale.docType];
  if (docType) center(`${docType} ${sale.docNumber ?? ''}`.trim());
  if (sale.status === 'voided') {
    doc.moveDown(0.3);
    center(text.voided, 'Courier-Bold', 9);
  }
  rule();
  doc.font('Courier').fontSize(8.5);
  doc.text(`${text.customer}: ${sale.customer?.name ?? text.walkIn}`, MARGIN, doc.y, {
    width: INNER,
  });
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
  for (const item of sale.items) {
    y = doc.y;
    doc.font('Courier').fontSize(8.5);
    doc.text(quantity.format(item.quantity), MARGIN, y, { width: qtyWidth });
    doc.text(item.description, MARGIN + qtyWidth, y, { width: descWidth });
    const below = doc.y;
    doc.text(plain(item.subtotal), MARGIN + qtyWidth + descWidth, y, {
      width: amountWidth,
      align: 'right',
    });
    doc.y = below;
    doc
      .fontSize(7.5)
      .fillColor('#333')
      .text(`x ${money(item.unitPrice)}`, MARGIN + qtyWidth, doc.y, { width: descWidth })
      .fillColor('#000');
    doc.moveDown(0.25);
  }
  rule();

  // Totals and how it was paid.
  const count = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  doc
    .font('Courier')
    .fontSize(7.5)
    .text(text.items.replace('{n}', quantity.format(count)), MARGIN, doc.y, { width: INNER });
  doc.moveDown(0.2);
  if (sale.discount > 0) {
    pair(text.subtotal, money(sale.subtotal));
    pair(text.discount, `-${money(sale.discount)}`);
  }
  pair(text.total, money(sale.total), true);
  doc.moveDown(0.3);
  if (sale.paymentType === 'cash') {
    if (sale.payments.length > 1) {
      pair(text.paidWith, '');
      for (const part of sale.payments) pair(`  ${text.methods[part.method]}`, money(part.amount));
    } else if (sale.method) {
      pair(text.paidWith, text.methods[sale.method]);
    }
  } else {
    pair(text.paidWith, text.credit);
    if (sale.receivable) {
      if (sale.receivable.paid > 0) pair(text.downPayment, money(sale.receivable.paid));
      pair(text.owes, money(sale.receivable.outstanding), true);
    }
  }
  if (sale.notes) {
    rule();
    doc
      .font('Courier')
      .fontSize(8)
      .text(`${text.notes}: ${sale.notes}`, MARGIN, doc.y, { width: INNER });
  }
  rule();
  center(text.thanks, 'Courier-Bold', 9);
  doc.moveDown(0.2);
  center(text.notReceipt, 'Courier', 7);
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
    const business = tenant?.name ?? 'Solvia';
    const draft = await render(DRAFT_HEIGHT, (doc) => draw(doc, sale, business, locale));
    const { buffer } = await render(Math.ceil(draft.bottom), (doc) =>
      draw(doc, sale, business, locale),
    );
    return { buffer, fileName: TEXT[locale].fileName.replace('{n}', padNumber(sale.number)) };
  },
};
