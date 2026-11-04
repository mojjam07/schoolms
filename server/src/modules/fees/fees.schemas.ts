import { z } from 'zod';

const uuid = z.string().uuid();
const kobo = z.number().int('Amounts are whole kobo').positive('Enter an amount greater than zero').max(100_000_000_000, 'That amount is too large');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Give a short reason').max(300);

export const idParam = z.object({ id: uuid });
export const lineParams = z.object({ id: uuid });
export const receiptParam = z.object({ id: uuid });

export const createCategorySchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).default('') });
export const updateCategorySchema = z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(300).optional(), active: z.boolean().optional() });

export const scheduleQuery = z.object({ termId: uuid, classId: uuid });
export const setScheduleSchema = z.object({
  termId: uuid, classId: uuid,
  items: z.array(z.object({ categoryId: uuid, amountKobo: kobo })).max(30)
    .refine((a) => new Set(a.map((i) => i.categoryId)).size === a.length, 'Each fee category can appear only once'),
});

export const generateSchema = z.object({ termId: uuid, classId: uuid.optional(), dueDate: date.optional() });
export const listInvoicesSchema = z.object({
  termId: uuid.optional(), classId: uuid.optional(), q: z.string().trim().max(100).optional(),
  status: z.enum(['unpaid', 'part_paid', 'paid', 'cancelled', 'overdue']).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const addLineSchema = z.object({
  kind: z.enum(['charge', 'discount']), description: z.string().trim().min(2).max(200), amountKobo: kobo, reason,
});
export const dueDateSchema = z.object({ dueDate: date.nullable() });
export const cancelSchema = z.object({ reason });
export const paymentSchema = z.object({
  amountKobo: kobo, method: z.enum(['cash', 'bank_transfer', 'pos', 'other']),
  reference: z.string().trim().max(100).optional(), note: z.string().trim().max(300).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});
export const reverseSchema = z.object({ reason });
export const reportQuery = z.object({ termId: uuid });
export const remindersSchema = z.object({
  invoiceIds: z.array(uuid).min(1).max(500).optional(), termId: uuid.optional(), classId: uuid.optional(),
  message: z.string().trim().max(500).optional(),
}).refine((v) => v.invoiceIds || v.termId, { message: 'Choose invoices, or a term (and optionally a class)', path: ['termId'] });

export const payOnlineSchema = z.object({ amountKobo: kobo.optional() });
export const verifySchema = z.object({ reference: z.string().trim().min(5).max(120) });
export const onlineListQuery = z.object({
  status: z.enum(['pending', 'success', 'failed', 'abandoned']).optional(),
  needsReview: z.enum(['true', 'false']).default('false').transform((x) => x === 'true'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
