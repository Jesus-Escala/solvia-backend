import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { runWithTenant } from '../lib/tenantContext';

/**
 * Opens a tenant context for the rest of the request. Every query made through the scoped
 * Prisma client (`lib/prisma.ts`) is automatically filtered by this tenant.
 * Must run after `authenticate`.
 */
export function tenantScope(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  runWithTenant(req.auth.tenantId, () => next());
}

/** Returns the authenticated context, failing if the route was not protected. */
export function getAuth(req: Request) {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  return req.auth;
}
