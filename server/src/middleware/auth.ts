import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { query } from '../db/pool';
import { AppError } from '../utils/AppError';
import type { Role } from '../modules/users/roles';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Please sign in to continue', 'UNAUTHENTICATED');

  let sub: string;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    sub = payload.sub;
  } catch {
    throw new AppError(401, 'Your session has expired', 'TOKEN_INVALID');
  }

  // Checked against the database each request so suspensions and role changes apply immediately.
  const { rows } = await query<{ id: string; role: Role; status: string }>(
    'select id, role, status from users where id = $1', [sub]);
  const user = rows[0];
  if (!user || user.status !== 'active') throw new AppError(401, 'Your session has expired', 'TOKEN_INVALID');

  req.user = { id: user.id, role: user.role };
  next();
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) throw new AppError(401, 'Please sign in to continue', 'UNAUTHENTICATED');
  if (!roles.includes(req.user.role)) throw new AppError(403, 'You do not have permission to do that', 'FORBIDDEN');
  next();
};
