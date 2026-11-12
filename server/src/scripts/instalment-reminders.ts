// Daily reminders for instalments that are due within 3 days or overdue. Dry run by default.
//   npx tsx src/scripts/instalment-reminders.ts            show what would be sent
//   npx tsx src/scripts/instalment-reminders.ts --apply    send in-app notifications (once per instalment and stage)
// On Render: add a Cron Job running `npx tsx src/scripts/instalment-reminders.ts --apply` every morning (for example 07:00).
import { sendReminders } from '../modules/instalments/instalments.service';
(async () => {
  console.log(JSON.stringify(await sendReminders(process.argv.includes('--apply')), null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
