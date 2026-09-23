import { basePrisma } from '../lib/prisma';

/** Platform administrators are not tenant-owned, so every query uses the unscoped client. */
export const platformAdminRepository = {
  findByEmail(email: string) {
    return basePrisma.platformAdmin.findUnique({ where: { email } });
  },

  findById(id: string) {
    return basePrisma.platformAdmin.findUnique({ where: { id } });
  },

  touchLastLogin(id: string) {
    return basePrisma.platformAdmin.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  },

  /** Creates the admin or refreshes its name and password (idempotent seeding). */
  upsert(data: { email: string; name: string; passwordHash: string }) {
    return basePrisma.platformAdmin.upsert({
      where: { email: data.email },
      create: data,
      update: { name: data.name, passwordHash: data.passwordHash },
    });
  },
};
