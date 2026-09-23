import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_RULES,
  determineReminder,
  type ReminderCandidate,
  type ReminderRules,
} from '../src/domain/reminderRules';
import { addDays, toDateOnly } from '../src/lib/dates';

const today = toDateOnly('2026-09-23');
const rules: ReminderRules = { ...DEFAULT_REMINDER_RULES }; // 3 days before, on due date, every 3 days

function candidate(dueIn: number, overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    totalAmount: 500,
    paidAmount: 0,
    dueDate: addDays(today, dueIn),
    lastSent: {},
    ...overrides,
  };
}

describe('determineReminder', () => {
  describe('pre-due reminders', () => {
    it('sends when the due date is within the configured window', () => {
      expect(determineReminder(candidate(3), rules, today)?.type).toBe('pre_due_reminder');
      expect(determineReminder(candidate(1), rules, today)?.type).toBe('pre_due_reminder');
    });

    it('does not send when the due date is further away', () => {
      expect(determineReminder(candidate(4), rules, today)).toBeNull();
    });

    it('sends only once per window', () => {
      const lastSent = { pre_due_reminder: addDays(today, -1) }; // sent yesterday, due in 2
      expect(determineReminder(candidate(2, { lastSent }), rules, today)).toBeNull();
    });

    it('sends again if the due date was moved after a previous reminder', () => {
      // Reminder sent 20 days ago for an older due date; the new due date is in 2 days.
      const lastSent = { pre_due_reminder: addDays(today, -20) };
      expect(determineReminder(candidate(2, { lastSent }), rules, today)?.type).toBe(
        'pre_due_reminder',
      );
    });

    it('can be disabled with daysBeforeDue = 0', () => {
      expect(determineReminder(candidate(2), { ...rules, daysBeforeDue: 0 }, today)).toBeNull();
    });
  });

  describe('due date reminders', () => {
    it('sends on the due date', () => {
      expect(determineReminder(candidate(0), rules, today)).toEqual({
        type: 'due_reminder',
        daysOverdue: 0,
      });
    });

    it('does not repeat on the same day', () => {
      expect(
        determineReminder(candidate(0, { lastSent: { due_reminder: today } }), rules, today),
      ).toBeNull();
    });

    it('respects onDueDate = false', () => {
      expect(determineReminder(candidate(0), { ...rules, onDueDate: false }, today)).toBeNull();
    });
  });

  describe('overdue reminders', () => {
    it('waits until the first interval has elapsed', () => {
      expect(determineReminder(candidate(-1), rules, today)).toBeNull();
      expect(determineReminder(candidate(-2), rules, today)).toBeNull();
      expect(determineReminder(candidate(-3), rules, today)).toEqual({
        type: 'overdue_reminder',
        daysOverdue: 3,
      });
    });

    it('repeats every N days while unpaid', () => {
      const sentTwoDaysAgo = { overdue_reminder: addDays(today, -2) };
      const sentThreeDaysAgo = { overdue_reminder: addDays(today, -3) };
      expect(
        determineReminder(candidate(-5, { lastSent: sentTwoDaysAgo }), rules, today),
      ).toBeNull();
      expect(
        determineReminder(candidate(-6, { lastSent: sentThreeDaysAgo }), rules, today)?.type,
      ).toBe('overdue_reminder');
    });

    it('catches up if the job missed the exact day', () => {
      // No previous overdue reminder and 10 days late: send now instead of waiting for day 12.
      expect(determineReminder(candidate(-10), rules, today)?.daysOverdue).toBe(10);
    });

    it('ignores overdue reminders sent before the current due date', () => {
      const lastSent = { overdue_reminder: addDays(today, -30) };
      expect(determineReminder(candidate(-4, { lastSent }), rules, today)?.type).toBe(
        'overdue_reminder',
      );
    });

    it('can be disabled with overdueEveryDays = 0', () => {
      expect(determineReminder(candidate(-9), { ...rules, overdueEveryDays: 0 }, today)).toBeNull();
    });
  });

  it('never reminds about fully paid receivables', () => {
    for (const dueIn of [2, 0, -3, -9]) {
      expect(determineReminder(candidate(dueIn, { paidAmount: 500 }), rules, today)).toBeNull();
    }
  });

  it('still reminds about partially paid receivables', () => {
    expect(determineReminder(candidate(0, { paidAmount: 200 }), rules, today)?.type).toBe(
      'due_reminder',
    );
  });

  it('sends nothing when reminders are disabled', () => {
    expect(determineReminder(candidate(0), { ...rules, enabled: false }, today)).toBeNull();
  });
});
