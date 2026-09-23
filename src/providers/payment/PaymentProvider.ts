export interface PaymentLinkRequest {
  /** Internal reference used to reconcile the payment (the receivable id). */
  reference: string;
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  description: string;
  customer: { name: string; phone?: string; email?: string };
  expiresAt?: Date;
}

export interface PaymentLink {
  url: string;
  /** Identifier assigned by the payment provider. */
  externalId: string;
  provider: string;
  expiresAt?: Date;
}

/** Contract for online payment providers (Culqi, Mercado Pago...). */
export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink>;
}
