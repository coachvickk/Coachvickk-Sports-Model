// ============================================================
// Debt Snowball Engine
// Pays minimums first, applies extra to smallest balance.
// Rolls freed payments into next debt upon payoff.
// ============================================================

import type {
  Debt,
  SnowballProjection,
  SnowballMonth,
  SnowballPayment,
} from '../types';

/**
 * Generate a complete snowball payoff projection.
 *
 * Algorithm:
 * 1. Sort debts by balance ascending (smallest first).
 * 2. Each month:
 *    a. Apply interest to each debt.
 *    b. Pay minimum on all debts.
 *    c. Apply extra payment to the smallest remaining debt.
 *    d. If a debt is paid off, roll its minimum into the extra for next month.
 * 3. Continue until all debts are paid or max months reached.
 *
 * @param debts - Array of debts to plan payoff for
 * @param monthlyExtra - Extra amount beyond minimums to apply each month
 * @param maxMonths - Safety limit to prevent infinite loops (default 360 = 30 years)
 * @returns Full snowball projection schedule
 */
export function generateSnowballPlan(
  debts: Debt[],
  monthlyExtra: number,
  maxMonths: number = 360
): SnowballProjection {
  if (debts.length === 0) {
    return {
      debts: [],
      monthlyExtra,
      schedule: [],
      totalInterestPaid: 0,
      payoffDate: '',
      totalMonths: 0,
    };
  }

  // Deep clone and sort by balance ascending
  const activeDebts = debts
    .filter((d) => !d.is_paid_off && d.balance > 0)
    .map((d) => ({
      ...d,
      balance: d.balance,
      minimum_payment: d.minimum_payment,
    }))
    .sort((a, b) => a.balance - b.balance);

  const schedule: SnowballMonth[] = [];
  let totalInterestPaid = 0;
  let rolledExtra = 0; // accumulated freed minimums from paid-off debts
  let currentMonth = new Date();
  currentMonth.setDate(1); // normalize to first of month

  for (let monthNum = 0; monthNum < maxMonths; monthNum++) {
    // Check if all debts are paid off
    if (activeDebts.every((d) => d.balance <= 0)) break;

    const monthStr = formatMonth(currentMonth);
    const payments: SnowballPayment[] = [];
    let monthTotal = 0;

    // Step 1: Apply interest to all active debts
    for (const debt of activeDebts) {
      if (debt.balance <= 0) continue;
      const monthlyRate = debt.apr / 100 / 12;
      const interest = Math.round(debt.balance * monthlyRate * 100) / 100;
      debt.balance += interest;
      totalInterestPaid += interest;
    }

    // Step 2: Find the target debt (smallest balance still active)
    const targetDebt = activeDebts.find((d) => d.balance > 0);

    // Step 3: Pay minimums on all debts
    for (const debt of activeDebts) {
      if (debt.balance <= 0) continue;

      const isTarget = debt === targetDebt;

      // Minimum payment (capped at remaining balance)
      let payment = Math.min(debt.minimum_payment, debt.balance);
      const interest = debt.apr / 100 / 12 * (debt.balance - payment + payment);

      // If this is the target debt, add the extra + rolled amount
      if (isTarget) {
        const extra = monthlyExtra + rolledExtra;
        payment = Math.min(payment + extra, debt.balance);
      }

      // Round to cents
      payment = Math.round(payment * 100) / 100;

      const monthlyRate = debt.apr / 100 / 12;
      const interestPortion = Math.round(
        (debt.balance * monthlyRate / (1 + monthlyRate)) * (payment / debt.balance) * 100
      ) / 100;
      const principalPortion = payment - Math.min(interestPortion, payment);

      debt.balance = Math.round((debt.balance - payment) * 100) / 100;

      const isPaidOff = debt.balance <= 0;
      if (isPaidOff) {
        // If overpaid, adjust
        if (debt.balance < 0) {
          debt.balance = 0;
        }
        // Roll this debt's minimum into the extra pool
        rolledExtra += debt.minimum_payment;
      }

      payments.push({
        debtId: debt.id,
        debtName: debt.name,
        payment,
        principal: principalPortion,
        interest: Math.max(0, payment - principalPortion),
        remainingBalance: Math.max(0, debt.balance),
        isPaidOff,
      });

      monthTotal += payment;
    }

    schedule.push({
      month: monthStr,
      payments,
      totalPaid: Math.round(monthTotal * 100) / 100,
    });

    // Advance month
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  const lastMonth = schedule.length > 0 ? schedule[schedule.length - 1].month : '';

  return {
    debts,
    monthlyExtra,
    schedule,
    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
    payoffDate: lastMonth,
    totalMonths: schedule.length,
  };
}

/**
 * Calculate total minimum payments across all active debts.
 */
export function totalMinimumPayments(debts: Debt[]): number {
  return debts
    .filter((d) => !d.is_paid_off && d.balance > 0)
    .reduce((sum, d) => sum + d.minimum_payment, 0);
}

function formatMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
