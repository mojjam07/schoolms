import { query } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

type Ctx = { actorId: string; ip?: string };
const row = (r: any) => ({ id: r.id, sessionId: r.session_id, name: r.name, kind: r.kind, maxScore: Number(r.max_score), sortOrder: r.sort_order, hasScores: r.has_scores ?? false });
const notFound = () => new AppError(404, 'Assessment column not found', 'NOT_FOUND');

export async function listComponents(sessionId: string) {
  const { rows } = await query(
    `select c.*, exists (select 1 from scores s where s.component_id = c.id) as has_scores from assessment_components c where c.session_id = $1 order by c.sort_order, c.name`, [sessionId]);
  return rows.map(row);
}

export async function createComponent(i: { sessionId: string; name: string; kind: string; maxScore: number }, ctx: Ctx) {
  const next = (await query('select coalesce(max(sort_order), 0) + 1 as n from assessment_components where session_id = $1', [i.sessionId])).rows[0].n;
  const { rows } = await query('insert into assessment_components (session_id, name, kind, max_score, sort_order) values ($1,$2,$3,$4,$5) returning *', [i.sessionId, i.name, i.kind, i.maxScore, next]);
  await audit({ actorId: ctx.actorId, action: 'assessment_component.created', entityType: 'assessment_component', entityId: rows[0].id, metadata: i, ip: ctx.ip });
  return row(rows[0]);
}

export async function updateComponent(id: string, i: { name?: string; maxScore?: number }, ctx: Ctx) {
  if (i.maxScore !== undefined) {
    const top = (await query('select max(score) as m from scores where component_id = $1', [id])).rows[0].m;
    if (top !== null && Number(top) > i.maxScore) throw new AppError(409, `A score of ${Number(top)} has already been entered, so the maximum cannot be lowered below that.`, 'IN_USE');
  }
  const { rows } = await query('update assessment_components set name = coalesce($2, name), max_score = coalesce($3, max_score) where id = $1 returning *', [id, i.name ?? null, i.maxScore ?? null]);
  if (!rows[0]) throw notFound();
  await audit({ actorId: ctx.actorId, action: 'assessment_component.updated', entityType: 'assessment_component', entityId: id, metadata: i, ip: ctx.ip });
  return row(rows[0]);
}

export async function deleteComponent(id: string, ctx: Ctx) {
  if ((await query('select 1 from scores where component_id = $1 limit 1', [id])).rowCount) throw new AppError(409, 'Scores have already been entered in this column, so it cannot be deleted.', 'IN_USE');
  const { rowCount } = await query('delete from assessment_components where id = $1', [id]);
  if (!rowCount) throw notFound();
  await audit({ actorId: ctx.actorId, action: 'assessment_component.deleted', entityType: 'assessment_component', entityId: id, ip: ctx.ip });
}

// A common starting layout (two tests and an exam, out of 100). Offered only when a session has no columns yet; every part is editable.
export async function applyTemplate(sessionId: string, ctx: Ctx) {
  if ((await query('select 1 from assessment_components where session_id = $1 limit 1', [sessionId])).rowCount) throw new AppError(409, 'This session already has assessment columns.', 'ALREADY_SET');
  await query(`insert into assessment_components (session_id, name, kind, max_score, sort_order) values ($1,'CA 1','ca',20,1), ($1,'CA 2','ca',20,2), ($1,'Exam','exam',60,3)`, [sessionId]);
  await audit({ actorId: ctx.actorId, action: 'assessment_component.template', entityType: 'session', entityId: sessionId, ip: ctx.ip });
  return listComponents(sessionId);
}
