import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenant } from '../src/lib/tenantContext';
import { analyticsRepository } from '../src/repositories/analytics.repository';

/**
 * Tenant isolation of the raw analytics queries. `$queryRaw` bypasses the tenant-scope
 * extension, so every raw query must carry the current tenant id itself. The Prisma client is
 * mocked: these tests inspect the SQL that would be sent, no database is needed.
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
      // Model queries are scoped by the extension (not under test here).
      payment: { groupBy: () => Promise.resolve([]) },
      receivable: { groupBy: () => Promise.resolve([]) },
      customer: { count: () => Promise.resolve(0) },
    },
  };
});

const TENANT = '11111111-1111-4111-8111-111111111111';
const from = new Date(Date.UTC(2026, 0, 1));
const to = new Date(Date.UTC(2026, 8, 30));

/** Every raw query of the repository, with representative arguments. */
const RAW_QUERIES: Record<string, () => Promise<unknown>> = {
  paymentsByDay: () => analyticsRepository.paymentsByDay(from, to),
  topPayers: () => analyticsRepository.topPayers(from, to, 8),
  customersCreatedByDay: () => analyticsRepository.customersCreatedByDay(from, to, 'America/Lima'),
  notificationsByDay: () => analyticsRepository.notificationsByDay(from, to, 'America/Lima'),
  remindedReceivables: () =>
    analyticsRepository.remindedReceivables(from, from, to, 7, 'America/Lima'),
  openBalancesByDueDate: () => analyticsRepository.openBalancesByDueDate(),
  topDebtors: () => analyticsRepository.topDebtors(6),
  riskOutcomes: () => analyticsRepository.riskOutcomes(),
};

describe('analytics repository tenant isolation', () => {
  beforeEach(() => {
    rawQueries.length = 0;
  });

  it.each(Object.entries(RAW_QUERIES))(
    '%s filters by the current tenant id',
    async (_name, query) => {
      await runWithTenant(TENANT, query);
      expect(rawQueries).toHaveLength(1);
      const sql = rawQueries[0]!;
      expect(sql.text).toMatch(/"tenantId" = \$\d+/);
      expect(sql.values).toContain(TENANT);
      // Payments and notifications have no tenantId: they must be joined through receivables.
      if (/"(payments|notifications)"/.test(sql.text)) {
        expect(sql.text).toMatch(/JOIN "receivables" r ON r\."id" = [pn]\."receivableId"/);
      }
    },
  );

  it.each(Object.entries(RAW_QUERIES))(
    '%s fails closed without a tenant context',
    async (_name, query) => {
      expect(() => query()).toThrow(/No tenant context/);
      expect(rawQueries).toHaveLength(0);
    },
  );

  it('covers every raw query of the repository', () => {
    const source = Object.entries(analyticsRepository)
      .filter(([, method]) => method.toString().includes('$queryRaw'))
      .map(([name]) => name);
    expect(source.sort()).toEqual(Object.keys(RAW_QUERIES).sort());
  });
});
