import { z } from 'zod';

const uuid = z.string().uuid();
const score = z.number().min(0).max(9999.99);

export const idParam = z.object({ id: uuid });
export const termClassQuery = z.object({ termId: uuid, classId: uuid });
export const termQuery = z.object({ termId: uuid });
export const sessionQuery = z.object({ sessionId: uuid });
export const sheetQuery = z.object({ termId: uuid, classId: uuid, subjectId: uuid });
export const reportQuery = z.object({ termId: uuid, studentId: uuid });
export const termParam = z.object({ termId: uuid });
export const childTermParam = z.object({ studentId: uuid, termId: uuid });
export const childParam = z.object({ studentId: uuid });

export const bandsSchema = z.object({ bands: z.array(z.object({
  minPercent: z.number().min(0).max(100), grade: z.string().trim().min(1, 'Enter a grade').max(10), remark: z.string().trim().max(40).default(''),
})).min(1).max(20) });

export const createComponentSchema = z.object({ sessionId: uuid, name: z.string().trim().min(1, 'Enter a name').max(40), kind: z.enum(['ca', 'exam']), maxScore: z.number().positive('Must be more than 0').max(1000) });
export const updateComponentSchema = z.object({ name: z.string().trim().min(1).max(40).optional(), maxScore: z.number().positive().max(1000).optional() });
export const templateSchema = z.object({ sessionId: uuid });

export const saveSheetSchema = z.object({
  termId: uuid, classId: uuid, subjectId: uuid,
  entries: z.array(z.object({ studentId: uuid, componentId: uuid, score: score.nullable() })).min(1).max(3000),
});
export const publishSchema = z.object({ termId: uuid, classId: uuid, allowIncomplete: z.boolean().default(false) });
export const remarkSchema = z.object({ termId: uuid, studentId: uuid, remark: z.string().trim().max(500) });
