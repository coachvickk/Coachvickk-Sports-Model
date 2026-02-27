import {
  rebalanceEnvelopes,
  calculateAllocatable,
  validateEnvelopeBalance,
} from '../engines/rebalance';
import type { EnvelopeWithCategory } from '../engines/rebalance';
import type { Category, Envelope } from '../types';

function makeEnvelope(
  categoryId: string,
  name: string,
  remaining: number,
  priority: number,
  opts: { isProtected?: boolean; isSnowball?: boolean } = {}
): EnvelopeWithCategory {
  return {
    id: `env-${categoryId}`,
    user_id: 'user-1',
    category_id: categoryId,
    period_id: 'period-1',
    allocated: remaining + 50, // some base allocation
    spent: 50,
    remaining,
    created_at: '',
    updated_at: '',
    category: {
      id: categoryId,
      user_id: 'user-1',
      name,
      icon: '📁',
      color: '#000',
      is_protected: opts.isProtected ?? false,
      priority,
      is_snowball: opts.isSnowball ?? false,
      created_at: '',
    },
  };
}

describe('rebalanceEnvelopes', () => {
  it('should return empty adjustments when deficit is 0', () => {
    const envelopes = [makeEnvelope('a', 'Gas', 100, 50)];
    const result = rebalanceEnvelopes(envelopes, 'a', 0, 'hybrid');

    expect(result.adjustments).toHaveLength(0);
    expect(result.success).toBe(true);
    expect(result.unresolved).toBe(0);
  });

  it('should reduce high-priority-number categories first', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('important', 'Groceries', 100, 20), // lower number = more important
      makeEnvelope('discretionary', 'Entertainment', 80, 70), // higher number = less important
      makeEnvelope('mid', 'Dining', 60, 50),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 40, 'hybrid');

    expect(result.success).toBe(true);
    expect(result.totalDeficit).toBe(40);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].categoryId).toBe('discretionary');
    expect(result.adjustments[0].reduction).toBe(40);
    expect(result.adjustments[0].newRemaining).toBe(40);
  });

  it('should cascade through multiple categories if one is insufficient', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('low', 'Entertainment', 20, 70),
      makeEnvelope('mid', 'Dining', 50, 50),
      makeEnvelope('high', 'Groceries', 100, 20),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 60, 'hybrid');

    expect(result.success).toBe(true);
    expect(result.adjustments).toHaveLength(2);
    // First reduce Entertainment (priority 70, reduced first)
    expect(result.adjustments[0].categoryId).toBe('low');
    expect(result.adjustments[0].reduction).toBe(20);
    // Then reduce Dining (priority 50)
    expect(result.adjustments[1].categoryId).toBe('mid');
    expect(result.adjustments[1].reduction).toBe(40);
  });

  it('should skip protected categories', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('protected', 'Housing', 200, 80, { isProtected: true }),
      makeEnvelope('unprotected', 'Dining', 50, 50),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 30, 'hybrid');

    expect(result.success).toBe(true);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].categoryId).toBe('unprotected');
  });

  it('should not reduce snowball in hard mode', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('snowball', 'Snowball Extra', 200, 25, { isSnowball: true }),
      makeEnvelope('dining', 'Dining', 50, 60),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 40, 'hard');

    expect(result.success).toBe(true);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].categoryId).toBe('dining');
    // Snowball should not be touched
    const snowball = envelopes.find((e) => e.category.is_snowball);
    expect(snowball!.remaining).toBe(200);
  });

  it('should reduce snowball normally in flexible mode', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('snowball', 'Snowball Extra', 200, 25, { isSnowball: true }),
      makeEnvelope('dining', 'Dining', 50, 60),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 80, 'flexible');

    expect(result.success).toBe(true);
    // Dining (priority 60) reduced first, then snowball (priority 25)
    expect(result.adjustments).toHaveLength(2);
    expect(result.adjustments[0].categoryId).toBe('dining');
    expect(result.adjustments[0].reduction).toBe(50);
    expect(result.adjustments[1].categoryId).toBe('snowball');
    expect(result.adjustments[1].reduction).toBe(30);
  });

  it('should reduce snowball last in hybrid mode', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('snowball', 'Snowball Extra', 200, 25, { isSnowball: true }),
      makeEnvelope('dining', 'Dining', 50, 60),
      makeEnvelope('groceries', 'Groceries', 100, 20),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 160, 'hybrid');

    expect(result.success).toBe(true);
    // Order: Dining (60), Groceries (20), then Snowball (last due to hybrid)
    expect(result.adjustments[0].categoryId).toBe('dining');
    expect(result.adjustments[1].categoryId).toBe('groceries');
    expect(result.adjustments[2].categoryId).toBe('snowball');
    expect(result.adjustments[2].reduction).toBe(10);
  });

  it('should report unresolved deficit when categories exhausted', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('dining', 'Dining', 20, 60),
    ];

    const result = rebalanceEnvelopes(envelopes, 'overspent', 50, 'hard');

    expect(result.success).toBe(false);
    expect(result.unresolved).toBe(30);
    expect(result.adjustments[0].reduction).toBe(20);
  });

  it('should be deterministic — same input always gives same output', () => {
    const makeEnvelopes = () => [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('a', 'A', 100, 70),
      makeEnvelope('b', 'B', 80, 50),
      makeEnvelope('c', 'C', 60, 40),
    ];

    const result1 = rebalanceEnvelopes(makeEnvelopes(), 'overspent', 120, 'hybrid');
    const result2 = rebalanceEnvelopes(makeEnvelopes(), 'overspent', 120, 'hybrid');

    expect(result1.adjustments).toEqual(result2.adjustments);
    expect(result1.success).toEqual(result2.success);
    expect(result1.unresolved).toEqual(result2.unresolved);
  });

  it('should verify mathematical correctness — total reductions equal deficit', () => {
    const envelopes = [
      makeEnvelope('overspent', 'Gas', 0, 30),
      makeEnvelope('a', 'A', 100, 70),
      makeEnvelope('b', 'B', 80, 50),
      makeEnvelope('c', 'C', 60, 40),
    ];

    const deficit = 175;
    const result = rebalanceEnvelopes(envelopes, 'overspent', deficit, 'hybrid');

    const totalReduced = result.adjustments.reduce((sum, a) => sum + a.reduction, 0);
    expect(totalReduced + result.unresolved).toBe(deficit);
  });
});

describe('calculateAllocatable', () => {
  it('should subtract bills, debts, and reserve from balance', () => {
    expect(calculateAllocatable(5000, 1200, 400, 500)).toBe(2900);
  });

  it('should never go below 0', () => {
    expect(calculateAllocatable(100, 500, 200, 0)).toBe(0);
  });

  it('should handle zero reserve', () => {
    expect(calculateAllocatable(3000, 1000, 500, 0)).toBe(1500);
  });
});

describe('validateEnvelopeBalance', () => {
  it('should return 0 when balanced', () => {
    const envelopes = [{ allocated: 400 }, { allocated: 300 }, { allocated: 300 }];
    expect(validateEnvelopeBalance(envelopes, 1000)).toBe(0);
  });

  it('should return positive when under-allocated', () => {
    const envelopes = [{ allocated: 300 }, { allocated: 200 }];
    expect(validateEnvelopeBalance(envelopes, 1000)).toBe(500);
  });

  it('should return negative when over-allocated', () => {
    const envelopes = [{ allocated: 600 }, { allocated: 500 }];
    expect(validateEnvelopeBalance(envelopes, 1000)).toBe(-100);
  });
});
