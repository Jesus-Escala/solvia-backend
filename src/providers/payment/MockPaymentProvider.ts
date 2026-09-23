import { randomUUID } from 'node:crypto';
import type { PaymentLink, PaymentLinkRequest, PaymentProvider } from './PaymentProvider';

/** Development provider that returns a fake checkout URL without contacting any gateway. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly baseUrl = 'https://pay.mock.solvia.dev/checkout') {}

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    const externalId = `mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const params = new URLSearchParams({
      ref: request.reference,
      amount: request.amount.toFixed(2),
      currency: request.currency,
    });
    return {
      url: `${this.baseUrl}/${externalId}?${params.toString()}`,
      externalId,
      provider: this.name,
      expiresAt: request.expiresAt,
    };
  }
}
