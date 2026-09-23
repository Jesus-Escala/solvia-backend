import { env } from '../config/env';
import { formatPeriod, isLastDayOfMonth, todayInTimezone } from '../lib/dates';
import { logger } from '../lib/logger';
import { monthlyReportService } from '../services/monthlyReport.service';
import { runForEachTenant } from './tenantJobRunner';

/**
 * Daily job that only acts on the last day of the month (cron has no portable "last day"
 * syntax), generating each tenant's monthly summary for the dashboard.
 */
export async function runMonthlyReportJob(now = new Date(), { force = false } = {}) {
  const today = todayInTimezone(env.APP_TIMEZONE, now);
  if (!force && !isLastDayOfMonth(today)) {
    logger.debug('[monthly-report] Not the last day of the month; skipping');
    return [];
  }

  const results = await runForEachTenant('monthly-report', () =>
    monthlyReportService.generateForCurrentTenant(today),
  );
  logger.info(
    `[monthly-report] Generated ${formatPeriod(today)} report for ${results.length} tenant(s)`,
  );
  return results;
}
