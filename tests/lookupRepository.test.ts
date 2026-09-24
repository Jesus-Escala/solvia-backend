import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenant } from '../src/lib/tenantContext';
import { customerRepository } from '../src/repositories/customer.repository';
import { productRepository } from '../src/repositories/product.repository';
import { escapeLike } from '../src/repositories/sql';

/**
 * The picker searches are raw SQL (ranking and SQL-computed balances), so they bypass the
 * tenant-scope extension: they must carry the tenant id themselves and treat user text as data.
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
const LOOKUPS = {
  products: (search: string) => productRepository.lookup(search, 8),
  customers: (search: string) => customerRepository.lookup(search, 8),
};

describe('picker lookups', () => {
  beforeEach(() => {
    rawQueries.length = 0;
  });

  it.each(Object.entries(LOOKUPS))('%s filter by the current tenant', async (_name, lookup) => {
    await runWithTenant(TENANT, () => lookup('arroz'));
    const sql = rawQueries[0]!;
    expect(sql.text).toMatch(/"tenantId" = \$\d+/);
    expect(sql.values).toContain(TENANT);
    expect(sql.values).toContain(8);
  });

  it.each(Object.entries(LOOKUPS))('%s fail closed without a tenant', async (_name, lookup) => {
    expect(() => lookup('x')).toThrow(/No tenant context/);
  });

  it('sends the search as bound parameters, with LIKE wildcards escaped', async () => {
    await runWithTenant(TENANT, () => productRepository.lookup("50%_off' OR 1=1", 8));
    const sql = rawQueries[0]!;
    expect(sql.text).not.toContain('OR 1=1');
    expect(sql.values).toContain("50\\%\\_off' OR 1=1");
  });
});

describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('arroz')).toBe('arroz');
  });
});
