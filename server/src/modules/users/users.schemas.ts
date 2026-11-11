import { z } from 'zod';
import { email } from '../auth/auth.schemas';
import { ROLES } from './roles';

export const createUserSchema = z.object({
  email,
  role: z.enum(ROLES),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  admissionNumber: z.string().trim().min(1).max(40).optional(),
  staffNumber: z.string().trim().min(1).max(40).optional(),
}).superRefine((v, ctx) => {
  if (v.role === 'student' && !v.admissionNumber) ctx.addIssue({ code: 'custom', path: ['admissionNumber'], message: 'Enter the admission number' });
  if (v.role === 'teacher' && !v.staffNumber) ctx.addIssue({ code: 'custom', path: ['staffNumber'], message: 'Enter the staff number' });
});

export const listUsersSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const idParam = z.object({ id: z.string().uuid() });
export const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine((d) => !Number.isNaN(new Date(d).getTime()) && d <= new Date().toISOString().slice(0, 10), 'Enter a real date that is not in the future');
export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: email.optional(),
  admissionNumber: z.string().trim().min(1).max(40).optional(),
  staffNumber: z.string().trim().min(1).max(40).optional(),
  dateOfBirth: dateOnly.nullable().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
