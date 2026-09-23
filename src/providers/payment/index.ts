import { env } from '../../config/env';
import { MockPaymentProvider } from './MockPaymentProvider';
import type { PaymentProvider } from './PaymentProvider';

export type { PaymentLink, PaymentLinkRequest, PaymentProvider } from './PaymentProvider';

/**
 * Builds the provider selected by `PAYMENT_PROVIDER`. To add a real gateway, implement
 * `PaymentProvider` (e.g. `CulqiPaymentProvider`, `MercadoPagoPaymentProvider`) and register it here.
 */
export function createPaymentProvider(provider = env.PAYMENT_PROVIDER): PaymentProvider {
  switch (provider) {
    case 'mock':
      return new MockPaymentProvider();
    case 'culqi':
    case 'mercadopago':
      throw new Error(
        `Payment provider "${provider}" is not implemented yet. Set PAYMENT_PROVIDER=mock or add an adapter.`,
      );
  }
}

export const paymentProvider: PaymentProvider = createPaymentProvider();
