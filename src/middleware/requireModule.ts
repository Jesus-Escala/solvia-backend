import type { NextFunction, Request, Response } from 'express';
import { hasModule, type ModuleRequirement } from '../domain/modules';
import { AppError } from '../errors/AppError';
import { tenantRepository } from '../repositories/tenant.repository';

/**
 * Restricts a router to businesses with the given module enabled (from the backoffice).
 * Must run inside the tenant scope. Fails with 403 MODULE_NOT_ENABLED otherwise.
 */
export function requireModule(module: ModuleRequirement) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenant = await tenantRepository.findCurrent();
    if (!tenant || !hasModule(tenant.modules, module)) {
      throw new AppError(
        403,
        'MODULE_NOT_ENABLED',
        `The ${module} module is not enabled for this business`,
      );
    }
    next();
  };
}
