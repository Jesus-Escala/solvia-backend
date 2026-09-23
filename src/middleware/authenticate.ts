import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../services/token.service';

/** Validates the `Authorization: Bearer <token>` header and attaches `req.auth`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized();
  }

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
  req.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  next();
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
