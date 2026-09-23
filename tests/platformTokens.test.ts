import { beforeAll, describe, expect, it } from 'vitest';
import type * as TokenServiceModule from '../src/services/token.service';

type TokenService = typeof TokenServiceModule;

let tokens: TokenService;

beforeAll(async () => {
  // The token service reads the validated env; provide the required values before importing it.
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-with-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-with-at-least-32-characters';
  tokens = await import('../src/services/token.service');
});

const tenantUser = { id: 'user-1', tenantId: 'tenant-1', role: 'admin' as const };
const platformAdmin = { id: 'admin-1' };

describe('token realms', () => {
  it('accepts each token only in its own realm', () => {
    const tenant = tokens.issueTokens(tenantUser);
    const platform = tokens.issuePlatformTokens(platformAdmin);

    expect(tokens.verifyAccessToken(tenant.accessToken).tenantId).toBe('tenant-1');
    expect(tokens.verifyRefreshToken(tenant.refreshToken).sub).toBe('user-1');
    expect(tokens.verifyPlatformAccessToken(platform.accessToken).sub).toBe('admin-1');
    expect(tokens.verifyPlatformRefreshToken(platform.refreshToken).sub).toBe('admin-1');
  });

  it('rejects platform tokens on tenant verification', () => {
    const platform = tokens.issuePlatformTokens(platformAdmin);
    expect(() => tokens.verifyAccessToken(platform.accessToken)).toThrow();
    expect(() => tokens.verifyRefreshToken(platform.refreshToken)).toThrow();
  });

  it('rejects tenant tokens on platform verification', () => {
    const tenant = tokens.issueTokens(tenantUser);
    expect(() => tokens.verifyPlatformAccessToken(tenant.accessToken)).toThrow();
    expect(() => tokens.verifyPlatformRefreshToken(tenant.refreshToken)).toThrow();
  });

  it('never accepts a refresh token as an access token', () => {
    const platform = tokens.issuePlatformTokens(platformAdmin);
    expect(() => tokens.verifyPlatformAccessToken(platform.refreshToken)).toThrow();
  });
});
