// Scheduled cleanup. Dry run by default.
//   npx tsx src/scripts/retention.ts            show what would be removed
//   npx tsx src/scripts/retention.ts --apply    remove it
// On Render: add a Cron Job running `npx tsx src/scripts/retention.ts --apply` once a day (for example 02:00).
import { preview, run } from '../modules/dataprotection/retention.service';
(async () => {
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify(apply ? await run() : await preview(), null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
