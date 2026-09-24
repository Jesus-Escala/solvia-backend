import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { requireRole } from '../middleware/authenticate';

export const settingsRouter = Router();

/**
 * @openapi
 * /settings/templates:
 *   get:
 *     tags: [Settings]
 *     summary: Message templates and the supported placeholders
 *     responses:
 *       200: { description: Templates }
 * /settings/templates/{type}:
 *   put:
 *     tags: [Settings]
 *     summary: Update a message template (admin only)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [pre_due_reminder, due_reminder, overdue_reminder, statement] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, example: 'Hi {{name}}, you owe {{amount}} due on {{date}}.' }
 *     responses:
 *       200: { description: Template updated }
 * /settings/templates/{type}/reset:
 *   post:
 *     tags: [Settings]
 *     summary: Restore the default text of a template (admin only)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [pre_due_reminder, due_reminder, overdue_reminder, statement] }
 *     responses:
 *       200: { description: Template reset }
 */
settingsRouter.get('/templates', settingsController.listTemplates);
settingsRouter.put('/templates/:type', requireRole('admin'), settingsController.updateTemplate);
settingsRouter.post(
  '/templates/:type/reset',
  requireRole('admin'),
  settingsController.resetTemplate,
);

/**
 * @openapi
 * /settings/reminders:
 *   get:
 *     tags: [Settings]
 *     summary: Reminder engine rules
 *     responses:
 *       200:
 *         description: Rules
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ReminderRules' }
 *   put:
 *     tags: [Settings]
 *     summary: Update reminder engine rules (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ReminderRules' }
 *     responses:
 *       200: { description: Rules updated }
 */
/**
 * @openapi
 * /settings/plan:
 *   get:
 *     tags: [Settings]
 *     summary: What the plan includes and what the business used this month
 *     responses:
 *       200:
 *         description: >
 *           Allowance and use of the current month: `automaticMessages` (used, included by the
 *           plan, extra packs, limit, left), `users` and `customers` (used, limit; null =
 *           unlimited). Manual reminders from the owner's WhatsApp are never counted.
 */
settingsRouter.get('/plan', settingsController.planUsage);
settingsRouter.get('/reminders', settingsController.getReminderRules);
settingsRouter.put('/reminders', requireRole('admin'), settingsController.updateReminderRules);
