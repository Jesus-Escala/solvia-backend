import type { UserRole } from '@prisma/client';
import { basePrisma, prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';

/** Fields of a team member as shown to tenant admins and platform admins (`TenantUser`). */
export const tenantUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  googleId: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** Tenant status is needed by every sign-in path to reject suspended businesses. */
const authInclude = { tenant: { select: { status: true } } } as const;

export const userRepository = {
  /** Unscoped lookup used by login: the tenant is not known before authentication. */
  findByEmailForAuth(email: string) {
    return basePrisma.user.findUnique({ where: { email }, include: authInclude });
  },

  /** Unscoped lookup used by Google sign-in. */
  findByGoogleIdForAuth(googleId: string) {
    return basePrisma.user.findUnique({ where: { googleId }, include: authInclude });
  },

  /** Links a Google account to an existing user (first Google sign-in with the same email). */
  linkGoogleAccount(userId: string, googleId: string) {
    return basePrisma.user.update({
      where: { id: userId },
      data: { googleId },
      include: authInclude,
    });
  },

  /** Unscoped lookup used by token refresh and password changes. */
  findByIdForAuth(id: string) {
    return basePrisma.user.findUnique({ where: { id }, include: authInclude });
  },

  /** Records a successful sign-in. */
  touchLastLogin(id: string) {
    return basePrisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      include: authInclude,
    });
  },

  /** Stores a password chosen by the user and clears the "must change password" flag. */
  changePassword(id: string, passwordHash: string) {
    return basePrisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
      include: authInclude,
    });
  },

  emailExists(email: string) {
    return basePrisma.user.count({ where: { email } }).then((count) => count > 0);
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, industry: true, plan: true, modules: true } },
      },
    });
  },

  /** Team members of the current tenant: admins first, then by name. */
  list() {
    return prisma.user.findMany({
      select: tenantUserSelect,
      // Enums sort by declaration order in PostgreSQL: admin before collector.
      orderBy: [{ role: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });
  },

  findManaged(id: string) {
    return prisma.user.findUnique({ where: { id }, select: tenantUserSelect });
  },

  countActiveAdmins() {
    return prisma.user.count({ where: { role: 'admin', active: true } });
  },

  /** Creates a user of the current tenant with a temporary password. */
  create(data: { name: string; email: string; passwordHash: string; role: UserRole }) {
    return prisma.user.create({
      data: { ...data, mustChangePassword: true, tenantId: requireTenantId() },
      select: tenantUserSelect,
    });
  },

  update(id: string, data: { name?: string; role?: UserRole; active?: boolean }) {
    return prisma.user.update({ where: { id }, data, select: tenantUserSelect });
  },

  /** Replaces the password with a temporary one the user must change at next sign-in. */
  setTemporaryPassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
      select: { id: true },
    });
  },
};
