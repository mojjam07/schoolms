import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const uuid = z.string().uuid();
const range = (v: { startDate?: string; endDate?: string }) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
const rangeMsg = { message: 'The end date cannot be before the start date', path: ['endDate'] };

export const idParam = z.object({ id: uuid });

export const sessionName = z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027')
  .refine((n) => Number(n.slice(5)) === Number(n.slice(0, 4)) + 1, 'The second year must follow the first');

export const createSessionSchema = z.object({ name: sessionName, startDate: date, endDate: date }).refine(range, rangeMsg);
export const updateSessionSchema = z.object({ name: sessionName.optional(), startDate: date.optional(), endDate: date.optional() }).refine(range, rangeMsg);

export const listTermsSchema = z.object({ sessionId: uuid.optional() });
export const createTermSchema = z.object({
  sessionId: uuid, termNumber: z.number().int().min(1).max(3), startDate: date, endDate: date,
}).refine(range, rangeMsg);
export const updateTermSchema = z.object({ startDate: date.optional(), endDate: date.optional() }).refine(range, rangeMsg);

const arm = z.string().trim().regex(/^[A-Za-z0-9 ]{1,10}$/, 'Use up to 10 letters or numbers').optional().nullable();
export const createClassSchema = z.object({ stage: z.enum(['JSS', 'SSS']), year: z.number().int().min(1).max(3), arm });
export const updateClassSchema = z.object({ arm });

export const createSubjectSchema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(1).max(20).optional() });
export const updateSubjectSchema = createSubjectSchema.partial();
export const classSubjectsSchema = z.object({ subjectIds: z.array(uuid).max(60) });

export const createAssignmentSchema = z.object({ sessionId: uuid, classId: uuid, subjectId: uuid, teacherId: uuid });
export const listAssignmentsSchema = z.object({ sessionId: uuid.optional(), classId: uuid.optional(), teacherId: uuid.optional() });

export const enrolSchema = z.object({ studentId: uuid, classId: uuid, sessionId: uuid });
export const enrolmentStatusSchema = z.object({ status: z.enum(['active', 'withdrawn', 'graduated']) });
export const listEnrolmentsSchema = z.object({ sessionId: uuid.optional(), classId: uuid.optional() });
