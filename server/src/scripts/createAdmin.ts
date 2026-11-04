import { pool } from '../db/pool';
import { createUser } from '../modules/users/users.service';

// Usage: npm run create-admin -- you@example.com FirstName LastName
async function main() {
  const [email, firstName, lastName] = process.argv.slice(2);
  if (!email || !firstName || !lastName) {
    console.error('Usage: npm run create-admin -- <email> <firstName> <lastName>');
    process.exitCode = 1;
    return;
  }
  const r = await createUser({ email: email.toLowerCase(), role: 'admin', firstName, lastName }, null);
  console.log(`Admin created: ${r.user.email}\nOpen this link within 72 hours to set the password:\n${r.activationLink}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => pool.end());
