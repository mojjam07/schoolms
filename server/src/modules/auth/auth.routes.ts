import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { loginLimiter, sensitiveLimiter, trustedOrigin } from '../../middleware/security';
import { validate } from '../../middleware/validate';
import * as c from './auth.controller';
import { activateSchema, forgotSchema, loginSchema, resetSchema } from './auth.schemas';

const r = Router();
r.post('/login', loginLimiter, validate({ body: loginSchema }), c.login);
r.post('/refresh', trustedOrigin, c.refresh);
r.post('/logout', trustedOrigin, c.logout);
r.get('/me', authenticate, c.me);
r.post('/activate', sensitiveLimiter, validate({ body: activateSchema }), c.activate);
r.post('/forgot-password', sensitiveLimiter, validate({ body: forgotSchema }), c.forgotPassword);
r.post('/reset-password', sensitiveLimiter, validate({ body: resetSchema }), c.resetPassword);
export default r;
