import type { MessageTemplateType, TenantPlan } from '@prisma/client';
import { DEFAULT_REMINDER_RULES } from '../domain/reminderRules';
import { DEFAULT_TEMPLATES } from '../domain/template';
import { basePrisma, prisma } from '../lib/prisma';

export interface CreateTenantData {
  tenant: { name: string; industry?: string | null; plan: TenantPlan };
  admin: { name: string; email: string; passwordHash: string };
}

export const tenantRepository = {
  /**
   * Creates a tenant with its first admin user, default message templates and reminder rules
   * in a single transaction. Uses the unscoped client because no tenant context exists yet.
   */
  createWithAdmin({ tenant, admin }: CreateTenantData) {
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
      return { tenant: createdTenant, user };
    });
  },

  /** All tenant ids, for job orchestration. */
  listIds() {
    return basePrisma.tenant.findMany({ select: { id: true, name: true } });
  },

  /** The tenant of the current context. */
  findCurrent() {
    return prisma.tenant.findFirst();
  },
};
