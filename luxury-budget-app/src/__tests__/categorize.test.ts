import {
  categorizeTransaction,
  categorizeTransactions,
  normalizeMerchant,
} from '../engines/categorize';
import type { CategorizationRule } from '../types';

describe('normalizeMerchant', () => {
  it('should lowercase and trim', () => {
    expect(normalizeMerchant('  WALMART  ')).toBe('walmart');
  });

  it('should remove special characters', () => {
    expect(normalizeMerchant("McDonald's #1234")).toBe('mcdonalds 1234');
  });

  it('should collapse whitespace', () => {
    expect(normalizeMerchant('Trader   Joe   s')).toBe('trader joe s');
  });

  it('should return empty string for null', () => {
    expect(normalizeMerchant(null)).toBe('');
  });
});

describe('categorizeTransaction', () => {
  const categoryMap: Record<string, string> = {
    'cat-groceries': 'Groceries',
    'cat-gas': 'Gas',
    'cat-dining': 'Dining',
    'cat-shopping': 'Shopping',
  };

  const rules: CategorizationRule[] = [
    {
      id: 'rule-1',
      user_id: 'user-1',
      match_type: 'merchant_exact',
      match_value: 'walmart',
      category_id: 'cat-groceries',
      priority: 0,
      created_at: '',
    },
    {
      id: 'rule-2',
      user_id: 'user-1',
      match_type: 'merchant_contains',
      match_value: 'shell',
      category_id: 'cat-gas',
      priority: 1,
      created_at: '',
    },
    {
      id: 'rule-3',
      user_id: 'user-1',
      match_type: 'merchant_contains',
      match_value: 'amazon',
      category_id: 'cat-shopping',
      priority: 2,
      created_at: '',
    },
  ];

  it('should match exact merchant rule first', () => {
    const result = categorizeTransaction(
      {
        merchant_name: 'WALMART',
        name: 'Walmart Purchase',
        plaid_personal_finance_category: 'GENERAL_MERCHANDISE_OTHER',
      },
      rules,
      categoryMap
    );

    expect(result.categoryName).toBe('Groceries');
    expect(result.source).toBe('merchant_exact');
    expect(result.ruleId).toBe('rule-1');
  });

  it('should match contains rule when exact does not match', () => {
    const result = categorizeTransaction(
      {
        merchant_name: 'Shell Gas Station #443',
        name: 'Shell',
        plaid_personal_finance_category: null,
      },
      rules,
      categoryMap
    );

    expect(result.categoryName).toBe('Gas');
    expect(result.source).toBe('merchant_contains');
    expect(result.ruleId).toBe('rule-2');
  });

  it('should fall back to Plaid PFC when no rules match', () => {
    const result = categorizeTransaction(
      {
        merchant_name: 'Unknown Merchant',
        name: 'Unknown',
        plaid_personal_finance_category: 'FOOD_AND_DRINK_RESTAURANTS',
      },
      rules,
      categoryMap
    );

    expect(result.categoryName).toBe('Dining');
    expect(result.source).toBe('plaid_pfc');
    expect(result.ruleId).toBeUndefined();
  });

  it('should return null when nothing matches', () => {
    const result = categorizeTransaction(
      {
        merchant_name: 'Random Place',
        name: 'Random',
        plaid_personal_finance_category: 'UNKNOWN_CATEGORY',
      },
      rules,
      categoryMap
    );

    expect(result.categoryName).toBeNull();
    expect(result.source).toBe('default');
  });

  it('should use transaction name as fallback when merchant is null', () => {
    const result = categorizeTransaction(
      {
        merchant_name: null,
        name: 'Amazon Marketplace',
        plaid_personal_finance_category: null,
      },
      rules,
      categoryMap
    );

    expect(result.categoryName).toBe('Shopping');
    expect(result.source).toBe('merchant_contains');
  });

  it('should respect rule priority order for contains rules', () => {
    const overlappingRules: CategorizationRule[] = [
      {
        id: 'r-high',
        user_id: 'u',
        match_type: 'merchant_contains',
        match_value: 'target',
        category_id: 'cat-groceries',
        priority: 0,
        created_at: '',
      },
      {
        id: 'r-low',
        user_id: 'u',
        match_type: 'merchant_contains',
        match_value: 'target',
        category_id: 'cat-shopping',
        priority: 10,
        created_at: '',
      },
    ];

    const result = categorizeTransaction(
      {
        merchant_name: 'Target Store',
        name: 'Target',
        plaid_personal_finance_category: null,
      },
      overlappingRules,
      categoryMap
    );

    expect(result.categoryName).toBe('Groceries');
    expect(result.ruleId).toBe('r-high');
  });
});

describe('categorizeTransactions (batch)', () => {
  it('should categorize multiple transactions deterministically', () => {
    const categoryMap = { 'cat-1': 'Gas' };
    const rules: CategorizationRule[] = [
      {
        id: 'r-1',
        user_id: 'u',
        match_type: 'merchant_exact',
        match_value: 'bp',
        category_id: 'cat-1',
        priority: 0,
        created_at: '',
      },
    ];

    const transactions = [
      { merchant_name: 'BP', name: 'BP Gas', plaid_personal_finance_category: null },
      { merchant_name: 'Other', name: 'Other', plaid_personal_finance_category: null },
      { merchant_name: 'BP', name: 'BP #2', plaid_personal_finance_category: null },
    ];

    const results = categorizeTransactions(transactions, rules, categoryMap);

    expect(results).toHaveLength(3);
    expect(results[0].categoryName).toBe('Gas');
    expect(results[1].categoryName).toBeNull();
    expect(results[2].categoryName).toBe('Gas');
  });
});
