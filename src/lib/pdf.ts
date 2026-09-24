import PDFDocument from 'pdfkit';

/**
 * Building blocks of Solvia's PDFs (account statement, reports): brand header with the logo,
 * section titles, simple tables that continue on new pages, and page footers.
 */

export type PdfDoc = InstanceType<typeof PDFDocument>;

export const BRAND_COLOR = '#0F766E';
export const TEXT_COLOR = '#1F2937';
export const MUTED_COLOR = '#6B7280';
export const BORDER_COLOR = '#E5E7EB';
export const PAGE_MARGIN = 50;

export interface PdfColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

export function renderToBuffer(
  build: (doc: PdfDoc) => void,
  layout: 'portrait' | 'landscape' = 'portrait',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout, margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Solvia mark: Bowl's illustrated face (the same drawing as the web mascot and logo,
 * src/ui/brand/Mascot.tsx in the frontends) on the teal tile, with the gold S/ coin.
 * Face paths are in the mascot's 120x131 view coordinates.
 */
const FACE = {
  head: 'M60 25.5C68 25.5 75 26.6 80.8 29.2C83 25.8 86.4 23.4 89.8 23.6C93.4 23.8 95 26.8 94.8 30.6C94.6 34.6 94 38.4 95.2 42.4C97.3 47.4 98.2 52.5 98.2 58C98.2 75.4 81.4 87.4 60 87.4C38.6 87.4 21.8 75.4 21.8 58C21.8 52.5 22.7 47.4 24.8 42.4C26 38.4 25.4 34.6 25.2 30.6C25 26.8 26.6 23.8 30.2 23.6C33.6 23.4 37 25.8 39.2 29.2C45 26.6 52 25.5 60 25.5Z',
  beak: 'M60 67.6C57.3 67.6 55.3 69.3 55.3 71.4C55.3 74.2 58.2 76.8 60 77.8C61.8 76.8 64.7 74.2 64.7 71.4C64.7 69.3 62.7 67.6 60 67.6Z',
  brows: ['M36.9 43.3Q46.4 37.8 54.9 42.3', 'M65.1 42.3Q73.6 37.8 83.1 43.3'],
  eyes: [
    { x: 46.4, y: 60.8 },
    { x: 73.6, y: 60.8 },
  ],
  /** Fits the face (box x 21.8-98.2, y 20.6-87.4) into the 64x64 tile, like <LogoMark>. */
  transform: { x: -7.19, y: -2.93, scale: 48 / 76.4 },
};
const COIN = {
  s: 'M50.4 45.6C49.7 44.8 48.8 44.4 47.7 44.4C46.1 44.4 45.1 45.2 45.1 46.4C45.1 47.7 46.3 48 47.8 48.3C49.4 48.6 50.5 49 50.5 50.3C50.5 51.5 49.4 52.3 47.8 52.3C46.6 52.3 45.7 51.9 45.1 51.1',
  slash: 'M54.4 43.8L52 54',
};

function drawFace(doc: PdfDoc) {
  const { x, y, scale } = FACE.transform;
  doc.save();
  doc.translate(x, y).scale(scale);

  const head = doc.radialGradient(51, 43, 0, 51, 43, 58);
  head.stop(0, '#ffffff').stop(0.55, '#e6fffa').stop(1, '#a7f3e4');
  doc.path(FACE.head).fill(head);
  doc.path(FACE.head).lineWidth(1).strokeOpacity(0.55).stroke('#5eead4');
  doc.strokeOpacity(1);

  for (const [cx, angle] of [
    [89.6, 14],
    [30.4, -14],
  ] as const) {
    doc.save();
    doc.rotate(angle, { origin: [cx, 30] });
    doc.ellipse(cx, 30, 2.4, 3.8).fillOpacity(0.45).fill('#5eead4');
    doc.restore();
  }
  doc.fillOpacity(1);

  for (const eye of FACE.eyes) {
    const disc = doc.radialGradient(eye.x, eye.y, 0, eye.x, eye.y, 18.6);
    disc.stop(0.6, '#ffffff', 0.95).stop(1, '#ffffff', 0);
    doc.circle(eye.x, eye.y, 18.6).fill(disc);
  }
  for (const brow of FACE.brows) {
    doc.path(brow).lineWidth(2.6).lineCap('round').strokeOpacity(0.75).stroke('#14b8a6');
  }
  doc.strokeOpacity(1);
  for (const cx of [33, 87]) {
    const blush = doc.radialGradient(cx, 73, 0, cx, 73, 7.5);
    blush.stop(0, '#fb7185', 0.55).stop(1, '#fb7185', 0);
    doc.ellipse(cx, 73, 7.5, 4.8).fill(blush);
  }
  for (const eye of FACE.eyes) {
    doc.circle(eye.x, eye.y, 12.6).fill('#ffffff');
    const pupil = doc.radialGradient(eye.x - 2, eye.y - 2, 0, eye.x, eye.y + 1, 8.6);
    pupil.stop(0, '#1f5f63').stop(0.6, '#0e3440').stop(1, '#081c24');
    doc.circle(eye.x, eye.y + 1, 8.6).fill(pupil);
    doc.circle(eye.x + 3, eye.y - 2.6, 3.1).fill('#ffffff');
    doc.circle(eye.x - 3, eye.y + 4.2, 1.4).fill('#ffffff');
  }
  const beak = doc.linearGradient(60, 67.6, 60, 77.8);
  beak.stop(0, '#fcd34d').stop(1, '#f59e0b');
  doc.path(FACE.beak).fill(beak);
  doc.restore();
}

/** Draws the Solvia logo mark at (x, y) with the given size. */
export function drawLogoMark(doc: PdfDoc, x: number, y: number, size: number) {
  doc.save();
  doc.translate(x, y).scale(size / 64);
  const background = doc.linearGradient(4, 2, 60, 62);
  background.stop(0, '#34d399').stop(0.5, '#0d9488').stop(1, '#0c3a47');
  doc.roundedRect(0, 0, 64, 64, 18).fill(background);
  drawFace(doc);
  const gold = doc.linearGradient(40, 40, 58, 58);
  gold.stop(0, '#fde68a').stop(1, '#f59e0b');
  doc.circle(49, 49, 9.5).lineWidth(2.5).fillAndStroke(gold, '#0c3a47');
  doc.path(COIN.s).lineWidth(1.8).lineCap('round').lineJoin('round').stroke('#92400e');
  doc.path(COIN.slash).lineWidth(1.8).lineCap('round').stroke('#92400e');
  doc.restore();
}

/** Teal band with the logo, "Solvia" + tagline on the left and the title + subtitle on the right. */
export function drawHeader(
  doc: PdfDoc,
  header: { tagline: string; title: string; subtitle: string },
) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 90).fill(BRAND_COLOR);
  drawLogoMark(doc, PAGE_MARGIN, 23, 44);
  const textX = PAGE_MARGIN + 56;
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('Solvia', textX, 26);
  doc.font('Helvetica').fontSize(10).fillColor('#CCFBF1').text(header.tagline, textX, 54);
  doc.fillColor('#FFFFFF');
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(header.title, PAGE_MARGIN, 30, { width: width - PAGE_MARGIN * 2, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(header.subtitle, PAGE_MARGIN, 52, {
      width: width - PAGE_MARGIN * 2,
      align: 'right',
    });
  doc.fillColor(TEXT_COLOR);
  doc.y = 115;
}

export function drawSectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_COLOR).text(title, PAGE_MARGIN);
  doc.moveDown(0.4);
  doc.fillColor(TEXT_COLOR);
}

const ROW_HEIGHT = 20;

/** Starts a new page when `height` does not fit; returns whether it did. */
function ensureSpace(doc: PdfDoc, height: number): boolean {
  if (doc.y + height > doc.page.height - PAGE_MARGIN - 20) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
    return true;
  }
  return false;
}

function drawRow(
  doc: PdfDoc,
  columns: PdfColumn[],
  values: string[],
  options: { bold?: boolean; fill?: string },
) {
  const rowHeight = ROW_HEIGHT;
  ensureSpace(doc, rowHeight);
  const top = doc.y;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (options.fill) {
    doc.rect(PAGE_MARGIN, top, tableWidth, rowHeight).fill(options.fill);
  }
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(9)
    .fillColor(TEXT_COLOR);
  let x = PAGE_MARGIN;
  columns.forEach((column, index) => {
    doc.text(values[index] ?? '', x + 4, top + 6, {
      width: column.width - 8,
      align: column.align ?? 'left',
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  });
  doc
    .moveTo(PAGE_MARGIN, top + rowHeight)
    .lineTo(PAGE_MARGIN + tableWidth, top + rowHeight)
    .strokeColor(BORDER_COLOR)
    .lineWidth(0.5)
    .stroke();
  doc.y = top + rowHeight;
}

/**
 * Header row plus one row per entry; a row that does not fit starts a new page and repeats the
 * header there. `totals` (optional) is a bold last row.
 */
export function drawTable(
  doc: PdfDoc,
  columns: PdfColumn[],
  rows: string[][],
  emptyMessage: string,
  totals: string[] | null = null,
) {
  const header = () =>
    drawRow(
      doc,
      columns,
      columns.map((column) => column.header),
      { bold: true, fill: '#F3F4F6' },
    );
  header();
  if (rows.length === 0) {
    doc
      .moveDown(0.5)
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(MUTED_COLOR)
      .text(emptyMessage, PAGE_MARGIN);
    doc.fillColor(TEXT_COLOR);
    return;
  }
  for (const row of rows) {
    if (ensureSpace(doc, ROW_HEIGHT)) header();
    drawRow(doc, columns, row, {});
  }
  if (totals) {
    if (ensureSpace(doc, ROW_HEIGHT)) header();
    drawRow(doc, columns, totals, { bold: true, fill: '#F0FDFA' });
  }
}

/** Footer on every page (needs `bufferPages`). */
export function drawFooters(doc: PdfDoc, footer: (page: number, pages: number) => string) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // The footer sits inside the bottom margin; lift the margin while writing it, otherwise
    // pdfkit treats the text as overflow and appends an empty page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED_COLOR)
      .text(footer(index + 1, range.count), PAGE_MARGIN, doc.page.height - PAGE_MARGIN + 10, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }
}
