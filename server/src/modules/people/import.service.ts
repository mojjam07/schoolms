import { pool, query, withTransaction } from "../../db/pool";
import { AppError } from "../../utils/AppError";
import { audit } from "../../services/audit";
import { sendMail } from "../../services/mailer";
import { activationLink, createOneTimeToken } from "../auth/auth.service";
import { parseCsv } from "../../utils/csv";

const MAX_ROWS = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string> = {
  firstname: "firstName",
  lastname: "lastName",
  surname: "lastName",
  email: "email",
  emailaddress: "email",
  admissionnumber: "admissionNumber",
  admissionno: "admissionNumber",
  phone: "phone",
  phonenumber: "phone",
  dateofbirth: "dateOfBirth",
  dob: "dateOfBirth",
  class: "class",
  classname: "class",
};
const REQUIRED = ["firstName", "lastName", "email", "admissionNumber"];
export const TEMPLATE =
  "firstName,lastName,email,admissionNumber,phone,dateOfBirth,class\nAda,Okafor,ada.okafor@example.com,KOK/2026/001,08012345678,2013-05-21,JSS 1A\n";

export interface RowError {
  row: number;
  field: string;
  message: string;
}
interface Clean {
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  admissionNumber: string;
  phone: string | null;
  dateOfBirth: string | null;
  classId: string | null;
}

async function analyse(csv: string) {
  const grid = parseCsv(csv);
  if (!grid.length)
    throw new AppError(400, "The file is empty.", "VALIDATION_ERROR");
  const cols = grid[0].map((h) => ALIASES[norm(h)] ?? null);
  const missing = REQUIRED.filter((r) => !cols.includes(r));
  if (missing.length)
    throw new AppError(
      400,
      `The first row must be a header row that includes: ${missing.join(", ")}.`,
      "VALIDATION_ERROR",
    );
  const body = grid.slice(1);
  if (!body.length)
    throw new AppError(
      400,
      "The file has a header row but no students.",
      "VALIDATION_ERROR",
    );
  if (body.length > MAX_ROWS)
    throw new AppError(
      400,
      `A file can have at most ${MAX_ROWS} students. Split it and import in parts.`,
      "VALIDATION_ERROR",
    );

  const errors: RowError[] = [];
  const clean: Clean[] = [];
  const classes = (
    await query(
      "select id, upper(replace(stage::text || year::text || coalesce(arm, ''), ' ', '')) as k from classes",
    )
  ).rows as { id: string; k: string }[];
  const session = (
    await query("select id from academic_sessions where is_current")
  ).rows[0] as { id: string } | undefined;
  const emails = new Map<string, number>();
  const admissions = new Map<string, number>();

  body.forEach((cells, i) => {
    const row = i + 2; // the line number in the file, counting the header as line 1
    const v: Record<string, string> = {};
    cols.forEach((c, j) => {
      if (c) v[c] = (cells[j] ?? "").trim();
    });
    const err = (field: string, message: string) =>
      errors.push({ row, field, message });
    for (const f of REQUIRED) if (!v[f]) err(f, "Required");
    if (v.firstName && v.firstName.length > 80)
      err("firstName", "Longer than 80 characters");
    if (v.lastName && v.lastName.length > 80)
      err("lastName", "Longer than 80 characters");
    if (v.admissionNumber && v.admissionNumber.length > 40)
      err("admissionNumber", "Longer than 40 characters");
    if (v.phone && v.phone.length > 30)
      err("phone", "Longer than 30 characters");
    const email = (v.email ?? "").toLowerCase();
    if (email && !EMAIL.test(email)) err("email", "Not a valid email address");
    if (email) {
      if (emails.has(email))
        err("email", `Same email as line ${emails.get(email)}`);
      else emails.set(email, row);
    }
    if (v.admissionNumber) {
      const k = v.admissionNumber.toLowerCase();
      if (admissions.has(k))
        err(
          "admissionNumber",
          `Same admission number as line ${admissions.get(k)}`,
        );
      else admissions.set(k, row);
    }
    let dob: string | null = null;
    if (v.dateOfBirth) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(v.dateOfBirth) ||
        Number.isNaN(new Date(v.dateOfBirth).getTime())
      )
        err("dateOfBirth", "Use the format YYYY-MM-DD");
      else if (v.dateOfBirth > new Date().toISOString().slice(0, 10))
        err("dateOfBirth", "Cannot be in the future");
      else dob = v.dateOfBirth;
    }
    let classId: string | null = null;
    if (v.class) {
      const hit = classes.find(
        (c) => c.k === v.class.toUpperCase().replace(/\s+/g, ""),
      );
      if (!hit)
        err("class", `No class called "${v.class}". Use names such as JSS 1A.`);
      else if (!session)
        err(
          "class",
          "There is no current session to place the student in. Set one under Sessions and terms.",
        );
      else classId = hit.id;
    }
    clean.push({
      row,
      firstName: v.firstName,
      lastName: v.lastName,
      email,
      admissionNumber: v.admissionNumber,
      phone: v.phone || null,
      dateOfBirth: dob,
      classId,
    });
  });

  // Already in the database
  const takenE = (
    await query(
      "select email::text as e from users where email = any($1::citext[])",
      [[...emails.keys()]],
    )
  ).rows.map((r) => r.e.toLowerCase());
  const takenA = (
    await query(
      "select lower(admission_number) as a from student_profiles where lower(admission_number) = any($1::text[])",
      [[...admissions.keys()]],
    )
  ).rows.map((r) => r.a);
  for (const c of clean) {
    if (takenE.includes(c.email))
      errors.push({
        row: c.row,
        field: "email",
        message: "An account with this email already exists",
      });
    if (takenA.includes(c.admissionNumber.toLowerCase()))
      errors.push({
        row: c.row,
        field: "admissionNumber",
        message: "This admission number is already used",
      });
  }
  errors.sort((a, b) => a.row - b.row);
  return {
    clean,
    errors,
    sessionId: session?.id ?? null,
    total: body.length,
    badRows: new Set(errors.map((e) => e.row)).size,
  };
}

export async function importStudents(
  csv: string,
  dryRun: boolean,
  actorId: string,
  ip?: string,
) {
  const a = await analyse(csv);
  const summary = {
    dryRun,
    totalRows: a.total,
    validRows: a.total - a.badRows,
    errorRows: a.badRows,
    errors: a.errors.slice(0, 200),
    moreErrors: Math.max(0, a.errors.length - 200),
    canImport: a.errors.length === 0,
  };
  if (dryRun || a.errors.length)
    return { ...summary, imported: 0, emailsAccepted: 0 };

  // All or nothing: either every row is created, or none are, so a half-finished import never has to be untangled.
  let made: { id: string; c: Clean; token: string }[];
  try {
    made = await withTransaction(async (c) => {
      const out: { id: string; c: Clean; token: string }[] = [];
      for (const r of a.clean) {
        const u = await c.query(
          `insert into users (email, role, first_name, last_name, phone) values ($1,'student',$2,$3,$4) returning id`,
          [r.email, r.firstName, r.lastName, r.phone],
        );
        const id = u.rows[0].id as string;
        await c.query(
          "insert into student_profiles (user_id, admission_number, date_of_birth) values ($1,$2,$3)",
          [id, r.admissionNumber, r.dateOfBirth],
        );
        if (r.classId && a.sessionId)
          await c.query(
            "insert into enrolments (student_id, class_id, session_id) values ($1,$2,$3)",
            [id, r.classId, a.sessionId],
          );
        out.push({
          id,
          c: r,
          token: await createOneTimeToken(c, id, "activation", 72),
        });
      }
      await audit(
        {
          actorId,
          action: "students.imported",
          entityType: "student",
          metadata: { count: out.length },
          ip,
        },
        c,
      );
      return out;
    });
  } catch (e: any) {
    if (e?.code === "23505")
      throw new AppError(
        409,
        "Someone created one of these students while you were importing. Run the check again.",
        "DUPLICATE",
      );
    throw e;
  }
  let accepted = 0;
  for (const m of made) {
    const mail = await sendMail({
      to: m.c.email,
      subject: "Activate your [School Name] account",
      text: `Hello ${m.c.firstName},\n\nAn account has been created for you. Set your password within 72 hours:\n${activationLink(m.token)}`,
    });
    if (mail.accepted) accepted++;
  }
  return { ...summary, imported: made.length, emailsAccepted: accepted };
}
export { pool };
