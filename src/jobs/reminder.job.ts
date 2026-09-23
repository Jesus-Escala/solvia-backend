import { logger } from '../lib/logger';
import { reminderService } from '../services/reminder.service';
import { runForEachTenant } from './tenantJobRunner';

/** Hourly job: evaluates every tenant's receivables and dispatches due reminders. */
export async function runReminderJob(now = new Date()) {
  const startedAt = Date.now();
  const results = await runForEachTenant('reminders', () =>
    reminderService.runForCurrentTenant(now),
  );

  const totals = results.reduce(
    (acc, { result }) => ({
      sent: acc.sent + (result?.sent ?? 0),
      failed: acc.failed + (result?.failed ?? 0),
      markedOverdue: acc.markedOverdue + (result?.markedOverdue ?? 0),
    }),
    { sent: 0, failed: 0, markedOverdue: 0 },
  );
  logger.info(
    `[reminders] ${results.length} tenant(s) processed in ${Date.now() - startedAt}ms: ` +
      `${totals.sent} sent, ${totals.failed} failed, ${totals.markedOverdue} marked overdue`,
  );
  return results;
}
