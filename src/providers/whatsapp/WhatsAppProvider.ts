import type { MessageTemplateType } from '@prisma/client';
import type { TemplateVariables } from '../../domain/template';

export interface WhatsAppTemplate {
  type: MessageTemplateType;
  /** Template body with `{{placeholders}}`. */
  text: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  /** Final message content as delivered (or attempted). */
  content: string;
  providerMessageId?: string;
  error?: string;
}

/**
 * Contract for WhatsApp messaging providers (Meta Cloud API, 360dialog, Twilio...).
 * Implementations must not throw for delivery failures: they return `success: false` instead,
 * so every attempt can be logged consistently.
 */
export interface WhatsAppProvider {
  readonly name: string;
  send(
    to: string,
    template: WhatsAppTemplate,
    variables: TemplateVariables,
  ): Promise<WhatsAppSendResult>;
}
