// Dates in notification text are written for Nigerian readers, in Lagos time.
export const fmtLagos = (d: Date | string) =>
  new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
