import type { UserRole } from '@prisma/client';
import { basePrisma, prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';

const publicUserSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export const userRepository = {
  /** Unscoped lookup used by login: the tenant is not known before authentication. */
  findByEmailForAuth(email: string) {
    return basePrisma.user.findUnique({ where: { email } });
  },

  /** Unscoped lookup used by token refresh. */
  findByIdForAuth(id: string) {
    return basePrisma.user.findUnique({ where: { id } });
  },

  emailExists(email: string) {
    return basePrisma.user.count({ where: { email } }).then((count) => count > 0);
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        tenant: { select: { id: true, name: true, industry: true, plan: true } },
      },
    });
  },

  list() {
    return prisma.user.findMany({ select: publicUserSelect, orderBy: { createdAt: 'asc' } });
  },

  create(data: { name: string; email: string; passwordHash: string; role: UserRole }) {
    return prisma.user.create({
      data: { ...data, tenantId: requireTenantId() },
      select: publicUserSelect,
    });
  },
};
