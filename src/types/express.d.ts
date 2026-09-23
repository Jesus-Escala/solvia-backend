import type { UserRole } from '@prisma/client';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
