import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/AppError';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'That file is larger than 10 MB. Please choose a smaller file.' } });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ success: false, error: { code: 'BAD_UPLOAD', message: 'The upload could not be read. Send one file in the "file" field.' } });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
  }
  if (err?.code === '23503') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_REFERENCE', message: 'One of the selected items does not exist, or this combination is not allowed' } });
  }
  console.error(err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};
