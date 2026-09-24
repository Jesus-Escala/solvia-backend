import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenant } from '../src/lib/tenantContext';
import { reportRepository } from '../src/repositories/report.repository';
import { reportRangeSchema } from '../src/validators/report.schemas';

/**
 * The tabular reports aggregate in raw SQL, which bypasses the tenant-scope extension: each
 * query must carry the tenant id itself and fail closed without one.
 */

const { rawQueries } = vi.hoisted(() => ({ rawQueries: [] as Prisma.Sql[] }));

vi.mock('../src/lib/prisma', async () => {
  const { Prisma: PrismaNamespace } = await import('@prisma/client');
  return {
    prisma: {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push(PrismaNamespace.sql(strings, ...values));
        return Promise.resolve([]);
      },
    },
  };
});

const TENANT = '11111111-1111-4111-8111-111111111111';
const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO = new Date('2026-09-24T00:00:00.000Z');
const REPORTS: Record<string, () => Promise<unknown>> = {
  salesByCustomer: () => reportRepository.salesByCustomer(FROM, TO),
  collectionsByCustomer: () => reportRepository.collectionsByCustomer(FROM, TO),
  salesByProduct: () => reportRepository.salesByProduct(FROM, TO),
  shortages: () => reportRepository.shortages(FROM, TO),
};

describe('report queries', () => {
  beforeEach(() => {
    rawQueries.length = 0;
  });

  it.each(Object.entries(REPORTS))(
    '%s filters by the current tenant and range',
    async (_n, run) => {
      await runWithTenant(TENANT, run);
      const sql = rawQueries[0]!;
      expect(sql.text).toMatch(/"tenantId" = \$\d+/);
      expect(sql.values).toContain(TENANT);
      expect(sql.text).toContain("BETWEEN DATE '2026-09-01' AND DATE '2026-09-24'");
    },
  );

  it.each(Object.entries(REPORTS))('%s fails closed without a tenant', (_n, run) => {
    expect(() => run()).toThrow(/No tenant context/);
  });

  it('shortages only list sale lines with a shortage', async () => {
    await runWithTenant(TENANT, () => reportRepository.shortages(FROM, TO));
    expect(rawQueries[0]!.text).toMatch(/m\."type" = 'sale'/);
    expect(rawQueries[0]!.text).toMatch(/m\."shortage" > 0/);
  });
});

describe('report range', () => {
  const today = new Date('2026-09-24T00:00:00.000Z');

  it('defaults to the current month to date', () => {
    const range = reportRangeSchema(today).parse({});
    expect(range.from.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(range.to.toISOString().slice(0, 10)).toBe('2026-09-24');
  });

  it('rejects a range that ends before it starts', () => {
    expect(() =>
      reportRangeSchema(today).parse({ from: '2026-09-10', to: '2026-09-01' }),
    ).toThrow();
  });

  it('rejects ranges longer than 3 years', () => {
    expect(() =>
      reportRangeSchema(today).parse({ from: '2020-01-01', to: '2026-01-01' }),
    ).toThrow();
  });
});
