import type { MessageTemplateType, TenantPlan } from '@prisma/client';
import { DEFAULT_REMINDER_RULES } from '../domain/reminderRules';
import { DEFAULT_TEMPLATES } from '../domain/template';
import { basePrisma, prisma } from '../lib/prisma';

export interface CreateTenantData {
  tenant: { name: string; industry?: string | null; plan: TenantPlan };
  /** `passwordHash` is null for Google-only accounts, which carry a `googleId` instead. */
  admin: {
    name: string;
    email: string;
    passwordHash: string | null;
    googleId?: string;
    /** True when the admin receives a temporary password (managed onboarding). */
    mustChangePassword?: boolean;
  };
  /** Access request the tenant is created from; it is marked `converted` in the same transaction. */
  accessRequestId?: string;
}

export const tenantRepository = {
  /**
   * Creates a tenant with its first admin user, default message templates and reminder rules
   * in a single transaction. Uses the unscoped client because no tenant context exists yet.
   * Shared by self-service sign-up, Google sign-up, the platform backoffice and the seed.
   */
  createWithAdmin({ tenant, admin, accessRequestId }: CreateTenantData) {
    return basePrisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({ data: tenant });
      const user = await tx.user.create({
        data: { ...admin, role: 'admin', tenantId: createdTenant.id },
      });
      await tx.messageTemplate.createMany({
        data: (Object.entries(DEFAULT_TEMPLATES) as Array<[MessageTemplateType, string]>).map(
          ([type, text]) => ({ tenantId: createdTenant.id, type, text }),
        ),
      });
      await tx.reminderSettings.create({
        data: { tenantId: createdTenant.id, ...DEFAULT_REMINDER_RULES },
      });
      if (accessRequestId) {
        await tx.accessRequest.update({
          where: { id: accessRequestId },
          data: { status: 'converted', tenantId: createdTenant.id },
        });
      }
      return { tenant: createdTenant, user };
    });
  },

  /** Ids of active tenants, for job orchestration (suspended tenants get no reminders). */
  listActiveIds() {
    return basePrisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
    });
  },

  /** The tenant of the current context. */
  findCurrent() {
    return prisma.tenant.findFirst();
  },
};
