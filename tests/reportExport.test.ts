import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { runWithLocale } from '../src/lib/locale';
import { reportExportService } from '../src/services/reportExport.service';

vi.mock('../src/repositories/tenant.repository', () => ({
  tenantRepository: { findCurrent: () => Promise.resolve({ name: 'Bodega Demo' }) },
}));

vi.mock('../src/services/report.service', () => ({
  reportService: {
    salesByCustomer: () =>
      Promise.resolve({
        period: { from: '2026-09-01', to: '2026-09-24' },
        rows: [
          {
            customerId: null,
            name: null,
            sales: 2,
            total: 69.5,
            cash: 69.5,
            credit: 0,
            lastSale: '2026-09-24',
          },
          {
            customerId: 'c1',
            name: 'Jorge',
            sales: 1,
            total: 23.8,
            cash: 0,
            credit: 23.8,
            lastSale: '2026-09-20',
          },
        ],
        totals: { sales: 3, total: 93.3, cash: 69.5, credit: 23.8 },
      }),
  },
}));

const RANGE = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-24T00:00:00.000Z'),
};

describe('report export', () => {
  it('writes an Excel sheet with real numbers, dates and a totals row', async () => {
    const file = await runWithLocale('es', () =>
      reportExportService.export('sales-by-customer', RANGE, 'xlsx'),
    );
    expect(file.fileName).toBe('solvia-ventas-por-cliente-2026-09-01-2026-09-24.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.name).toBe('Ventas por cliente');
    expect(sheet.getCell('A2').value).toContain('Bodega Demo');
    expect(sheet.getRow(4).getCell(1).value).toBe('Cliente');
    expect(sheet.getRow(5).getCell(1).value).toBe('Cliente de paso');
    expect(sheet.getRow(5).getCell(2).value).toBe(69.5);
    expect(sheet.getRow(5).getCell(6).value).toBeInstanceOf(Date);
    expect(sheet.getRow(7).getCell(1).value).toBe('Total');
    expect(sheet.getRow(7).getCell(2).value).toBe(93.3);
  });

  it('writes a PDF in the request language', async () => {
    const file = await runWithLocale('en', () =>
      reportExportService.export('sales-by-customer', RANGE, 'pdf'),
    );
    expect(file.contentType).toBe('application/pdf');
    expect(file.fileName).toBe('solvia-sales-by-customer-2026-09-01-2026-09-24.pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
