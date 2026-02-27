// ============================================================
// Luxury Budget — Core Type Definitions
// ============================================================

/** Snowball mode determines how overspending affects the snowball extra */
export type SnowballMode = 'hard' | 'flexible' | 'hybrid';

/** Category priority for rebalancing — lower number = higher priority (reduced last) */
export type CategoryPriority = number;

// ---- User Profile ----
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  snowball_mode: SnowballMode;
  onboarding_complete: boolean;
  protected_reserve: number;
  created_at: string;
  updated_at: string;
}

// ---- Bank Account ----
export interface Account {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  current_balance: number;
  available_balance: number | null;
  iso_currency_code: string;
  last_synced_at: string | null;
  created_at: string;
}

// ---- Transaction ----
export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  plaid_transaction_id: string;
  amount: number; // positive = outflow, negative = inflow
  merchant_name: string | null;
  name: string;
  date: string;
  pending: boolean;
  category_id: string | null;
  plaid_category: string | null;
  plaid_personal_finance_category: string | null;
  categorization_source: CategorizationSource | null;
  created_at: string;
  updated_at: string;
}

export type CategorizationSource =
  | 'merchant_exact'
  | 'merchant_contains'
  | 'plaid_pfc'
  | 'manual'
  | 'default';

// ---- Category / Envelope ----
export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  is_protected: boolean;
  priority: CategoryPriority; // lower = reduced last during rebalance
  is_snowball: boolean; // marks the snowball extra category
  created_at: string;
}

export interface Envelope {
  id: string;
  user_id: string;
  category_id: string;
  period_id: string;
  allocated: number;
  spent: number;
  remaining: number; // allocated - spent (denormalized for fast reads)
  created_at: string;
  updated_at: string;
}

// ---- Period ----
export interface Period {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  total_allocatable: number;
  total_allocated: number;
  total_spent: number;
  total_remaining: number;
  is_active: boolean;
  created_at: string;
}

// ---- Debt ----
export interface Debt {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  apr: number;
  minimum_payment: number;
  due_day: number; // day of month
  is_paid_off: boolean;
  order: number; // snowball order (auto-sorted by balance ascending)
  created_at: string;
  updated_at: string;
}

// ---- Snowball Plan ----
export interface SnowballPlanEntry {
  id: string;
  user_id: string;
  debt_id: string;
  month: string; // YYYY-MM
  payment: number;
  principal: number;
  interest: number;
  remaining_balance: number;
  is_payoff_month: boolean;
}

// ---- Categorization Rule ----
export interface CategorizationRule {
  id: string;
  user_id: string;
  match_type: 'merchant_exact' | 'merchant_contains';
  match_value: string; // normalized merchant string
  category_id: string;
  priority: number; // lower = checked first
  created_at: string;
}

// ---- Audit Event ----
export interface AuditEvent {
  id: string;
  user_id: string;
  event_type: AuditEventType;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AuditEventType =
  | 'rebalance'
  | 'overspend'
  | 'categorize'
  | 'rule_created'
  | 'debt_payoff'
  | 'snowball_rollover'
  | 'envelope_adjust'
  | 'transaction_sync'
  | 'manual_edit';

// ---- Bill ----
export interface Bill {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  due_day: number;
  is_recurring: boolean;
  category_id: string | null;
  created_at: string;
}

// ---- Rebalance Types ----
export interface RebalanceResult {
  adjustments: RebalanceAdjustment[];
  totalDeficit: number;
  success: boolean;
  unresolved: number; // remaining deficit if categories exhausted
}

export interface RebalanceAdjustment {
  categoryId: string;
  categoryName: string;
  previousRemaining: number;
  reduction: number;
  newRemaining: number;
}

// ---- Snowball Projection ----
export interface SnowballProjection {
  debts: Debt[];
  monthlyExtra: number;
  schedule: SnowballMonth[];
  totalInterestPaid: number;
  payoffDate: string;
  totalMonths: number;
}

export interface SnowballMonth {
  month: string; // YYYY-MM
  payments: SnowballPayment[];
  totalPaid: number;
}

export interface SnowballPayment {
  debtId: string;
  debtName: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  isPaidOff: boolean;
}
