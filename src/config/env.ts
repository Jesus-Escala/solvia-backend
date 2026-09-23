import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_API_URL: z.url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().default('America/Lima'),
  CURRENCY: z.string().length(3).default('PEN'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),

  JOBS_ENABLED: booleanString,
  REMINDER_CRON: z.string().default('0 * * * *'),
  MONTHLY_REPORT_CRON: z.string().default('30 23 * * *'),

  WHATSAPP_PROVIDER: z.enum(['mock', 'meta', 'dialog360', 'twilio']).default('mock'),
  PAYMENT_PROVIDER: z.enum(['mock', 'culqi', 'mercadopago']).default('mock'),

  SEED_ON_START: booleanString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
