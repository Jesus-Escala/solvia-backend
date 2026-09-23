import type { UserRole } from '@prisma/client';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

/** Authenticated platform (backoffice) administrator. */
export interface PlatformAuthContext {
  adminId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      platformAuth?: PlatformAuthContext;
    }
  }
}
