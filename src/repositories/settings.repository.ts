import type { MessageTemplateType } from '@prisma/client';
import { DEFAULT_REMINDER_RULES, type ReminderRules } from '../domain/reminderRules';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../lib/tenantContext';

export const templateRepository = {
  list() {
    return prisma.messageTemplate.findMany({ orderBy: { type: 'asc' } });
  },

  findByType(type: MessageTemplateType) {
    return prisma.messageTemplate.findFirst({ where: { type } });
  },

  async upsert(type: MessageTemplateType, text: string) {
    const existing = await prisma.messageTemplate.findFirst({ where: { type } });
    if (existing) {
      return prisma.messageTemplate.update({ where: { id: existing.id }, data: { text } });
    }
    return prisma.messageTemplate.create({ data: { type, text, tenantId: requireTenantId() } });
  },
};

export const reminderSettingsRepository = {
  async get() {
    const settings = await prisma.reminderSettings.findFirst();
    if (settings) return settings;
    return prisma.reminderSettings.create({
      data: { ...DEFAULT_REMINDER_RULES, tenantId: requireTenantId() },
    });
  },

  async update(rules: ReminderRules) {
    const current = await this.get();
    return prisma.reminderSettings.update({ where: { id: current.id }, data: rules });
  },
};
