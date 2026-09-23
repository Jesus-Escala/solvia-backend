import { z } from 'zod';

const email = z
  .email('Invalid email address')
  .max(254)
  .transform((value) => value.toLowerCase().trim());

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  industry: z.string().trim().max(80).optional(),
  plan: z.enum(['free', 'starter', 'pro']).default('free'),
  name: z.string().trim().min(2).max(120),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  role: z.enum(['admin', 'collector']).default('collector'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
