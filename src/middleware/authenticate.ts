import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { verifyAccessToken, verifyPlatformAccessToken } from '../services/token.service';

function bearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized();
  }
  return header.slice('Bearer '.length).trim();
}

function attachAuth(req: Request) {
  const payload = verifyAccessToken(bearerToken(req));
  req.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  return payload;
}

/**
 * Validates the `Authorization: Bearer <token>` header and attaches `req.auth`.
 * Only tenant access tokens are accepted; platform admin tokens are rejected.
 * Users with a temporary password (`pwc` claim) are rejected until they change it; the few
 * routes they may use are protected by `authenticateAllowingPasswordChange` instead.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const payload = attachAuth(req);
  if (payload.pwc) {
    throw new AppError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'You must change your temporary password before continuing',
    );
  }
  next();
}

/**
 * Same as `authenticate` but also admits users who must change their temporary password.
 * Allow-list: only `GET /auth/me` and `POST /auth/change-password` use it.
 */
export function authenticateAllowingPasswordChange(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  attachAuth(req);
  next();
}

/**
 * Validates a platform (backoffice) access token and attaches `req.platformAuth`.
 * Tenant access tokens are rejected.
 */
export function authenticatePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  const payload = verifyPlatformAccessToken(bearerToken(req));
  req.platformAuth = { adminId: payload.sub };
  next();
}

/** Returns the authenticated platform admin, failing if the route was not protected. */
export function getPlatformAuth(req: Request) {
  if (!req.platformAuth) {
    throw AppError.unauthorized();
  }
  return req.platformAuth;
}

/** Restricts a route to the given roles. Must run after `authenticate`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(req.auth.role)) {
      throw AppError.forbidden();
    }
    next();
  };
}
