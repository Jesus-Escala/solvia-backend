import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_ALLOWANCE, hasRoom, PAID_ALLOWANCES, planAllowance } from '../src/domain/plans';
import { runWithTenant } from '../src/lib/tenantContext';
import { planUsageRepository } from '../src/repositories/planUsage.repository';

const { rawQueries } = vi.hoisted(() => ({ rawQueries: [] as Prisma.Sql[] }));

vi.mock('../src/lib/prisma', async () => {
  const { Prisma: PrismaNamespace } = await import('@prisma/client');
  return {
    prisma: {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push(PrismaNamespace.sql(strings, ...values));
        return Promise.resolve([{ count: 3 }]);
      },
    },
    basePrisma: {},
  };
});

describe('plan allowance', () => {
  it('gives the free plan manual reminders only', () => {
    expect(planAllowance('free', ['sales', 'inventory'])).toEqual(FREE_ALLOWANCE);
    expect(FREE_ALLOWANCE.automaticMessages).toBe(0);
  });

  it('grows with the number of modules (Cobranza always counts as one)', () => {
    expect(planAllowance('starter', [])).toEqual(PAID_ALLOWANCES[1]);
    expect(planAllowance('pro', ['sales'])).toEqual(PAID_ALLOWANCES[2]);
    expect(planAllowance('pro', ['sales', 'inventory'])).toEqual(PAID_ALLOWANCES[3]);
    expect(planAllowance('pro', ['sales', 'sales'])).toEqual(PAID_ALLOWANCES[2]);
  });

  it('treats a null limit as unlimited', () => {
    expect(hasRoom(10_000, null)).toBe(true);
    expect(hasRoom(499, 500)).toBe(true);
    expect(hasRoom(500, 500)).toBe(false);
  });
});

describe('automatic messages count', () => {
  beforeEach(() => {
    rawQueries.length = 0;
  });

  it('counts only sent automatic messages of the tenant since the local month start', async () => {
    const tenant = '11111111-1111-4111-8111-111111111111';
    const count = await runWithTenant(tenant, () =>
      planUsageRepository.automaticMessagesSince(
        new Date('2026-09-01T00:00:00.000Z'),
        'America/Lima',
      ),
    );
    expect(count).toBe(3);
    const sql = rawQueries[0]!;
    expect(sql.values).toContain(tenant);
    expect(sql.text).toContain('"automatic" = true');
    expect(sql.text).toContain('"status" = \'sent\'');
    expect(sql.text).toContain("DATE '2026-09-01'");
  });

  it('fails closed without a tenant', async () => {
    await expect(
      planUsageRepository.automaticMessagesSince(new Date(), 'America/Lima'),
    ).rejects.toThrow(/No tenant context/);
  });
});
