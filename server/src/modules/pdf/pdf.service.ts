import PDFDocument from "pdfkit";
import type { Writable } from "stream";
import { query } from "../../db/pool";
import { AppError } from "../../utils/AppError";

// The school's details on printed documents. Set these in the server environment; the defaults are placeholders.
const SCHOOL = () => ({
  name: process.env.SCHOOL_NAME || "[School Name]",
  line1:
    process.env.SCHOOL_ADDRESS ||
    "13, Sunmonu Street, Mafoluku, Oshodi, Lagos, Nigeria",
  line2: [process.env.SCHOOL_PHONE, process.env.SCHOOL_EMAIL]
    .filter(Boolean)
    .join("  ·  "),
});

// "NGN" rather than the naira sign: the built-in PDF fonts do not contain that symbol and it would print as a wrong character.
const money = (kobo: number) =>
  `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const lagos = (d: Date | string, time = false) =>
  new Date(d).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
const METHOD: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  pos: "POS",
  paystack: "Paystack (online)",
  other: "Other",
};
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const notFound = () => new AppError(404, "Not found", "NOT_FOUND");

type Viewer = { id: string; role: string };

// Who may see an invoice and its receipts: administrators, and parents linked to the student. Everyone else gets a 404.
async function authorise(v: Viewer, studentId: string) {
  if (v.role === "admin") return;
  if (
    v.role === "parent" &&
    (
      await query(
        "select 1 from parent_students where parent_id = $1 and student_id = $2",
        [v.id, studentId],
      )
    ).rowCount
  )
    return;
  throw notFound();
}

async function invoiceFacts(invoiceId: string) {
  const i = (
    await query(
      `select i.id, i.number, i.status, i.cancel_reason, i.due_date, i.created_at, i.student_id, u.first_name, u.last_name, sp.admission_number,
            ${CLASS_NAME} as class_name, s.name as session_name, 'Term ' || t.term_number as term_name
       from invoices i join users u on u.id = i.student_id left join student_profiles sp on sp.user_id = u.id
       join classes c on c.id = i.class_id join terms t on t.id = i.term_id join academic_sessions s on s.id = t.session_id where i.id = $1`,
      [invoiceId],
    )
  ).rows[0];
  if (!i) throw notFound();
  const lines = (
    await query(
      "select kind, description, amount_kobo, reason from invoice_lines where invoice_id = $1 order by created_at, id",
      [invoiceId],
    )
  ).rows;
  const payments = (
    await query(
      `select id, receipt_number, amount_kobo, method, reference, paid_at, reversed_at from payments where invoice_id = $1 order by paid_at, id`,
      [invoiceId],
    )
  ).rows;
  let plan: { position: number; due_date: Date; amount_kobo: string }[] = [];
  try {
    plan = (
      await query(
        "select position, due_date, amount_kobo from invoice_instalments where invoice_id = $1 order by position",
        [invoiceId],
      )
    ).rows;
  } catch {
    /* instalment plans not installed */
  }
  const total = lines.reduce((n, l) => n + Number(l.amount_kobo), 0);
  const paid = payments
    .filter((p) => !p.reversed_at)
    .reduce((n, p) => n + Number(p.amount_kobo), 0);
  return {
    ...i,
    lines,
    payments,
    plan,
    total,
    paid,
    balance: Math.max(total - paid, 0),
  };
}

// ---------- drawing helpers ----------
const INK = "#1f2937",
  MUTED = "#6b7280",
  LINE = "#d1d5db",
  BRAND = "#1d4e89";
function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  const s = SCHOOL();
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(18).text(s.name, 50, 50);
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(s.line1);
  if (s.line2) doc.text(s.line2);
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(title, 50, 50, { align: "right" });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(10)
    .text(subtitle, { align: "right" });
  doc.moveTo(50, 105).lineTo(545, 105).strokeColor(LINE).stroke();
  doc.y = 120;
  doc.x = 50;
}
function pairs(doc: PDFKit.PDFDocument, rows: [string, string][]) {
  for (const [k, v] of rows) {
    const y = doc.y;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(k, 50, y, { width: 130 });
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(v, 185, y, { width: 360 });
    doc.y = Math.max(doc.y, y + 14);
  }
  doc.moveDown(0.5);
}
function table(
  doc: PDFKit.PDFDocument,
  cols: { label: string; width: number; align?: "left" | "right" }[],
  rows: string[][],
  opts: { boldLast?: boolean; muted?: boolean[] } = {},
) {
  const x0 = 50;
  let y = doc.y;
  const draw = (cells: string[], bold: boolean, color: string) => {
    let x = x0;
    let h = 0;
    cells.forEach((c, k) => {
      const hh = doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(10)
        .fillColor(color)
        .heightOfString(c, { width: cols[k].width - 8 });
      h = Math.max(h, hh);
    });
    if (y + h > 770) {
      doc.addPage();
      y = 50;
    }
    x = x0;
    cells.forEach((c, k) => {
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(10)
        .fillColor(color)
        .text(c, x, y, {
          width: cols[k].width - 8,
          align: cols[k].align ?? "left",
        });
      x += cols[k].width;
    });
    y += h + 6;
    doc
      .moveTo(x0, y - 2)
      .lineTo(545, y - 2)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
  };
  draw(
    cols.map((c) => c.label),
    true,
    MUTED,
  );
  rows.forEach((r, k) =>
    draw(
      r,
      !!opts.boldLast && k === rows.length - 1,
      opts.muted?.[k] ? MUTED : INK,
    ),
  );
  doc.y = y + 6;
  doc.x = 50;
}
function footer(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(text, 50, 790, { width: 495, align: "center" });
}

// ---------- the two documents ----------
export async function prepareStatement(viewer: Viewer, invoiceId: string) {
  const d = await invoiceFacts(invoiceId);
  await authorise(viewer, d.student_id);
  return {
    filename: `statement-${d.number}.pdf`,
    render: (out: Writable) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: { Title: `Fee statement ${d.number}`, Author: SCHOOL().name },
      });
      doc.pipe(out);
      header(
        doc,
        "Fee statement",
        `${d.number}  ·  ${lagos(new Date(), false)}`,
      );
      pairs(doc, [
        ["Student", `${d.first_name} ${d.last_name}`],
        ["Admission number", d.admission_number ?? "·"],
        ["Class", d.class_name],
        ["Term", `${d.session_name}, ${d.term_name}`],
        ["Pay by", d.due_date ? lagos(d.due_date) : "No deadline set"],
      ]);
      if (d.status === "cancelled")
        doc
          .fillColor("#b91c1c")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(
            `This invoice was cancelled${d.cancel_reason ? `: ${d.cancel_reason}` : ""}.`,
          )
          .moveDown(0.5);

      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("What is being charged");
      doc.moveDown(0.3);
      table(
        doc,
        [
          { label: "Item", width: 355 },
          { label: "Amount", width: 140, align: "right" },
        ],
        [
          ...d.lines.map((l) => [
            `${l.description}${l.kind === "discount" ? " (discount)" : l.kind === "charge" ? " (extra charge)" : ""}${l.reason ? `\n${l.reason}` : ""}`,
            `${Number(l.amount_kobo) < 0 ? "-" : ""}${money(Math.abs(Number(l.amount_kobo)))}`,
          ]),
          ["Total", money(d.total)],
        ],
        { boldLast: true },
      );

      doc
        .moveDown(0.5)
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Payments received");
      doc.moveDown(0.3);
      if (d.payments.length === 0)
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(10)
          .text("No payments recorded yet.");
      else
        table(
          doc,
          [
            { label: "Date", width: 100 },
            { label: "Receipt", width: 110 },
            { label: "How", width: 140 },
            { label: "Amount", width: 145, align: "right" },
          ],
          d.payments.map((p) => [
            lagos(p.paid_at),
            p.receipt_number,
            `${METHOD[p.method] ?? p.method}${p.reversed_at ? " (reversed)" : ""}`,
            money(Number(p.amount_kobo)),
          ]),
          { muted: d.payments.map((p) => !!p.reversed_at) },
        );

      doc.moveDown(0.5);
      pairs(doc, [
        ["Total charged", money(d.total)],
        ["Total paid", money(d.paid)],
        ["Balance to pay", money(d.balance)],
      ]);

      if (d.plan.length) {
        const planSum = d.plan.reduce((n, p) => n + Number(p.amount_kobo), 0);
        let left = d.paid;
        doc
          .moveDown(0.3)
          .fillColor(INK)
          .font("Helvetica-Bold")
          .fontSize(12)
          .text("Instalment plan");
        doc.moveDown(0.3);
        table(
          doc,
          [
            { label: "#", width: 40 },
            { label: "Due", width: 130 },
            { label: "Amount", width: 150, align: "right" },
            { label: "Status", width: 175, align: "right" },
          ],
          d.plan.map((p) => {
            const a = Number(p.amount_kobo);
            const paid = Math.min(left, a);
            left -= paid;
            const status =
              paid >= a
                ? "Paid"
                : new Date(p.due_date) < new Date(new Date().toDateString())
                  ? `Overdue, ${money(a - paid)} to pay`
                  : paid > 0
                    ? `Part paid, ${money(a - paid)} to pay`
                    : "Upcoming";
            return [String(p.position), lagos(p.due_date), money(a), status];
          }),
        );
        if (planSum !== d.total)
          doc
            .fillColor("#b91c1c")
            .font("Helvetica")
            .fontSize(9)
            .text(
              "The invoice total changed after this plan was made. The school will issue an updated plan.",
            );
      }
      footer(
        doc,
        `Generated ${lagos(new Date(), true)}. This statement is not a receipt. Keep your official receipts as proof of payment.`,
      );
      doc.end();
    },
  };
}

export async function prepareReceipt(viewer: Viewer, paymentId: string) {
  const p = (
    await query(
      `select p.id, p.receipt_number, p.amount_kobo, p.method, p.reference, p.note, p.paid_at, p.reversed_at, p.invoice_id, r.first_name as rf, r.last_name as rl
       from payments p left join users r on r.id = p.recorded_by where p.id = $1`,
      [paymentId],
    )
  ).rows[0];
  if (!p) throw notFound();
  const d = await invoiceFacts(p.invoice_id);
  await authorise(viewer, d.student_id);
  if (p.reversed_at)
    throw new AppError(
      409,
      "This payment was reversed, so there is no receipt for it.",
      "REVERSED",
    );
  return {
    filename: `receipt-${p.receipt_number}.pdf`,
    render: (out: Writable) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: { Title: `Receipt ${p.receipt_number}`, Author: SCHOOL().name },
      });
      doc.pipe(out);
      header(doc, "Official receipt", p.receipt_number);
      pairs(doc, [
        [
          "Received from",
          "Parent or guardian of " + `${d.first_name} ${d.last_name}`,
        ],
        [
          "Student",
          `${d.first_name} ${d.last_name}${d.admission_number ? `  (${d.admission_number})` : ""}`,
        ],
        ["Class", d.class_name],
        [
          "For",
          `School fees, ${d.session_name} ${d.term_name} (invoice ${d.number})`,
        ],
        ["Date paid", lagos(p.paid_at, true)],
        ["How paid", METHOD[p.method] ?? p.method],
        ...(p.reference
          ? [["Reference", p.reference] as [string, string]]
          : []),
        ...(p.note ? [["Note", p.note] as [string, string]] : []),
        ...(p.method !== "paystack" && p.rf
          ? [["Received by", `${p.rf} ${p.rl}`] as [string, string]]
          : []),
      ]);
      doc.moveDown(0.5);
      const y0 = doc.y;
      doc.rect(50, y0, 495, 54).fillColor("#f3f4f6").fill();
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text("Amount received", 64, y0 + 8);
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(money(Number(p.amount_kobo)), 64, y0 + 22);
      doc.y = y0 + 68;
      doc.x = 50;
      pairs(doc, [
        ["Invoice total", money(d.total)],
        ["Paid to date", money(d.paid)],
        ["Balance", money(d.balance)],
      ]);
      footer(
        doc,
        `Generated ${lagos(new Date(), true)}. Payments recorded by the school are never edited: a mistake is corrected by a reversal, which keeps the record.`,
      );
      doc.end();
    },
  };
}
