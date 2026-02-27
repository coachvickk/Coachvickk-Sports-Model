// ============================================================
// Transaction Categorization Engine
// Deterministic, rule-based, re-runnable.
// ============================================================

import type {
  Transaction,
  CategorizationRule,
  CategorizationSource,
} from '../types';

/** Plaid Personal Finance Category → internal category name mapping */
const PFC_MAP: Record<string, string> = {
  'FOOD_AND_DRINK_GROCERIES': 'Groceries',
  'FOOD_AND_DRINK_RESTAURANTS': 'Dining',
  'FOOD_AND_DRINK_COFFEE': 'Dining',
  'FOOD_AND_DRINK_FAST_FOOD': 'Dining',
  'FOOD_AND_DRINK_OTHER': 'Dining',
  'TRANSPORTATION_GAS': 'Gas',
  'TRANSPORTATION_PARKING': 'Transportation',
  'TRANSPORTATION_PUBLIC_TRANSIT': 'Transportation',
  'TRANSPORTATION_RIDE_SHARE': 'Transportation',
  'TRANSPORTATION_OTHER': 'Transportation',
  'GENERAL_MERCHANDISE_CLOTHING': 'Shopping',
  'GENERAL_MERCHANDISE_ELECTRONICS': 'Shopping',
  'GENERAL_MERCHANDISE_OTHER': 'Shopping',
  'ENTERTAINMENT_MUSIC': 'Entertainment',
  'ENTERTAINMENT_MOVIES': 'Entertainment',
  'ENTERTAINMENT_GAMES': 'Entertainment',
  'ENTERTAINMENT_OTHER': 'Entertainment',
  'PERSONAL_CARE': 'Personal Care',
  'MEDICAL_MEDICAL_SERVICES': 'Health',
  'MEDICAL_PHARMACY': 'Health',
  'RENT_AND_UTILITIES_RENT': 'Housing',
  'RENT_AND_UTILITIES_ELECTRICITY': 'Utilities',
  'RENT_AND_UTILITIES_GAS': 'Utilities',
  'RENT_AND_UTILITIES_WATER': 'Utilities',
  'RENT_AND_UTILITIES_INTERNET': 'Utilities',
  'RENT_AND_UTILITIES_PHONE': 'Utilities',
  'RENT_AND_UTILITIES_OTHER': 'Utilities',
  'LOAN_PAYMENTS_CAR_PAYMENT': 'Debt Payment',
  'LOAN_PAYMENTS_CREDIT_CARD': 'Debt Payment',
  'LOAN_PAYMENTS_STUDENT_LOAN': 'Debt Payment',
  'LOAN_PAYMENTS_OTHER': 'Debt Payment',
  'INCOME_WAGES': 'Income',
  'INCOME_OTHER': 'Income',
  'TRANSFER_IN': 'Transfer',
  'TRANSFER_OUT': 'Transfer',
};

/**
 * Normalize a merchant string for matching.
 * Lowercase, trim, collapse whitespace, remove special chars.
 */
export function normalizeMerchant(raw: string | null): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

export interface CategorizationResult {
  categoryName: string | null;
  source: CategorizationSource;
  ruleId?: string;
}

/**
 * Categorize a single transaction through the pipeline.
 *
 * Pipeline priority:
 * 1. merchant_exact rules (sorted by priority asc)
 * 2. merchant_contains rules (sorted by priority asc)
 * 3. Plaid PFC mapping
 * 4. null (uncategorized)
 *
 * @param transaction - The transaction to categorize
 * @param rules - User's categorization rules, pre-sorted by priority ascending
 * @param categoryMap - Map of category ID → category name
 * @returns CategorizationResult with matched category and source
 */
export function categorizeTransaction(
  transaction: Pick<Transaction, 'merchant_name' | 'name' | 'plaid_personal_finance_category'>,
  rules: CategorizationRule[],
  categoryMap: Record<string, string>
): CategorizationResult {
  const normalizedMerchant = normalizeMerchant(
    transaction.merchant_name || transaction.name
  );

  // Step 1: merchant_exact rules
  const exactRules = rules
    .filter((r) => r.match_type === 'merchant_exact')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of exactRules) {
    if (normalizeMerchant(rule.match_value) === normalizedMerchant) {
      return {
        categoryName: categoryMap[rule.category_id] ?? null,
        source: 'merchant_exact',
        ruleId: rule.id,
      };
    }
  }

  // Step 2: merchant_contains rules
  const containsRules = rules
    .filter((r) => r.match_type === 'merchant_contains')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of containsRules) {
    const needle = normalizeMerchant(rule.match_value);
    if (needle && normalizedMerchant.includes(needle)) {
      return {
        categoryName: categoryMap[rule.category_id] ?? null,
        source: 'merchant_contains',
        ruleId: rule.id,
      };
    }
  }

  // Step 3: Plaid PFC mapping
  if (transaction.plaid_personal_finance_category) {
    const mapped = PFC_MAP[transaction.plaid_personal_finance_category];
    if (mapped) {
      return {
        categoryName: mapped,
        source: 'plaid_pfc',
      };
    }
  }

  // Step 4: No match
  return {
    categoryName: null,
    source: 'default',
  };
}

/**
 * Batch categorize transactions. Deterministic and re-runnable.
 */
export function categorizeTransactions(
  transactions: Pick<Transaction, 'merchant_name' | 'name' | 'plaid_personal_finance_category'>[],
  rules: CategorizationRule[],
  categoryMap: Record<string, string>
): CategorizationResult[] {
  return transactions.map((tx) => categorizeTransaction(tx, rules, categoryMap));
}
