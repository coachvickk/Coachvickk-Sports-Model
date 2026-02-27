// ============================================================
// Envelope Rebalance Engine
// Deterministic, balance-anchored, audit-logged.
// ============================================================

import type {
  Envelope,
  Category,
  SnowballMode,
  RebalanceResult,
  RebalanceAdjustment,
} from '../types';

export interface EnvelopeWithCategory extends Envelope {
  category: Category;
}

/**
 * Rebalance envelopes after an overspend event.
 *
 * When spending in a category exceeds its remaining allocation:
 * 1. Set overspent category remaining to 0
 * 2. Calculate deficit
 * 3. Reduce other categories in priority order (highest priority number first)
 * 4. Skip protected categories
 * 5. Obey snowball mode rules
 *
 * Priority order: categories with HIGHER priority number are reduced FIRST.
 * (Lower number = more important = reduced last.)
 *
 * @param envelopes - All envelopes for the current period with their categories
 * @param overspentCategoryId - The category that was overspent
 * @param deficit - The amount by which spending exceeded the remaining allocation
 * @param mode - The user's snowball mode setting
 * @returns RebalanceResult with all adjustments made
 */
export function rebalanceEnvelopes(
  envelopes: EnvelopeWithCategory[],
  overspentCategoryId: string,
  deficit: number,
  mode: SnowballMode
): RebalanceResult {
  if (deficit <= 0) {
    return { adjustments: [], totalDeficit: 0, success: true, unresolved: 0 };
  }

  const adjustments: RebalanceAdjustment[] = [];
  let remainingDeficit = deficit;

  // Build reduction candidates:
  // Exclude the overspent category itself
  // Exclude protected categories
  // Apply snowball mode rules
  const candidates = envelopes
    .filter((env) => {
      if (env.category_id === overspentCategoryId) return false;
      if (env.category.is_protected) return false;
      if (env.remaining <= 0) return false;

      // Snowball mode rules
      if (env.category.is_snowball) {
        if (mode === 'hard') return false; // never reduce snowball in hard mode
        // In hybrid mode, snowball is last resort (handled by sorting)
        // In flexible mode, snowball can be reduced normally
      }

      return true;
    })
    .sort((a, b) => {
      // In hybrid mode, put snowball category last (highest sort value)
      if (mode === 'hybrid') {
        if (a.category.is_snowball && !b.category.is_snowball) return 1;
        if (!a.category.is_snowball && b.category.is_snowball) return -1;
      }

      // Higher priority number = less important = reduced first
      return b.category.priority - a.category.priority;
    });

  // Reduce candidates in order until deficit is covered
  for (const envelope of candidates) {
    if (remainingDeficit <= 0) break;

    const reduction = Math.min(envelope.remaining, remainingDeficit);

    adjustments.push({
      categoryId: envelope.category_id,
      categoryName: envelope.category.name,
      previousRemaining: envelope.remaining,
      reduction,
      newRemaining: envelope.remaining - reduction,
    });

    // Mutate envelope in place for cascading calculations
    envelope.remaining -= reduction;
    envelope.spent += reduction;
    remainingDeficit -= reduction;
  }

  return {
    adjustments,
    totalDeficit: deficit,
    success: remainingDeficit === 0,
    unresolved: Math.max(0, remainingDeficit),
  };
}

/**
 * Calculate allocatable funds from bank balance.
 *
 * Allocatable = Available Balance - Upcoming Bills - Min Debt Payments - Protected Reserve
 */
export function calculateAllocatable(
  availableBalance: number,
  upcomingBills: number,
  minimumDebtPayments: number,
  protectedReserve: number
): number {
  return Math.max(
    0,
    availableBalance - upcomingBills - minimumDebtPayments - protectedReserve
  );
}

/**
 * Validate that all envelopes sum to allocatable funds.
 * Returns the difference (should be 0 for a balanced budget).
 */
export function validateEnvelopeBalance(
  envelopes: Pick<Envelope, 'allocated'>[],
  allocatable: number
): number {
  const totalAllocated = envelopes.reduce((sum, e) => sum + e.allocated, 0);
  return Math.round((allocatable - totalAllocated) * 100) / 100;
}
