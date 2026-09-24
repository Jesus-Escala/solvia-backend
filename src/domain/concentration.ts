import { roundMoney } from '../lib/money';

/**
 * Pareto / ABC analysis of the debtors: how concentrated the open balance is.
 *
 * Debtors are ranked by open balance (largest first). A debtor belongs to class A while the
 * balance accumulated BEFORE it is under 80% of the total (so the debtor that crosses 80% is
 * still A), to B while it is under 95%, and to C otherwise. The classic reading: "x% of the
 * debtors owe 80% of the money".
 */

export type ConcentrationClass = 'A' | 'B' | 'C';

export const CONCENTRATION_CLASSES: ConcentrationClass[] = ['A', 'B', 'C'];
/** Cumulative share of the balance where class A ends and where class B ends. */
export const CLASS_THRESHOLDS = { A: 0.8, B: 0.95 } as const;
/** The curve is downsampled to at most this many segments (plus the origin). */
const CURVE_SEGMENTS = 100;

export interface DebtorBalance {
  customerId: string;
  name: string;
  outstanding: number;
  overdue: number;
  receivables: number;
}

export interface RankedDebtor extends DebtorBalance {
  rank: number;
  /** Share of the total open balance owed by this debtor (0–1). */
  share: number;
  /** Share owed by this debtor and every larger one (0–1). */
  cumulativeShare: number;
  class: ConcentrationClass;
}

export interface ClassSummary {
  key: ConcentrationClass;
  debtors: number;
  outstanding: number;
  /** Share of the open balance (0–1). */
  share: number;
  /** Share of the debtors (0–1). */
  debtorShare: number;
}

export interface CurvePoint {
  /** Share of the debtors, largest first (0–1). */
  debtorShare: number;
  /** Share of the open balance they owe (0–1). */
  debtShare: number;
}

const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole + Number.EPSILON) * 10_000) / 10_000 : 0;

function classOf(cumulativeBefore: number): ConcentrationClass {
  if (cumulativeBefore < CLASS_THRESHOLDS.A) return 'A';
  if (cumulativeBefore < CLASS_THRESHOLDS.B) return 'B';
  return 'C';
}

export function debtConcentration(balances: DebtorBalance[]) {
  const sorted = balances
    .filter((row) => row.outstanding > 0)
    .sort(
      (a, b) =>
        b.outstanding - a.outstanding ||
        a.name.localeCompare(b.name) ||
        a.customerId.localeCompare(b.customerId),
    );
  const total = sorted.reduce((sum, row) => sum + row.outstanding, 0);
  const count = sorted.length;

  let running = 0;
  const cumulative: number[] = [0];
  const ranked: RankedDebtor[] = sorted.map((row, index) => {
    const before = total > 0 ? running / total : 0;
    running += row.outstanding;
    cumulative.push(running);
    return {
      ...row,
      outstanding: roundMoney(row.outstanding),
      overdue: roundMoney(row.overdue),
      rank: index + 1,
      share: share(row.outstanding, total),
      cumulativeShare: share(running, total),
      class: classOf(before),
    };
  });

  const classes: ClassSummary[] = CONCENTRATION_CLASSES.map((key) => {
    const members = ranked.filter((row) => row.class === key);
    const outstanding = members.reduce((sum, row) => sum + row.outstanding, 0);
    return {
      key,
      debtors: members.length,
      outstanding: roundMoney(outstanding),
      share: share(outstanding, total),
      debtorShare: share(members.length, count),
    };
  });

  // Lorenz-style curve from (0, 0) to (1, 1), evenly sampled over the debtors.
  const steps = Math.min(count, CURVE_SEGMENTS);
  const curve: CurvePoint[] = Array.from({ length: steps + 1 }, (_, step) => {
    const index = steps === 0 ? 0 : Math.round((step * count) / steps);
    return { debtorShare: share(index, count), debtShare: share(cumulative[index]!, total) };
  });

  return { total: roundMoney(total), debtors: count, classes, curve, ranked };
}
