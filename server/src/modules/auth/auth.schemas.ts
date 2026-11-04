import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);

export const password = z.string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Use 72 characters or fewer')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const loginSchema = z.object({ email, password: z.string().min(1).max(72) });
export const activateSchema = z.object({ token: z.string().min(20).max(200), password });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password });
