import type { UserRole } from '@prisma/client';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function issueTokens(user: { id: string; tenantId: string; role: UserRole }): TokenPair {
  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    type: 'access',
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

function verify<T extends { type: string }>(token: string, secret: string, type: T['type']): T {
  try {
    const payload = jwt.verify(token, secret) as T;
    if (payload.type !== type) {
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
