import type { UserRole } from '@prisma/client';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  type: 'access';
  /**
   * "Password change required": present while the user still has a temporary password. The
   * `authenticate` middleware then only lets the user reach the password-change routes.
   */
  pwc?: true;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

/**
 * Platform (backoffice) tokens are signed with the same secrets but carry their own `type` and
 * `aud` claims, so they are never accepted where a tenant token is expected and vice versa.
 */
export const PLATFORM_AUDIENCE = 'solvia-platform';

export interface PlatformAccessTokenPayload {
  sub: string;
  scope: 'platform';
  type: 'platform_access';
}

export interface PlatformRefreshTokenPayload {
  sub: string;
  scope: 'platform';
  type: 'platform_refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function issueTokens(user: {
  id: string;
  tenantId: string;
  role: UserRole;
  mustChangePassword?: boolean;
}): TokenPair {
  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    type: 'access',
    ...(user.mustChangePassword && { pwc: true as const }),
  };
  const refreshPayload: RefreshTokenPayload = { sub: user.id, type: 'refresh' };

  return {
    accessToken: jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    }),
    refreshToken: jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    }),
  };
}

export function issuePlatformTokens(admin: { id: string }): TokenPair {
  const accessPayload: PlatformAccessTokenPayload = {
    sub: admin.id,
    scope: 'platform',
    type: 'platform_access',
  };
  const refreshPayload: PlatformRefreshTokenPayload = {
    sub: admin.id,
    scope: 'platform',
    type: 'platform_refresh',
  };

  return {
    accessToken: jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      audience: PLATFORM_AUDIENCE,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    }),
    refreshToken: jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
      audience: PLATFORM_AUDIENCE,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    }),
  };
}

function verify<T extends { type: string }>(
  token: string,
  secret: string,
  type: T['type'],
  audience?: string,
): T {
  try {
    const payload = jwt.verify(token, secret, audience ? { audience } : {}) as T & {
      aud?: string | string[];
    };
    // Tenant tokens never carry an audience; a token with one belongs to another realm.
    if (payload.type !== type || (!audience && payload.aud !== undefined)) {
      throw AppError.unauthorized('Invalid token type');
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message =
      error instanceof jwt.TokenExpiredError ? 'Token has expired' : 'Invalid or malformed token';
    throw AppError.unauthorized(message);
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verify<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET, 'access');
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verify<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET, 'refresh');
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  return verify<PlatformAccessTokenPayload>(
    token,
    env.JWT_ACCESS_SECRET,
    'platform_access',
    PLATFORM_AUDIENCE,
  );
}

export function verifyPlatformRefreshToken(token: string): PlatformRefreshTokenPayload {
  return verify<PlatformRefreshTokenPayload>(
    token,
    env.JWT_REFRESH_SECRET,
    'platform_refresh',
    PLATFORM_AUDIENCE,
  );
}
