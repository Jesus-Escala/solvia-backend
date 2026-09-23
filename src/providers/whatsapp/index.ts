import { env } from '../../config/env';
import { MockWhatsAppProvider } from './MockWhatsAppProvider';
import type { WhatsAppProvider } from './WhatsAppProvider';

export type { WhatsAppProvider, WhatsAppSendResult, WhatsAppTemplate } from './WhatsAppProvider';

/**
 * Builds the provider selected by `WHATSAPP_PROVIDER`. To add a real provider, implement
 * `WhatsAppProvider` (e.g. `MetaCloudWhatsAppProvider`) and register it here.
 */
export function createWhatsAppProvider(provider = env.WHATSAPP_PROVIDER): WhatsAppProvider {
  switch (provider) {
    case 'mock':
      return new MockWhatsAppProvider();
    case 'meta':
    case 'dialog360':
    case 'twilio':
      throw new Error(
        `WhatsApp provider "${provider}" is not implemented yet. Set WHATSAPP_PROVIDER=mock or add an adapter.`,
      );
  }
}

export const whatsAppProvider: WhatsAppProvider = createWhatsAppProvider();
