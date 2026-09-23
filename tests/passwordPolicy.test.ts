import { describe, expect, it } from 'vitest';
import { registerSchema } from '../src/validators/auth.schemas';

const base = { businessName: 'Acme', name: 'Ana Pérez', email: 'ana@acme.pe' };
const accepts = (password: string) => registerSchema.safeParse({ ...base, password }).success;

describe('password policy', () => {
  it('accepts a password that meets every rule', () => {
    expect(accepts('Password123!')).toBe(true);
    expect(accepts('Ñandú2026#')).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(accepts('Pa1!')).toBe(false);
  });

  it('requires an uppercase letter', () => {
    expect(accepts('password123!')).toBe(false);
  });

  it('requires a number', () => {
    expect(accepts('Password!!')).toBe(false);
  });

  it('requires a special character (accented letters and spaces do not count)', () => {
    expect(accepts('Password123')).toBe(false);
    expect(accepts('Contraseña123')).toBe(false);
    expect(accepts('Password 123')).toBe(false);
  });
});
