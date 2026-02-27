import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, spacing } from '../theme';
import { RemainingDisplay, EnvelopeCard, ScreenContainer } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { formatCurrency } from '../lib/format';

export function HomeScreen({ navigation }: { navigation: any }) {
  const userId = useAppStore((s) => s.userId);

  // Fetch active period + envelopes
  const { data: periodData, isLoading, refetch } = useQuery({
    queryKey: ['activePeriod', userId],
    queryFn: async () => {
      const { data: period } = await supabase
        .from('periods')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!period) return null;

      const { data: envelopes } = await supabase
        .from('envelopes')
        .select('*, categories(*)')
        .eq('period_id', period.id)
        .order('categories(priority)', { ascending: true });

      return { period, envelopes: envelopes ?? [] };
    },
    enabled: !!userId,
  });

  // Fetch accounts for balance display
  const { data: accounts } = useQuery({
    queryKey: ['accounts', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const totalBalance = accounts?.reduce(
    (sum, a) => sum + (a.available_balance ?? a.current_balance ?? 0),
    0
  ) ?? 0;

  const period = periodData?.period;
  const envelopes = periodData?.envelopes ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={envelopes}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.accent.gold}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Hero remaining display */}
            <RemainingDisplay
              remaining={period?.total_remaining ?? 0}
              allocated={period?.total_allocatable ?? 0}
              label="Remaining This Period"
            />

            {/* Balance strip */}
            <View style={styles.balanceStrip}>
              <View style={styles.balancePill}>
                <Text style={styles.balanceLabel}>BANK BALANCE</Text>
                <Text style={styles.balanceValue}>
                  {formatCurrency(totalBalance)}
                </Text>
              </View>
              <View style={styles.balancePill}>
                <Text style={styles.balanceLabel}>ALLOCATED</Text>
                <Text style={styles.balanceValue}>
                  {formatCurrency(period?.total_allocated ?? 0)}
                </Text>
              </View>
            </View>

            {/* Section header */}
            <Text style={styles.sectionTitle}>Envelopes</Text>
          </View>
        }
        renderItem={({ item }) => (
          <EnvelopeCard
            name={item.categories?.name ?? 'Unknown'}
            icon={item.categories?.icon ?? '📁'}
            allocated={item.allocated}
            remaining={item.remaining}
            isProtected={item.categories?.is_protected}
            isSnowball={item.categories?.is_snowball}
            onPress={() =>
              navigation.navigate('CategoryDetail', {
                categoryId: item.category_id,
                envelopeId: item.id,
              })
            }
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyTitle}>No Active Period</Text>
              <Text style={styles.emptyDesc}>
                Connect your bank account and set up your first budget period
                to get started.
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
  balanceStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  balancePill: {
    alignItems: 'center',
  },
  balanceLabel: {
    ...typography.labelSmall,
    color: colors.text.muted,
    marginBottom: 4,
  },
  balanceValue: {
    ...typography.titleMedium,
    color: colors.text.secondary,
  },
  sectionTitle: {
    ...typography.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing['5xl'],
    paddingHorizontal: spacing['3xl'],
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
    lineHeight: 22,
  },
});
