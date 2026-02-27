-- ============================================================
-- Luxury Budget — Initial Database Schema
-- Supabase / Postgres with Row Level Security
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS PROFILE
-- ============================================================
CREATE TABLE users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  snowball_mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (snowball_mode IN ('hard', 'flexible', 'hybrid')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  protected_reserve NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON users_profile FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users_profile FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users_profile FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users_profile (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ACCOUNTS (Plaid-linked bank accounts)
-- ============================================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL, -- encrypted at rest by Supabase
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  mask TEXT,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(12,2),
  iso_currency_code TEXT NOT NULL DEFAULT 'USD',
  cursor TEXT, -- Plaid sync cursor for incremental sync
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user ON accounts(user_id);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#C9A96E',
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 50, -- lower = more important = reduced last
  is_snowball BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_user ON categories(user_id);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own categories" ON categories FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- PERIODS (Budget periods, typically monthly)
-- ============================================================
CREATE TABLE periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_allocatable NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_remaining NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_periods_user ON periods(user_id);
CREATE INDEX idx_periods_active ON periods(user_id, is_active) WHERE is_active = TRUE;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own periods" ON periods FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- ENVELOPES (Category allocations per period)
-- ============================================================
CREATE TABLE envelopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, period_id)
);

CREATE INDEX idx_envelopes_period ON envelopes(period_id);
CREATE INDEX idx_envelopes_user ON envelopes(user_id);
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own envelopes" ON envelopes FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL, -- positive = outflow, negative = inflow
  merchant_name TEXT,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  pending BOOLEAN NOT NULL DEFAULT FALSE,
  category_id UUID REFERENCES categories(id),
  plaid_category TEXT,
  plaid_personal_finance_category TEXT,
  categorization_source TEXT CHECK (categorization_source IN ('merchant_exact', 'merchant_contains', 'plaid_pfc', 'manual', 'default')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_pending ON transactions(user_id, pending) WHERE pending = TRUE;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- DEBTS
-- ============================================================
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  balance NUMERIC(12,2) NOT NULL,
  apr NUMERIC(6,3) NOT NULL DEFAULT 0,
  minimum_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  is_paid_off BOOLEAN NOT NULL DEFAULT FALSE,
  "order" INTEGER NOT NULL DEFAULT 0, -- snowball order
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debts_user ON debts(user_id);
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own debts" ON debts FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- SNOWBALL PLAN
-- ============================================================
CREATE TABLE snowball_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- YYYY-MM
  payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  principal NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_payoff_month BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(debt_id, month)
);

CREATE INDEX idx_snowball_user ON snowball_plan(user_id);
ALTER TABLE snowball_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own snowball plan" ON snowball_plan FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- CATEGORIZATION RULES
-- ============================================================
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('merchant_exact', 'merchant_contains')),
  match_value TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0, -- lower = checked first
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_user ON rules(user_id);
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own rules" ON rules FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'rebalance', 'overspend', 'categorize', 'rule_created',
    'debt_payoff', 'snowball_rollover', 'envelope_adjust',
    'transaction_sync', 'manual_edit'
  )),
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_events(user_id);
CREATE INDEX idx_audit_time ON audit_events(user_id, created_at DESC);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit events" ON audit_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit events" ON audit_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- BILLS (Optional MVP)
-- ============================================================
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
  category_id UUID REFERENCES categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bills_user ON bills(user_id);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bills" ON bills FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- DEFAULT CATEGORIES (seeded per user via function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO categories (user_id, name, icon, color, is_protected, priority, is_snowball) VALUES
    (p_user_id, 'Housing',        '🏠', '#5B8FB9', TRUE,  10, FALSE),
    (p_user_id, 'Utilities',      '💡', '#5B8FB9', TRUE,  15, FALSE),
    (p_user_id, 'Groceries',      '🛒', '#4CAF7D', FALSE, 20, FALSE),
    (p_user_id, 'Gas',            '⛽', '#D4A94E', FALSE, 30, FALSE),
    (p_user_id, 'Dining',         '🍽', '#C75050', FALSE, 60, FALSE),
    (p_user_id, 'Entertainment',  '🎬', '#C75050', FALSE, 70, FALSE),
    (p_user_id, 'Shopping',       '🛍', '#C75050', FALSE, 65, FALSE),
    (p_user_id, 'Transportation', '🚗', '#D4A94E', FALSE, 35, FALSE),
    (p_user_id, 'Health',         '🏥', '#5B8FB9', TRUE,  12, FALSE),
    (p_user_id, 'Personal Care',  '💆', '#C9A96E', FALSE, 50, FALSE),
    (p_user_id, 'Subscriptions',  '📱', '#C9A96E', FALSE, 40, FALSE),
    (p_user_id, 'Miscellaneous',  '📦', '#A8A4A0', FALSE, 80, FALSE),
    (p_user_id, 'Snowball Extra', '❄',  '#C9A96E', FALSE, 25, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_profile_updated
  BEFORE UPDATE ON users_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_envelopes_updated
  BEFORE UPDATE ON envelopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transactions_updated
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_debts_updated
  BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
