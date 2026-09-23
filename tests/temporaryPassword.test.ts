import { describe, expect, it } from 'vitest';
import {
  TEMPORARY_PASSWORD_CHARSETS,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from '../src/domain/temporaryPassword';
import { passwordSchema } from '../src/validators/auth.schemas';

const RUNS = 2000;
const samples = Array.from({ length: RUNS }, () => generateTemporaryPassword());

describe('generateTemporaryPassword', () => {
  it('generates 12-character passwords', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(12);
    expect(samples.every((password) => password.length === 12)).toBe(true);
  });

  it('always satisfies the password policy', () => {
    for (const password of samples) {
      expect(passwordSchema.safeParse(password).success).toBe(true);
    }
  });

  it('always contains an uppercase, a lowercase, a digit and a special character', () => {
    for (const password of samples) {
      for (const charset of Object.values(TEMPORARY_PASSWORD_CHARSETS)) {
        expect([...password].some((char) => charset.includes(char))).toBe(true);
      }
    }
  });

  it('never uses ambiguous characters', () => {
    expect(samples.some((password) => /[0Oo1lI]/.test(password))).toBe(false);
  });

  it('only uses characters from the allowed sets', () => {
    const allowed = new Set(Object.values(TEMPORARY_PASSWORD_CHARSETS).join(''));
    expect(samples.every((password) => [...password].every((char) => allowed.has(char)))).toBe(
      true,
    );
  });

  it('produces different passwords', () => {
    expect(new Set(samples).size).toBe(RUNS);
  });

  it('does not always start with the same character class', () => {
    const firstIsUpper = samples.filter((password) =>
      TEMPORARY_PASSWORD_CHARSETS.upper.includes(password[0]!),
    ).length;
    expect(firstIsUpper).toBeLessThan(RUNS * 0.9);
  });
});
