import { z } from 'zod';

const email = z
  .email('Invalid email address')
  .max(254)
  .transform((value) => value.toLowerCase().trim());

/**
 * Password policy for new passwords. Mirrored by the register form checklist
 * (frontend/packages/ui/src/components/passwordRules.ts); keep both in sync.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/\p{Lu}/u, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^\p{L}\p{N}\s]/u, 'Password must contain at least one special character');

export const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  industry: z.string().trim().max(80).optional(),
  plan: z.enum(['free', 'starter', 'pro']).default('free'),
  name: z.string().trim().min(2).max(120),
  email,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const googleSignInSchema = z.object({
  /** ID token returned by Google Identity Services. */
  credential: z.string().min(20, 'Google credential is required'),
  /** Required only the first time, to create the business. */
  businessName: z.string().trim().min(2).max(120).optional(),
  industry: z.string().trim().max(80).optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password: passwordSchema,
  role: z.enum(['admin', 'collector']).default('collector'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;
