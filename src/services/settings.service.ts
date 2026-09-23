import type { MessageTemplateType } from '@prisma/client';
import type { ReminderRules } from '../domain/reminderRules';
import { DEFAULT_TEMPLATES, TEMPLATE_PLACEHOLDERS } from '../domain/template';
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
  /** Returns one template per type, falling back to the built-in defaults. */
  async listTemplates() {
    const stored = await templateRepository.list();
    const templates = TEMPLATE_TYPES.map((type) => {
      const template = stored.find((item) => item.type === type);
      return {
        type,
        text: template?.text ?? DEFAULT_TEMPLATES[type],
        isDefault: !template || template.text === DEFAULT_TEMPLATES[type],
      };
    });
    return { templates, placeholders: TEMPLATE_PLACEHOLDERS };
  },

  async getTemplateText(type: MessageTemplateType) {
    const template = await templateRepository.findByType(type);
    return template?.text ?? DEFAULT_TEMPLATES[type];
  },

  /** Loads all template texts at once (used by the reminder engine). */
  async getTemplateTexts(): Promise<Record<MessageTemplateType, string>> {
    const stored = await templateRepository.list();
    return Object.fromEntries(
      TEMPLATE_TYPES.map((type) => [
        type,
        stored.find((item) => item.type === type)?.text ?? DEFAULT_TEMPLATES[type],
      ]),
    ) as Record<MessageTemplateType, string>;
  },

  async updateTemplate(type: MessageTemplateType, text: string) {
    const template = await templateRepository.upsert(type, text);
    return {
      type: template.type,
      text: template.text,
      isDefault: template.text === DEFAULT_TEMPLATES[type],
    };
  },

  async resetTemplate(type: MessageTemplateType) {
    return this.updateTemplate(type, DEFAULT_TEMPLATES[type]);
  },

  async getReminderRules(): Promise<ReminderRules> {
    return toRules(await reminderSettingsRepository.get());
  },

  async updateReminderRules(rules: ReminderRules): Promise<ReminderRules> {
    return toRules(await reminderSettingsRepository.update(rules));
  },
};
