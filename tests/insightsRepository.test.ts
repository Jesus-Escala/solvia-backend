import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenant } from '../src/lib/tenantContext';
import { insightsRepository } from '../src/repositories/insights.repository';
import { REPORT_IDS, tableParamsSchema } from '../src/validators/report.schemas';

/**
 * The sales and purchases analysis aggregates in raw SQL, which bypasses the tenant-scope
 * extension: each query must carry the tenant id itself and fail closed without one.
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
const QUERIES = Object.fromEntries(
  (Object.keys(insightsRepository) as Array<keyof typeof insightsRepository>).map((name) => [
    name,
    () => insightsRepository[name](FROM, TO),
  ]),
);

describe('sales and purchases analysis queries', () => {
  beforeEach(() => {
    rawQueries.length = 0;
  });

  it.each(Object.entries(QUERIES))(
    '%s filters by the current tenant and range',
    async (_n, run) => {
      await runWithTenant(TENANT, run);
      for (const sql of rawQueries) {
        expect(sql.text).toMatch(/"tenantId" = \$\d+/);
        expect(sql.values).toContain(TENANT);
        expect(sql.text).toContain("BETWEEN DATE '2026-09-01' AND DATE '2026-09-24'");
      }
    },
  );

  it.each(Object.entries(QUERIES))('%s fails closed without a tenant', (_n, run) => {
    expect(() => run()).toThrow(/No tenant context/);
  });

  it('counts only completed sales in the totals, and every sale in the detail', async () => {
    await runWithTenant(TENANT, () => insightsRepository.salesByDay(FROM, TO));
    expect(rawQueries[0]!.text).toMatch(/s\."status" = 'completed'/);
    rawQueries.length = 0;
    await runWithTenant(TENANT, () => insightsRepository.salesDetail(FROM, TO));
    expect(rawQueries[0]!.text).not.toMatch(/s\."status" = 'completed'/);
  });

  it('sends the time zone of the hours as a parameter', async () => {
    await runWithTenant(TENANT, () => insightsRepository.salesByHour(FROM, TO));
    expect(rawQueries[0]!.text).toMatch(/AT TIME ZONE \$\d+/);
  });
});

describe('report ids', () => {
  it('exports every self-describing report and only those have a table', () => {
    expect(REPORT_IDS).toContain('purchases-detail');
    expect(REPORT_IDS).toContain('sales-by-customer');
    expect(tableParamsSchema.parse({ report: 'sales-detail' })).toEqual({
      report: 'sales-detail',
    });
    expect(() => tableParamsSchema.parse({ report: 'stock' })).toThrow();
  });
});
