import { z } from 'zod';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const when = z.string().datetime({ offset: true, message: 'Enter a valid date and time' });
const marks = z.number().min(0, 'Marks cannot be negative').max(9999.99);

export const idParam = z.object({ id: uuid });
export const studentParam = z.object({ id: uuid, studentId: uuid });

// Update schemas use fields WITHOUT defaults so an omitted field is left alone.
const fields = z.object({
  classId: uuid, subjectId: uuid,
  title: text(200).min(1, 'Enter a title'),
  description: text(5000), instructions: text(5000),
  maxMarks: z.number().positive('Maximum marks must be more than 0').max(9999.99),
  publishAt: when.nullable(), dueAt: when,
  allowResubmission: z.boolean(),
  status: z.enum(['draft', 'published', 'closed']),
  fileIds: z.array(uuid).max(10),
});
export const createAssignmentSchema = fields.extend({
  description: fields.shape.description.default(''), instructions: fields.shape.instructions.default(''),
  publishAt: fields.shape.publishAt.optional(), allowResubmission: fields.shape.allowResubmission.default(false),
  status: fields.shape.status.exclude(['closed']).default('draft'), fileIds: fields.shape.fileIds.default([]),
});
export const updateAssignmentSchema = fields.partial();

export const submitSchema = z.object({ textResponse: text(20000).default(''), fileIds: z.array(uuid).max(5).default([]) });
export const gradeSchema = z.object({ marks, feedback: text(5000).default(''), returnToStudent: z.boolean().default(false) });
