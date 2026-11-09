import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Kingdom of Knowledge <onboarding@resend.dev>'),
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  STORAGE_DIR: z.string().default('./uploads'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('school-files'),
  PAYSTACK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, 'must start with sk_test_ or sk_live_').optional().or(z.literal('').transform(() => undefined)),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  CLIENT_ORIGIN: z.string().url().transform((v) => v.replace(/\/+$/, '')),
}).superRefine((v, ctx) => {
  if (v.STORAGE_DRIVER === 'supabase' && (!v.SUPABASE_URL || !v.SUPABASE_SERVICE_ROLE_KEY)) {
    ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
