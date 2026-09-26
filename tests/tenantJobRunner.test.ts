import { describe, expect, it, vi } from 'vitest';
import { runForEachTenant } from '../src/jobs/tenantJobRunner';
import { currentLocale } from '../src/lib/locale';
import { getCurrentTenantId } from '../src/lib/tenantContext';

/** Scheduled jobs have no request: each business is processed in its own language. */

vi.mock('../src/repositories/tenant.repository', () => ({
  tenantRepository: {
    listActiveIds: () =>
      Promise.resolve([
        { id: 'tenant-es', name: 'Bodega', language: 'es' },
        { id: 'tenant-en', name: 'Store', language: 'en' },
      ]),
  },
}));

describe('runForEachTenant', () => {
  it('runs each tenant inside its context and its language', async () => {
    const results = await runForEachTenant('test', () =>
      Promise.resolve({ tenant: getCurrentTenantId(), locale: currentLocale() }),
    );
    expect(results.map((row) => row.result)).toEqual([
      { tenant: 'tenant-es', locale: 'es' },
      { tenant: 'tenant-en', locale: 'en' },
    ]);
  });

  it('keeps going when one tenant fails', async () => {
    const results = await runForEachTenant('test', () => {
      if (getCurrentTenantId() === 'tenant-es') return Promise.reject(new Error('boom'));
      return Promise.resolve(currentLocale());
    });
    expect(results.map((row) => row.error ?? row.result)).toEqual(['boom', 'en']);
  });
});
