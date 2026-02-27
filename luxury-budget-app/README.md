# Luxury Budget

> Top-down envelope budgeting with debt snowball acceleration.
> A financial control engine, not a generic budgeting app.

## Architecture

```
luxury-budget-app/
├── App.tsx                          # Root app with providers
├── src/
│   ├── theme/                       # Luxury design system
│   │   ├── colors.ts                # Dark charcoal + champagne gold palette
│   │   ├── typography.ts            # Serif headlines + sans UI type scale
│   │   └── spacing.ts              # Spacing, radius, shadows
│   ├── types/                       # Full TypeScript type definitions
│   ├── engines/                     # Core financial logic (pure functions)
│   │   ├── categorize.ts           # Transaction categorization pipeline
│   │   ├── rebalance.ts            # Envelope rebalance engine
│   │   └── snowball.ts             # Debt snowball projection engine
│   ├── components/                  # Reusable luxury UI components
│   │   ├── LuxuryCard.tsx
│   │   ├── LuxuryButton.tsx
│   │   ├── LuxuryInput.tsx
│   │   ├── RemainingDisplay.tsx     # Hero remaining funds display
│   │   ├── EnvelopeCard.tsx
│   │   ├── TransactionRow.tsx
│   │   ├── DebtCard.tsx
│   │   ├── AuditRow.tsx
│   │   ├── RecategorizeModal.tsx
│   │   └── ScreenContainer.tsx
│   ├── screens/                     # All app screens
│   │   ├── OnboardingScreen.tsx     # Auth (sign in / sign up)
│   │   ├── ConnectBankScreen.tsx    # Plaid bank linking
│   │   ├── ModeSelectionScreen.tsx  # Hard / Flexible / Hybrid
│   │   ├── HomeScreen.tsx           # Dashboard with remaining overview
│   │   ├── CategoryDetailScreen.tsx # Envelope detail + transactions
│   │   ├── TransactionsScreen.tsx   # Full transaction list
│   │   ├── DebtsScreen.tsx          # Debts + snowball projection
│   │   ├── AuditScreen.tsx          # Activity / audit feed
│   │   └── SettingsScreen.tsx
│   ├── navigation/                  # React Navigation setup
│   ├── hooks/                       # Auth hook
│   ├── store/                       # Zustand global state
│   ├── lib/                         # Supabase client, formatters
│   └── __tests__/                   # Unit tests for engines
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Full schema with RLS
│   └── functions/
│       ├── plaid-link/              # Link token creation
│       ├── plaid-exchange/          # Public token exchange
│       ├── plaid-sync/              # Transaction sync
│       └── plaid-webhook/           # Webhook handler
└── .env.example
```

## Core Concepts

### Top-Down Envelope Model

Budgets start **fully allocated** and **count down** as spending happens. The UI always emphasizes "You have $X left" — not "You spent $X."

### Balance Constraint

```
Allocatable Funds = Bank Balance - Upcoming Bills - Min Debt Payments - Reserve
```

All envelopes must sum to allocatable funds. Overspending triggers automatic rebalancing.

### Rebalance Modes

| Mode | Behavior |
|------|----------|
| **Hard** | Snowball extra is untouchable. Only discretionary categories reduce. |
| **Flexible** | Snowball extra can shrink when overspending occurs. |
| **Hybrid** | Reduce discretionary first, then buffer, then snowball as last resort. |

### Debt Snowball

Pays minimums on all debts, applies extra to the smallest balance first. When a debt is paid off, its minimum rolls into the next debt.

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Supabase account (https://supabase.com)
- Plaid account (https://plaid.com) — sandbox is free

### 1. Clone & Install

```bash
cd luxury-budget-app
npm install --legacy-peer-deps
```

### 2. Supabase Setup

1. Create a new Supabase project
2. Run the migration:
   ```bash
   # Using Supabase CLI
   supabase db push
   # Or manually run supabase/migrations/001_initial_schema.sql in the SQL editor
   ```
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy plaid-link
   supabase functions deploy plaid-exchange
   supabase functions deploy plaid-sync
   supabase functions deploy plaid-webhook
   ```
4. Set Edge Function secrets:
   ```bash
   supabase secrets set PLAID_CLIENT_ID=your_client_id
   supabase secrets set PLAID_SECRET=your_secret
   supabase secrets set PLAID_ENV=sandbox
   supabase secrets set PLAID_WEBHOOK_SECRET=your_webhook_secret
   ```

### 3. Environment Variables

Create `.env` from the example:

```bash
cp .env.example .env
```

Fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run the App

```bash
npx expo start
```

Scan the QR code with Expo Go on your device.

### 5. Run Tests

```bash
npm test
```

All 39 unit tests cover the three core engines:
- `categorizeTransaction()` — deterministic rule-based categorization pipeline
- `rebalanceEnvelopes()` — balance-anchored envelope adjustment engine
- `generateSnowballPlan()` — debt payoff projection with payment rollover

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo), TypeScript |
| State | Zustand + TanStack Query |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions) |
| Bank Sync | Plaid (Transactions product) |
| Navigation | React Navigation 7 |

## Design System

**Aesthetic**: NYC penthouse × Cartier magazine editorial

- Dark charcoal base (`#0D0D0D`)
- Champagne/gold accent (`#C9A96E`)
- Serif headlines (Georgia) + modern sans body (System)
- Generous whitespace, minimal borders
- Soft rounded corners (12–16px)
- Subtle shadows, no clutter

## Database

Full Postgres schema with RLS on all tables:

- `users_profile` — user settings, snowball mode
- `accounts` — Plaid-linked bank accounts
- `transactions` — synced transactions
- `categories` — budget categories
- `envelopes` — per-period allocations
- `periods` — budget periods
- `debts` — debt entries
- `snowball_plan` — projected payoff schedule
- `rules` — categorization rules
- `audit_events` — full audit trail
- `bills` — recurring bills (optional)
