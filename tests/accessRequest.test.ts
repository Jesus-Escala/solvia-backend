import { describe, expect, it } from 'vitest';
import { createAccessRequestSchema } from '../src/validators/accessRequest.schemas';

const valid = {
  businessName: 'Botica Santa Rosa',
  contactName: 'Julia Condori',
  email: 'Julia@BoticaSantaRosa.pe',
  phone: '+51 954 123-456',
};

describe('createAccessRequestSchema', () => {
  it('accepts a valid request and normalizes the email', () => {
    const result = createAccessRequestSchema.parse({ ...valid, industry: ' ', message: '' });
    expect(result.email).toBe('julia@boticasantarosa.pe');
    expect(result.industry).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it('validates the phone format and length', () => {
    for (const phone of ['12345', '+51 954 abc 456', '1'.repeat(21)]) {
      expect(createAccessRequestSchema.safeParse({ ...valid, phone }).success).toBe(false);
    }
    expect(createAccessRequestSchema.safeParse({ ...valid, phone: '954123' }).success).toBe(true);
  });

  it('limits name and message lengths', () => {
    expect(createAccessRequestSchema.safeParse({ ...valid, businessName: 'A' }).success).toBe(
      false,
    );
    expect(
      createAccessRequestSchema.safeParse({ ...valid, contactName: 'x'.repeat(121) }).success,
    ).toBe(false);
    expect(
      createAccessRequestSchema.safeParse({ ...valid, message: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});
