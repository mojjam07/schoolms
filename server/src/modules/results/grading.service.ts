import { query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

export interface Band { minPercent: number; grade: string; remark: string }
type Ctx = { actorId: string; ip?: string };

// The widely used WAEC-style scale, offered only as a starting point. The administrator can change every band.
export const WAEC_TEMPLATE: Band[] = [
  { minPercent: 75, grade: 'A1', remark: 'Excellent' }, { minPercent: 70, grade: 'B2', remark: 'Very good' }, { minPercent: 65, grade: 'B3', remark: 'Good' },
  { minPercent: 60, grade: 'C4', remark: 'Credit' }, { minPercent: 55, grade: 'C5', remark: 'Credit' }, { minPercent: 50, grade: 'C6', remark: 'Credit' },
  { minPercent: 45, grade: 'D7', remark: 'Pass' }, { minPercent: 40, grade: 'E8', remark: 'Pass' }, { minPercent: 0, grade: 'F9', remark: 'Fail' },
];

export async function getBands(db: Queryable = { query } as any): Promise<Band[]> {
  const { rows } = await db.query('select min_percent, grade, remark from grade_bands order by min_percent desc');
  return rows.map((r) => ({ minPercent: Number(r.min_percent), grade: r.grade, remark: r.remark }));
}

// A band is found by percentage, rounded to two decimals so that 74.999 does not slip into the band above.
export function gradeFor(bands: Band[], percent: number): { grade: string; remark: string } | null {
  const p = Math.round(percent * 100) / 100;
  const b = [...bands].sort((a, c) => c.minPercent - a.minPercent).find((x) => x.minPercent <= p);
  return b ? { grade: b.grade, remark: b.remark } : null;
}

export async function setBands(bands: Band[], ctx: Ctx) {
  if (!bands.length) throw new AppError(400, 'Add at least one grade band.', 'VALIDATION_ERROR');
  const mins = bands.map((b) => b.minPercent);
  if (new Set(mins).size !== mins.length) throw new AppError(400, 'Two bands start at the same percentage.', 'VALIDATION_ERROR');
  if (!mins.includes(0)) throw new AppError(400, 'One band must start at 0%, so every score has a grade.', 'VALIDATION_ERROR');
  await withTransaction(async (c) => {
    await c.query('delete from grade_bands');
    await c.query('insert into grade_bands (min_percent, grade, remark) select * from unnest($1::numeric[], $2::text[], $3::text[])', [mins, bands.map((b) => b.grade), bands.map((b) => b.remark)]);
    await audit({ actorId: ctx.actorId, action: 'grading.set', entityType: 'grading', metadata: { bands }, ip: ctx.ip }, c);
  });
  return getBands();
}

export const applyTemplate = (ctx: Ctx) => setBands(WAEC_TEMPLATE, ctx);
