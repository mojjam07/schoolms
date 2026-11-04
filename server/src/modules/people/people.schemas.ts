import { z } from 'zod';

const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
export const linkSchema = z.object({
  parentId: uuid, studentId: uuid,
  relationship: z.enum(['mother', 'father', 'guardian', 'other']),
  isPrimary: z.boolean().default(false),
});
export const unlinkParams = z.object({ parentId: uuid, studentId: uuid });
export const listLinksSchema = z.object({ parentId: uuid.optional(), studentId: uuid.optional() });
export const listStudentsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  classId: uuid.optional(),
  sessionId: uuid.optional(), // defaults to the current session
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
