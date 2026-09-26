import type { MessageTemplateType } from '@prisma/client';
import type { ReminderRules } from '../domain/reminderRules';
import {
  DEFAULT_TEMPLATES,
  defaultTemplate,
  isDefaultTemplate,
  resolveTemplate,
  TEMPLATE_PLACEHOLDERS,
} from '../domain/template';
import { currentLocale } from '../lib/locale';
import { requireTenantId } from '../lib/tenantContext';
import { tenantRepository } from '../repositories/tenant.repository';
import type { BusinessSettingsInput } from '../validators/settings.schemas';
import {
  reminderSettingsRepository,
  templateRepository,
} from '../repositories/settings.repository';

const TEMPLATE_TYPES = Object.keys(DEFAULT_TEMPLATES) as MessageTemplateType[];

function toRules(settings: ReminderRules): ReminderRules {
  return {
    enabled: settings.enabled,
    daysBeforeDue: settings.daysBeforeDue,
    onDueDate: settings.onDueDate,
    overdueEveryDays: settings.overdueEveryDays,
  };
}

export const settingsService = {
  /** Language of the automatic reminders (scheduled jobs have no request to take it from). */
  async getBusiness() {
    const tenant = await tenantRepository.findCurrent();
    return { language: tenant?.language ?? 'es' };
  },

  async updateBusiness(input: BusinessSettingsInput) {
    const tenant = await tenantRepository.updateLanguage(requireTenantId(), input.language);
    return { language: tenant.language };
  },

  /** Returns one template per type, falling back to the built-in defaults. */
  async listTemplates() {
    const stored = await templateRepository.list();
    const templates = TEMPLATE_TYPES.map((type) => {
      const text = stored.find((item) => item.type === type)?.text;
      return {
        type,
        text: resolveTemplate(type, text, currentLocale()),
        isDefault: !text || isDefaultTemplate(type, text),
      };
    });
    return { templates, placeholders: TEMPLATE_PLACEHOLDERS };
  },

  async getTemplateText(type: MessageTemplateType) {
    const template = await templateRepository.findByType(type);
    return resolveTemplate(type, template?.text, currentLocale());
  },

  /** Loads all template texts at once (used by the reminder engine). */
  async getTemplateTexts(): Promise<Record<MessageTemplateType, string>> {
    const stored = await templateRepository.list();
    return Object.fromEntries(
      TEMPLATE_TYPES.map((type) => [
        type,
        resolveTemplate(type, stored.find((item) => item.type === type)?.text, currentLocale()),
      ]),
    ) as Record<MessageTemplateType, string>;
  },

  async updateTemplate(type: MessageTemplateType, text: string) {
    const template = await templateRepository.upsert(type, text);
    return {
      type: template.type,
      text: template.text,
      isDefault: isDefaultTemplate(type, template.text),
    };
  },

  async resetTemplate(type: MessageTemplateType) {
    return this.updateTemplate(type, defaultTemplate(type, currentLocale()));
  },

  async getReminderRules(): Promise<ReminderRules> {
    return toRules(await reminderSettingsRepository.get());
  },

  async updateReminderRules(rules: ReminderRules): Promise<ReminderRules> {
    return toRules(await reminderSettingsRepository.update(rules));
  },
};
