#!/usr/bin/env node
// Builds the table of every environment variable the project reads, straight from the code, so it can never be out of date.
//   node tools/env-table.mjs > docs/ENVIRONMENT.md          (run from the repository root)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['server/src', 'server/tests', 'client/src', 'e2e'].filter(existsSync);
const examples = ['.env.example', 'server/.env.example', 'client/.env.example'].filter(existsSync);
const vars = new Map(); // name -> { files:Set, defaults:Set, example:Set }
const get = (n) => { if (!vars.has(n)) vars.set(n, { files: new Set(), defaults: new Set(), example: new Set() }); return vars.get(n); };

function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = join(dir, f); const s = statSync(p);
    if (s.isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs|py)$/.test(f)) scan(p);
  }
}
function scan(p) {
  const t = readFileSync(p, 'utf8'); const rel = relative('.', p);
  for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)(?:\s*(?:\|\||\?\?)\s*('[^']*'|"[^"]*"|`[^`]*`|\d+))?/g)) { const v = get(m[1]); v.files.add(rel); if (m[2]) v.defaults.add(m[2]); }
  for (const m of t.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) get(m[1]).files.add(rel);
  for (const m of t.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g)) get(m[1]).files.add(rel);
  // helpers that take the name as a string, such as days('RETENTION_TOKEN_DAYS', 30)
  for (const m of t.matchAll(/\b[a-zA-Z]+\(\s*'([A-Z][A-Z0-9_]{3,})'\s*,\s*([^)]+)\)/g)) if (/^(RETENTION|SCHOOL|PAYSTACK|SUPABASE|JWT|SMTP|RESEND|VITE)_/.test(m[1])) { const v = get(m[1]); v.files.add(rel); v.defaults.add(m[2].trim()); }
}
roots.forEach(walk);
for (const e of examples) for (const line of readFileSync(e, 'utf8').split('\n')) { const m = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]+)\s*=/); if (m) get(m[1]).example.add(e); }

const side = (v) => { const f = [...v.files]; const s = f.some((x) => x.startsWith('server')), c = f.some((x) => x.startsWith('client')); return s && c ? 'both' : c ? 'client (build time)' : s ? 'server' : 'other'; };
const rows = [...vars.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log('# Environment variables\n\nGenerated from the code by `tools/env-table.mjs`. Run it again after any change.\n');
console.log('| Variable | Where | Default in code | In an .env.example | Used in |\n|---|---|---|---|---|');
for (const [n, v] of rows) console.log(`| \`${n}\` | ${side(v)} | ${[...v.defaults].map((d) => `\`${d}\``).join(', ') || 'none (required if the feature is used)'} | ${v.example.size ? 'yes' : '**no**'} | ${[...v.files].slice(0, 3).join(', ')}${v.files.size > 3 ? ', …' : ''} |`);
const missing = rows.filter(([, v]) => !v.example.size && [...v.files].some((f) => !f.startsWith('server/tests') && !f.startsWith('e2e')));
console.log(`\n${missing.length} variable(s) are read by the application but are not listed in any .env.example. Add them there so a new developer can see them.`);
console.log('\nNever commit real values. Keep secrets (database URL, JWT secrets, Paystack secret key, Resend key, Supabase service key) in the host\'s environment settings.');
