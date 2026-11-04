import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const limitMessage = { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } };

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', legacyHeaders: false, message: limitMessage,
});

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20,
  standardHeaders: 'draft-7', legacyHeaders: false, message: limitMessage,
});

// Cookie-based endpoints (refresh/logout) only accept browser requests from our own frontend.
export const trustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== env.CLIENT_ORIGIN) throw new AppError(403, 'Request origin not allowed', 'BAD_ORIGIN');
  next();
};
