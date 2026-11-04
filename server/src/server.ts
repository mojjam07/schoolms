import { app } from './app';
import { env } from './config/env';
import { startReminderJob } from './modules/notifications/notifications.events';

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
  startReminderJob();
});
