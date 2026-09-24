import { describe, expect, it } from 'vitest';
import { debtConcentration, type DebtorBalance } from '../src/domain/concentration';

const debtor = (customerId: string, outstanding: number, overdue = 0): DebtorBalance => ({
  customerId,
  name: customerId.toUpperCase(),
  outstanding,
  overdue,
  receivables: 1,
});

describe('debtConcentration', () => {
  it('ranks debtors and splits them into A (80%), B (95%) and C', () => {
    const result = debtConcentration([
      debtor('c', 100),
      debtor('a', 600, 200),
      debtor('d', 50),
      debtor('b', 200),
      debtor('e', 50),
      debtor('zero', 0),
    ]);

    expect(result.total).toBe(1000);
    expect(result.debtors).toBe(5);
    // a: before 0% → A; b: before 60% → A (crosses 80%); c: before 80% → B; d: 90% → B; e: 95% → C.
    expect(result.ranked.map((row) => [row.customerId, row.class, row.cumulativeShare])).toEqual([
      ['a', 'A', 0.6],
      ['b', 'A', 0.8],
      ['c', 'B', 0.9],
      ['d', 'B', 0.95],
      ['e', 'C', 1],
    ]);
    expect(result.ranked[0]).toMatchObject({ rank: 1, share: 0.6, overdue: 200 });
    expect(result.classes).toEqual([
      { key: 'A', debtors: 2, outstanding: 800, share: 0.8, debtorShare: 0.4 },
      { key: 'B', debtors: 2, outstanding: 150, share: 0.15, debtorShare: 0.4 },
      { key: 'C', debtors: 1, outstanding: 50, share: 0.05, debtorShare: 0.2 },
    ]);
    expect(result.curve).toEqual([
      { debtorShare: 0, debtShare: 0 },
      { debtorShare: 0.2, debtShare: 0.6 },
      { debtorShare: 0.4, debtShare: 0.8 },
      { debtorShare: 0.6, debtShare: 0.9 },
      { debtorShare: 0.8, debtShare: 0.95 },
      { debtorShare: 1, debtShare: 1 },
    ]);
  });

  it('breaks ties by name so the order is stable', () => {
    const result = debtConcentration([debtor('b', 10), debtor('a', 10)]);
    expect(result.ranked.map((row) => row.customerId)).toEqual(['a', 'b']);
  });

  it('samples the curve in at most 100 segments from (0, 0) to (1, 1)', () => {
    const result = debtConcentration(
      Array.from({ length: 1000 }, (_, index) => debtor(`c${index}`, index + 1)),
    );
    expect(result.curve).toHaveLength(101);
    expect(result.curve[0]).toEqual({ debtorShare: 0, debtShare: 0 });
    expect(result.curve.at(-1)).toEqual({ debtorShare: 1, debtShare: 1 });
    const shares = result.curve.map((point) => point.debtShare);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });

  it('handles a portfolio without debt', () => {
    const result = debtConcentration([debtor('a', 0)]);
    expect(result).toMatchObject({ total: 0, debtors: 0, ranked: [] });
    expect(result.curve).toEqual([{ debtorShare: 0, debtShare: 0 }]);
    expect(result.classes.every((row) => row.debtors === 0 && row.share === 0)).toBe(true);
  });
});
