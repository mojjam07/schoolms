import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as c from './users.controller';
import { createUserSchema, idParam, listUsersSchema, statusSchema } from './users.schemas';

const r = Router();
r.use(authenticate, requireRole('admin'));
r.get('/', validate({ query: listUsersSchema }), c.list);
r.post('/', validate({ body: createUserSchema }), c.create);
r.patch('/:id/status', validate({ params: idParam, body: statusSchema }), c.updateStatus);
r.post('/:id/resend-activation', validate({ params: idParam }), c.resend);
export default r;
