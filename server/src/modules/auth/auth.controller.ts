import type { Request, RequestHandler, Response } from 'express';
import { env, isProd } from '../../config/env';
import { ok } from '../../utils/respond';
import * as auth from './auth.service';

const COOKIE = 'kok_refresh';
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

// Frontend (Vercel) and API (Render) are different sites in production, so the cookie must be SameSite=None.
const cookieBase = { httpOnly: true, secure: isProd, sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax', path: '/api/auth' };
const setRefreshCookie = (res: Response, raw: string, expiresAt: Date) =>
  res.cookie(COOKIE, raw, { ...cookieBase, expires: expiresAt, maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 });

export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.validated.body;
  const s = await auth.login(email, password, meta(req));
  setRefreshCookie(res, s.refresh.raw, s.refresh.expiresAt);
  ok(res, { user: s.user, accessToken: s.accessToken });
};

export const refresh: RequestHandler = async (req, res) => {
  const s = await auth.refresh(req.cookies?.[COOKIE], meta(req));
  setRefreshCookie(res, s.refresh.raw, s.refresh.expiresAt);
  ok(res, { user: s.user, accessToken: s.accessToken });
};

export const logout: RequestHandler = async (req, res) => {
  await auth.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, cookieBase);
  ok(res, { loggedOut: true });
};

export const me: RequestHandler = async (req, res) => ok(res, { user: await auth.getMe(req.user!.id) });

export const activate: RequestHandler = async (req, res) => {
  await auth.activate(req.validated.body.token, req.validated.body.password, meta(req));
  ok(res, { activated: true });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await auth.forgotPassword(req.validated.body.email, meta(req));
  ok(res, { message: 'If that email belongs to an account, a reset link has been prepared.' });
};

export const resetPassword: RequestHandler = async (req, res) => {
  await auth.resetPassword(req.validated.body.token, req.validated.body.password, meta(req));
  ok(res, { reset: true });
};
