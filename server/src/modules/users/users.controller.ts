import type { RequestHandler } from 'express';
import { isProd } from '../../config/env';
import { ok } from '../../utils/respond';
import * as users from './users.service';

export const create: RequestHandler = async (req, res) => {
  const r = await users.createUser(req.validated.body, req.user!.id, req.ip);
  // The link is only echoed outside production, because no email provider is configured yet.
  ok(res, { user: r.user, emailAccepted: r.emailAccepted, ...(isProd ? {} : { activationLink: r.activationLink }) }, 201);
};

export const list: RequestHandler = async (req, res) => ok(res, await users.listUsers(req.validated.query));

export const updateStatus: RequestHandler = async (req, res) =>
  ok(res, { user: await users.setStatus(req.validated.params.id, req.validated.body.status, req.user!.id, req.ip) });

export const resend: RequestHandler = async (req, res) => {
  const r = await users.resendActivation(req.validated.params.id, req.user!.id, req.ip);
  ok(res, { emailAccepted: r.emailAccepted, ...(isProd ? {} : { activationLink: r.activationLink }) });
};

export const detail: RequestHandler = async (req, res) => ok(res, await users.getUserDetail(req.validated.params.id));
export const update: RequestHandler = async (req, res) => {
  const r = await users.updateUser(req.validated.params.id, req.validated.body, req.user!.id, req.ip);
  ok(res, { user: r.user, ...(r.activation ? { emailAccepted: r.activation.emailAccepted, ...(isProd ? {} : { activationLink: r.activation.activationLink }) } : {}) });
};
