import { ApiError } from './api';

export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details) {
    return Object.fromEntries(err.details.map((d) => [d.field, d.message]));
  }
  return {};
}

export const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
