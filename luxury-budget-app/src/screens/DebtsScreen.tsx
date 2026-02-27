import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, spacing } from '../theme';
import { DebtCard, LuxuryCard, ScreenContainer } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { generateSnowballPlan, totalMinimumPayments } from '../engines';
import { formatCurrency, formatMonth } from '../lib/format';
import type { Debt } from '../types';

export function DebtsScreen() {
  const userId = useAppStore((s) => s.userId);

  const { data: debts, isLoading } = useQuery({
    queryKey: ['debts', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', userId)
        .order('balance', { ascending: true });
      return (data ?? []) as Debt[];
    },
    enabled: !!userId,
  });

  // Get snowball extra from active envelope
  const { data: snowballExtra } = useQuery({
    queryKey: ['snowballExtra', userId],
    queryFn: async () => {
      const { data: period } = await supabase
        .from('periods')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!period) return 0;

      const { data: envelope } = await supabase
        .from('envelopes')
        .select('allocated, categories!inner(is_snowball)')
        .eq('period_id', period.id)
        .eq('categories.is_snowball', true)
        .single();

      return envelope?.allocated ?? 0;
    },
    enabled: !!userId,
  });

  const projection = useMemo(() => {
    if (!debts?.length) return null;
    return generateSnowballPlan(debts, snowballExtra ?? 0);
  }, [debts, snowballExtra]);

  const activeDebts = debts?.filter((d) => !d.is_paid_off) ?? [];
  const paidDebts = debts?.filter((d) => d.is_paid_off) ?? [];
  const totalDebt = activeDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMins = totalMinimumPayments(activeDebts);

  // Find the target (smallest active balance)
  const targetDebtId = activeDebts.length > 0 ? activeDebts[0]?.id : null;

  return (
    <View style={styles.screen}>
      <FlatList
        data={activeDebts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Debt Snowball</Text>

            {/* Summary card */}
            <LuxuryCard variant="accent" style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>TOTAL DEBT</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(totalDebt)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>MONTHLY MIN</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(totalMins)}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>SNOWBALL EXTRA</Text>
                  <Text style={[styles.summaryValue, styles.goldText]}>
                    {formatCurrency(snowballExtra ?? 0)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>PAYOFF DATE</Text>
                  <Text style={[styles.summaryValue, styles.goldText]}>
                    {projection?.payoffDate
                      ? formatMonth(projection.payoffDate)
                      : '—'}
                  </Text>
                </View>
              </View>
              {projection && (
                <View style={styles.projectionRow}>
                  <Text style={styles.projectionLabel}>
                    {projection.totalMonths} months · {formatCurrency(projection.totalInterestPaid)} total interest
                  </Text>
                </View>
              )}
            </LuxuryCard>

            <Text style={styles.sectionTitle}>Active Debts</Text>
          </View>
        }
        renderItem={({ item }) => (
          <DebtCard
            name={item.name}
            balance={item.balance}
            apr={item.apr}
            minimumPayment={item.minimum_payment}
            dueDay={item.due_day}
            isTarget={item.id === targetDebtId}
          />
        )}
        ListFooterComponent={
          paidDebts.length > 0 ? (
            <View>
              <Text style={styles.sectionTitle}>Paid Off</Text>
              {paidDebts.map((d) => (
                <DebtCard
                  key={d.id}
                  name={d.name}
                  balance={0}
                  apr={d.apr}
                  minimumPayment={d.minimum_payment}
                  dueDay={d.due_day}
                  isPaidOff
                />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>❄</Text>
              <Text style={styles.emptyTitle}>No Debts Added</Text>
              <Text style={styles.emptyDesc}>
                Add your debts to generate a snowball payoff projection.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['5xl'],
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    paddingTop: spacing['3xl'],
    marginBottom: spacing.xl,
  },
  summaryCard: {
    marginBottom: spacing['3xl'],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.labelSmall,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  summaryValue: {
    ...typography.titleLarge,
    color: colors.text.primary,
  },
  goldText: {
    color: colors.accent.gold,
  },
  projectionRow: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.primary,
    alignItems: 'center',
  },
  projectionLabel: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
  },
  sectionTitle: {
    ...typography.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  empty: {
    padding: spacing['5xl'],
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.headlineMedium,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
});
