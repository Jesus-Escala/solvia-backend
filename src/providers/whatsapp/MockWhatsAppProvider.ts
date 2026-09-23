import { randomUUID } from 'node:crypto';
import { renderTemplate, type TemplateVariables } from '../../domain/template';
import { logger } from '../../lib/logger';
import type { WhatsAppProvider, WhatsAppSendResult, WhatsAppTemplate } from './WhatsAppProvider';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Development provider: renders the template and prints the message to the console instead of
 * delivering it. The NotificationService persists every attempt in the Notification table.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';

  async send(
    to: string,
    template: WhatsAppTemplate,
    variables: TemplateVariables,
  ): Promise<WhatsAppSendResult> {
    const content = renderTemplate(template.text, variables);

    if (!E164_PATTERN.test(to)) {
      logger.warn(`[MockWhatsApp] Rejected message to invalid number "${to}"`);
      return { success: false, content, error: `Invalid WhatsApp number: ${to}` };
    }

    const providerMessageId = `mock-${randomUUID()}`;
    logger.info(
      [
        `[MockWhatsApp] Message ${providerMessageId}`,
        `  to:       ${to}`,
        `  template: ${template.type}`,
        `  content:  ${content}`,
      ].join('\n'),
    );
    return { success: true, content, providerMessageId };
  }
}
