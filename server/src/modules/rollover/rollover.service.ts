import { query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
type Ctx = { actorId: string; ip?: string };
export interface RolloverOptions {
  fromSessionId: string; toSessionId: string;
  classMap?: Record<string, string | 'graduate'>; // fromClassId -> toClassId or 'graduate'
  repeatStudentIds?: string[];   // stay in the same class
  excludeStudentIds?: string[];  // not carried (left school, transferred, ...)
  createMissingClasses?: boolean;
  carryFormTeachers?: boolean; carryTeachingAssignments?: boolean; carryTimetable?: boolean;
}
interface Cls { id: string; stage: 'JSS' | 'SSS'; year: number; arm: string | null; name: string }
const label = (c: { stage: string; year: number; arm: string | null }) => `${c.stage} ${c.year}${c.arm ?? ''}`;

// JSS 1 -> 2 -> 3 -> SSS 1 -> 2 -> 3 -> graduate. The arm is kept when the next class has the same one.
function nextOf(c: { stage: string; year: number; arm: string | null }): { stage: 'JSS' | 'SSS'; year: number; arm: string | null } | 'graduate' {
  if (c.year < 3) return { stage: c.stage as 'JSS' | 'SSS', year: c.year + 1, arm: c.arm };
  if (c.stage === 'JSS') return { stage: 'SSS', year: 1, arm: c.arm };
  return 'graduate';
}

async function plan(db: Queryable, o: RolloverOptions) {
  const ses = (await db.query('select id, name, start_date from academic_sessions where id = any($1::uuid[])', [[o.fromSessionId, o.toSessionId]])).rows;
  const from = ses.find((s) => s.id === o.fromSessionId); const to = ses.find((s) => s.id === o.toSessionId);
  if (!from || !to) throw new AppError(404, 'Session not found', 'NOT_FOUND');
  if (from.id === to.id) throw new AppError(400, 'Choose two different sessions.', 'VALIDATION_ERROR');
  if (to.start_date <= from.start_date) throw new AppError(400, 'The new session must start after the session you are promoting from.', 'VALIDATION_ERROR');

  const classes: Cls[] = (await db.query(`select c.id, c.stage, c.year, c.arm, ${CLASS_NAME} as name from classes c`)).rows;
  const byId = new Map(classes.map((c) => [c.id, c]));
  const find = (t: { stage: string; year: number; arm: string | null }) => classes.find((c) => c.stage === t.stage && c.year === t.year && (c.arm ?? '') === (t.arm ?? ''));

  const enrol = (await db.query(
    `select e.id, e.student_id, e.class_id, u.first_name, u.last_name, sp.admission_number,
            exists (select 1 from enrolments x where x.student_id = e.student_id and x.session_id = $2) as already
       from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
      where e.session_id = $1 and e.status = 'active' order by u.last_name, u.first_name`, [o.fromSessionId, o.toSessionId])).rows;

  const repeat = new Set(o.repeatStudentIds ?? []); const exclude = new Set(o.excludeStudentIds ?? []);
  const groups = new Map<string, typeof enrol>();
  for (const e of enrol) groups.set(e.class_id, [...(groups.get(e.class_id) ?? []), e]);

  const toCreate = new Map<string, { stage: 'JSS' | 'SSS'; year: number; arm: string | null; name: string }>();
  const rows = [...groups.entries()].map(([classId, students]) => {
    const src = byId.get(classId)!;
    const chosen = o.classMap?.[classId];
    let target: { type: 'class'; id: string | null; name: string } | { type: 'graduate' } | null = null;
    let source: 'chosen' | 'default' = chosen ? 'chosen' : 'default';
    if (chosen === 'graduate') target = { type: 'graduate' };
    else if (chosen) {
      const t = byId.get(chosen); if (!t) throw new AppError(400, 'One of the chosen classes does not exist.', 'VALIDATION_ERROR');
      target = { type: 'class', id: t.id, name: t.name };
    } else {
      const n = nextOf(src);
      if (n === 'graduate') target = { type: 'graduate' };
      else {
        const t = find(n);
        if (t) target = { type: 'class', id: t.id, name: t.name };
        else if (o.createMissingClasses) { toCreate.set(`${n.stage}|${n.year}|${n.arm ?? ''}`, { ...n, name: label(n) }); target = { type: 'class', id: null, name: label(n) }; }
      }
    }
    return { fromClassId: classId, fromClassName: src.name, source, target, students };
  }).sort((a, b) => a.fromClassName.localeCompare(b.fromClassName, 'en', { numeric: true }));

  // Per-student outcome. Repeaters stay in their own class; excluded and already-placed students are left alone.
  const moves: { studentId: string; enrolmentId: string; fromClassId: string; outcome: 'promote' | 'repeat' | 'graduate' | 'skip-excluded' | 'skip-already'; toClassId: string | null; toClassName: string | null }[] = [];
  for (const r of rows) for (const s of r.students) {
    if (s.already) { moves.push({ studentId: s.student_id, enrolmentId: s.id, fromClassId: r.fromClassId, outcome: 'skip-already', toClassId: null, toClassName: null }); continue; }
    if (exclude.has(s.student_id)) { moves.push({ studentId: s.student_id, enrolmentId: s.id, fromClassId: r.fromClassId, outcome: 'skip-excluded', toClassId: null, toClassName: null }); continue; }
    if (repeat.has(s.student_id)) { moves.push({ studentId: s.student_id, enrolmentId: s.id, fromClassId: r.fromClassId, outcome: 'repeat', toClassId: r.fromClassId, toClassName: r.fromClassName }); continue; }
    if (r.target?.type === 'graduate') moves.push({ studentId: s.student_id, enrolmentId: s.id, fromClassId: r.fromClassId, outcome: 'graduate', toClassId: null, toClassName: null });
    else moves.push({ studentId: s.student_id, enrolmentId: s.id, fromClassId: r.fromClassId, outcome: 'promote', toClassId: r.target?.type === 'class' ? r.target.id : null, toClassName: r.target?.type === 'class' ? r.target.name : null });
  }
  const unresolved = rows.filter((r) => !r.target && r.students.some((s) => !s.already && !exclude.has(s.student_id) && !repeat.has(s.student_id)));
  const blockers = unresolved.map((r) => `${r.fromClassName} has no next class. Choose one, or let the system create the missing classes.`);
  return { from, to, rows, moves, toCreate: [...toCreate.values()], blockers, repeat, exclude };
}

export async function preview(o: RolloverOptions) {
  const p = await plan({ query } as Queryable, o);
  const done = (await query('select 1 from session_rollovers where from_session_id = $1 and to_session_id = $2', [o.fromSessionId, o.toSessionId])).rowCount;
  const count = (k: string) => p.moves.filter((m) => m.outcome === k).length;
  return {
    fromSession: p.from.name, toSession: p.to.name, alreadyDone: !!done,
    totals: { promote: count('promote'), repeat: count('repeat'), graduate: count('graduate'), excluded: count('skip-excluded'), alreadyPlaced: count('skip-already') },
    classes: p.rows.map((r) => ({
      fromClassId: r.fromClassId, fromClassName: r.fromClassName, source: r.source,
      target: r.target ? (r.target.type === 'graduate' ? { graduate: true, classId: null, className: 'Graduate' } : { graduate: false, classId: r.target.id, className: r.target.name, willBeCreated: r.target.id === null }) : null,
      students: r.students.map((s) => ({
        studentId: s.student_id, name: `${s.first_name} ${s.last_name}`, admissionNumber: s.admission_number,
        outcome: p.moves.find((m) => m.studentId === s.student_id)!.outcome,
      })),
    })),
    classesToCreate: p.toCreate.map((c) => c.name), blockers: p.blockers, canRun: !done && !p.blockers.length,
  };
}

export async function execute(o: RolloverOptions, ctx: Ctx) {
  return withTransaction(async (c) => {
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [`rollover:${o.toSessionId}`]);
    if ((await c.query('select 1 from session_rollovers where from_session_id = $1 and to_session_id = $2', [o.fromSessionId, o.toSessionId])).rowCount) {
      throw new AppError(409, 'This promotion has already been done. Students added since can be placed under Students and classes.', 'ALREADY_DONE');
    }
    const p = await plan(c, o);
    if (p.blockers.length) throw new AppError(409, p.blockers[0], 'BLOCKED', p.blockers);

    const created = new Map<string, string>();
    for (const t of p.toCreate) {
      const r = await c.query('insert into classes (stage, year, arm) values ($1,$2,$3) returning id', [t.stage, t.year, t.arm]);
      created.set(t.name, r.rows[0].id);
    }
    const summary = { promoted: 0, repeated: 0, graduated: 0, excluded: 0, alreadyPlaced: 0, classesCreated: [...created.keys()], formTeachersCarried: 0, assignmentsCarried: 0, timetableSlotsCarried: 0, skippedTeachers: [] as string[] };
    for (const m of p.moves) {
      if (m.outcome === 'skip-excluded') { summary.excluded++; continue; }
      if (m.outcome === 'skip-already') { summary.alreadyPlaced++; continue; }
      if (m.outcome === 'graduate') {
        await c.query("update enrolments set status = 'graduated' where id = $1", [m.enrolmentId]); summary.graduated++; continue;
      }
      const toClass = m.toClassId ?? created.get(m.toClassName ?? '');
      if (!toClass) throw new AppError(500, 'A target class could not be resolved', 'INTERNAL');
      await c.query('insert into enrolments (student_id, class_id, session_id) values ($1,$2,$3)', [m.studentId, toClass, o.toSessionId]);
      if (m.outcome === 'repeat') summary.repeated++; else summary.promoted++;
    }

    // Form teachers and teaching assignments follow the class (JSS 1A has a form teacher again next session), not the pupils.
    if (o.carryFormTeachers ?? true) {
      const r = await c.query(
        `insert into class_form_teachers (class_id, session_id, teacher_id)
         select f.class_id, $2, f.teacher_id from class_form_teachers f join users u on u.id = f.teacher_id and u.status = 'active'
          where f.session_id = $1 on conflict do nothing`, [o.fromSessionId, o.toSessionId]);
      summary.formTeachersCarried = r.rowCount ?? 0;
    }
    if (o.carryTeachingAssignments ?? true) {
      const r = await c.query(
        `insert into teaching_assignments (session_id, class_id, subject_id, teacher_id)
         select $2, ta.class_id, ta.subject_id, ta.teacher_id from teaching_assignments ta join users u on u.id = ta.teacher_id and u.status = 'active'
          where ta.session_id = $1 on conflict do nothing`, [o.fromSessionId, o.toSessionId]);
      summary.assignmentsCarried = r.rowCount ?? 0;
      const skipped = await c.query(
        `select distinct u.first_name || ' ' || u.last_name as n from teaching_assignments ta join users u on u.id = ta.teacher_id
          where ta.session_id = $1 and u.status <> 'active'`, [o.fromSessionId]);
      summary.skippedTeachers = skipped.rows.map((x) => x.n);
    }
    if (o.carryTimetable) {
      const r = await c.query(
        `insert into timetable_entries (session_id, class_id, subject_id, day_of_week, start_time, end_time, room)
         select $2, class_id, subject_id, day_of_week, start_time, end_time, room from timetable_entries t
          where session_id = $1 and not exists (select 1 from timetable_entries n where n.session_id = $2)`, [o.fromSessionId, o.toSessionId]);
      summary.timetableSlotsCarried = r.rowCount ?? 0;
    }
    await c.query('insert into session_rollovers (from_session_id, to_session_id, executed_by, summary) values ($1,$2,$3,$4)', [o.fromSessionId, o.toSessionId, ctx.actorId, JSON.stringify(summary)]);
    await audit({ actorId: ctx.actorId, action: 'session.rollover', entityType: 'session', entityId: o.toSessionId, metadata: { from: o.fromSessionId, ...summary }, ip: ctx.ip }, c);
    return summary;
  });
}
