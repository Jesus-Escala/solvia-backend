import type { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';
import {
  reminderSettingsSchema,
  templateTypeParamSchema,
  updateTemplateSchema,
} from '../validators/settings.schemas';

export const settingsController = {
  async listTemplates(_req: Request, res: Response) {
    res.json(await settingsService.listTemplates());
  },

  async updateTemplate(req: Request, res: Response) {
    const { type } = templateTypeParamSchema.parse(req.params);
    const { text } = updateTemplateSchema.parse(req.body);
    res.json(await settingsService.updateTemplate(type, text));
  },

  async resetTemplate(req: Request, res: Response) {
    const { type } = templateTypeParamSchema.parse(req.params);
    res.json(await settingsService.resetTemplate(type));
  },

  async getReminderRules(_req: Request, res: Response) {
    res.json(await settingsService.getReminderRules());
  },

  async updateReminderRules(req: Request, res: Response) {
    const input = reminderSettingsSchema.parse(req.body);
    res.json(await settingsService.updateReminderRules(input));
  },
};
