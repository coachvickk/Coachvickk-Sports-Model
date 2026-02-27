import { generateSnowballPlan, totalMinimumPayments } from '../engines/snowball';
import type { Debt } from '../types';

function makeDebt(
  id: string,
  name: string,
  balance: number,
  apr: number,
  minimum: number,
  dueDay = 15
): Debt {
  return {
    id,
    user_id: 'user-1',
    name,
    balance,
    apr,
    minimum_payment: minimum,
    due_day: dueDay,
    is_paid_off: false,
    order: 0,
    created_at: '',
    updated_at: '',
  };
}

describe('generateSnowballPlan', () => {
  it('should return empty schedule for no debts', () => {
    const result = generateSnowballPlan([], 100);
    expect(result.schedule).toHaveLength(0);
    expect(result.totalMonths).toBe(0);
    expect(result.totalInterestPaid).toBe(0);
  });

  it('should pay off a single debt', () => {
    const debts = [makeDebt('d1', 'Credit Card', 500, 0, 50)];
    const result = generateSnowballPlan(debts, 50); // $100/month total

    expect(result.totalMonths).toBeGreaterThan(0);
    expect(result.totalMonths).toBeLessThanOrEqual(6); // $500 / $100 = ~5 months

    // Verify final balance is 0
    const lastMonth = result.schedule[result.schedule.length - 1];
    const lastPayment = lastMonth.payments.find((p) => p.debtId === 'd1');
    expect(lastPayment?.remainingBalance).toBe(0);
    expect(lastPayment?.isPaidOff).toBe(true);
  });

  it('should target smallest balance first (snowball order)', () => {
    const debts = [
      makeDebt('big', 'Car Loan', 10000, 5, 200),
      makeDebt('small', 'Store Card', 300, 20, 25),
      makeDebt('med', 'Credit Card', 2000, 18, 50),
    ];

    const result = generateSnowballPlan(debts, 100);

    // In the first month, the extra should go to the smallest debt (Store Card $300)
    const firstMonth = result.schedule[0];
    const smallPayment = firstMonth.payments.find((p) => p.debtId === 'small');
    const bigPayment = firstMonth.payments.find((p) => p.debtId === 'big');

    // Small debt gets minimum ($25) + extra ($100) = $125
    expect(smallPayment!.payment).toBeGreaterThan(25);
    // Big debt only gets its minimum
    expect(bigPayment!.payment).toBeLessThanOrEqual(200.01 + 50); // min + some interest rounding
  });

  it('should roll freed payment to next debt after payoff', () => {
    const debts = [
      makeDebt('first', 'Small Debt', 100, 0, 50), // paid off quickly
      makeDebt('second', 'Medium Debt', 1000, 0, 50),
    ];

    const result = generateSnowballPlan(debts, 50);

    // After 'first' is paid off, find the next month
    let payoffMonth = -1;
    for (let i = 0; i < result.schedule.length; i++) {
      const p = result.schedule[i].payments.find((p) => p.debtId === 'first');
      if (p?.isPaidOff) {
        payoffMonth = i;
        break;
      }
    }

    expect(payoffMonth).toBeGreaterThanOrEqual(0);

    // In subsequent months, the second debt should get more than its minimum
    if (payoffMonth + 1 < result.schedule.length) {
      const nextMonthPayment = result.schedule[payoffMonth + 1].payments.find(
        (p) => p.debtId === 'second'
      );
      // Should get: min ($50) + original extra ($50) + rolled min from first debt ($50) = $150
      expect(nextMonthPayment!.payment).toBeGreaterThan(50);
    }
  });

  it('should account for interest accrual', () => {
    const debts = [makeDebt('d1', 'High APR', 1000, 24, 50)]; // 24% APR = 2%/month
    const result = generateSnowballPlan(debts, 0);

    expect(result.totalInterestPaid).toBeGreaterThan(0);
    expect(result.totalMonths).toBeGreaterThan(10); // interest makes it take longer than 20 months
  });

  it('should skip already paid-off debts', () => {
    const debts: Debt[] = [
      { ...makeDebt('paid', 'Paid Debt', 0, 0, 50), is_paid_off: true, balance: 0 },
      makeDebt('active', 'Active Debt', 500, 0, 50),
    ];

    const result = generateSnowballPlan(debts, 50);

    // Should only process the active debt
    for (const month of result.schedule) {
      const paidDebtPayment = month.payments.find((p) => p.debtId === 'paid');
      expect(paidDebtPayment).toBeUndefined();
    }
  });

  it('should handle zero extra payment', () => {
    const debts = [makeDebt('d1', 'Debt', 500, 0, 100)];
    const result = generateSnowballPlan(debts, 0);

    expect(result.totalMonths).toBe(5);
    expect(result.monthlyExtra).toBe(0);
  });

  it('should not exceed max months safety limit', () => {
    const debts = [makeDebt('d1', 'Huge Debt', 1000000, 25, 10)];
    const result = generateSnowballPlan(debts, 0, 24);

    expect(result.totalMonths).toBeLessThanOrEqual(24);
  });

  it('should be deterministic', () => {
    const makeDebts = () => [
      makeDebt('a', 'A', 500, 18, 25),
      makeDebt('b', 'B', 1500, 12, 50),
      makeDebt('c', 'C', 3000, 6, 75),
    ];

    const result1 = generateSnowballPlan(makeDebts(), 200);
    const result2 = generateSnowballPlan(makeDebts(), 200);

    expect(result1.totalMonths).toBe(result2.totalMonths);
    expect(result1.totalInterestPaid).toBe(result2.totalInterestPaid);
    expect(result1.schedule.length).toBe(result2.schedule.length);
  });
});

describe('totalMinimumPayments', () => {
  it('should sum minimums of active debts', () => {
    const debts = [
      makeDebt('a', 'A', 500, 10, 25),
      makeDebt('b', 'B', 1000, 15, 50),
      makeDebt('c', 'C', 2000, 20, 75),
    ];

    expect(totalMinimumPayments(debts)).toBe(150);
  });

  it('should exclude paid-off debts', () => {
    const debts: Debt[] = [
      makeDebt('a', 'A', 500, 10, 25),
      { ...makeDebt('b', 'B', 0, 15, 50), is_paid_off: true, balance: 0 },
    ];

    expect(totalMinimumPayments(debts)).toBe(25);
  });

  it('should return 0 for empty array', () => {
    expect(totalMinimumPayments([])).toBe(0);
  });
});
