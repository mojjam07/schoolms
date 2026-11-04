import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export const validate = (schemas: Schemas): RequestHandler => (req, _res, next) => {
  req.validated = {};
  for (const part of ['body', 'query', 'params'] as const) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new AppError(400, 'Please check the highlighted fields', 'VALIDATION_ERROR', details));
    }
    req.validated[part] = result.data;
  }
  next();
};
