import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as s from './pdf.service';

const r = Router();
const who = [authenticate, requireRole('admin', 'parent')];
const id = z.object({ id: z.string().uuid() });

// Lookups and the access check run first, so any error comes back as normal JSON. Only then is the PDF streamed.
const send = (prepare: (viewer: { id: string; role: string }, id: string) => Promise<{ filename: string; render: (out: any) => void }>) => async (req: any, res: any) => {
  const { filename, render } = await prepare({ id: req.user.id, role: req.user.role }, req.validated.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  render(res);
};
r.get('/invoices/:id', ...who, validate({ params: id }), send(s.prepareStatement));
r.get('/receipts/:id', ...who, validate({ params: id }), send(s.prepareReceipt));
export default r;
