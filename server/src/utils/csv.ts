// Small RFC 4180 reader and writer, so no extra dependency is needed.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const NUMBER = /^-?\d+(\.\d+)?$/;
// A cell that starts with = + - @ can run as a formula when opened in Excel, so text like that is prefixed with an apostrophe.
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// The byte-order mark makes Excel read UTF-8 names correctly.
export const toCsv = (rows: (string | number | null | undefined)[][]) => '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
export const nairaText = (kobo: number) => (kobo / 100).toFixed(2);
