import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runMonthlyReportJob } from './monthlyReport.job';
import { runReminderJob } from './reminder.job';

const tasks: ScheduledTask[] = [];

function schedule(name: string, expression: string, job: () => Promise<unknown>) {
  if (!cron.validate(expression)) {
    throw new Error(`Invalid cron expression for ${name}: "${expression}"`);
  }
  const task = cron.schedule(
    expression,
    async () => {
      try {
        await job();
      } catch (error) {
        logger.error(`[${name}] Job failed`, error);
      }
    },
    { name, timezone: env.APP_TIMEZONE, noOverlap: true },
  );
  tasks.push(task);
  logger.info(`[scheduler] "${name}" scheduled with "${expression}" (${env.APP_TIMEZONE})`);
}

export function startScheduler() {
  if (!env.JOBS_ENABLED) {
    logger.info('[scheduler] Jobs are disabled (JOBS_ENABLED=false)');
    return;
  }
  schedule('reminders', env.REMINDER_CRON, () => runReminderJob());
  schedule('monthly-report', env.MONTHLY_REPORT_CRON, () => runMonthlyReportJob());
}

export async function stopScheduler() {
  await Promise.all(tasks.map((task) => task.stop()));
  tasks.length = 0;
}
