import { diffInDays } from '../lib/dates';
import { outstandingAmount } from './receivableStatus';

export type ReminderType = 'pre_due_reminder' | 'due_reminder' | 'overdue_reminder';

export interface ReminderRules {
  enabled: boolean;
  /** Days before the due date to send the pre-due reminder (0 disables it). */
  daysBeforeDue: number;
  /** Send a reminder on the due date. */
  onDueDate: boolean;
  /** Repeat the overdue reminder every N days while unpaid (0 disables it). */
  overdueEveryDays: number;
}

export const DEFAULT_REMINDER_RULES: ReminderRules = {
  enabled: true,
  daysBeforeDue: 3,
  onDueDate: true,
  overdueEveryDays: 3,
};

export interface ReminderCandidate {
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
  /** Local calendar date of the last successful send for each reminder type. */
  lastSent: Partial<Record<ReminderType, Date | null>>;
}

export interface ReminderDecision {
  type: ReminderType;
  daysOverdue: number;
}

/**
 * Decides which reminder (if any) a receivable should receive today. The engine runs hourly, so
 * this function is idempotent: once a reminder has been sent for the current window it returns
 * null until the next window opens.
 *
 * - Pre-due: once, when the due date is between 1 and `daysBeforeDue` days away.
 * - Due date: once, on the due date.
 * - Overdue: every `overdueEveryDays` days after the due date while an amount is outstanding.
 */
export function determineReminder(
  candidate: ReminderCandidate,
  rules: ReminderRules,
  today: Date,
): ReminderDecision | null {
  if (!rules.enabled || outstandingAmount(candidate) <= 0) {
    return null;
  }

  const daysUntilDue = diffInDays(candidate.dueDate, today);
  const { lastSent } = candidate;

  if (daysUntilDue > 0) {
    if (rules.daysBeforeDue <= 0 || daysUntilDue > rules.daysBeforeDue) return null;
    const previous = lastSent.pre_due_reminder;
    // A pre-due reminder only counts if it was sent inside the current window (due date may change).
    const alreadySent =
      previous != null &&
      diffInDays(candidate.dueDate, previous) >= 1 &&
      diffInDays(candidate.dueDate, previous) <= rules.daysBeforeDue;
    return alreadySent ? null : { type: 'pre_due_reminder', daysOverdue: 0 };
  }

  if (daysUntilDue === 0) {
    if (!rules.onDueDate) return null;
    const previous = lastSent.due_reminder;
    const alreadySent = previous != null && diffInDays(candidate.dueDate, previous) === 0;
    return alreadySent ? null : { type: 'due_reminder', daysOverdue: 0 };
  }

  const daysOverdue = -daysUntilDue;
  if (rules.overdueEveryDays <= 0 || daysOverdue < rules.overdueEveryDays) return null;

  const previous = lastSent.overdue_reminder;
  const previousInWindow = previous != null && previous.getTime() > candidate.dueDate.getTime();
  if (previousInWindow && diffInDays(today, previous) < rules.overdueEveryDays) {
    return null;
  }
  return { type: 'overdue_reminder', daysOverdue };
}
