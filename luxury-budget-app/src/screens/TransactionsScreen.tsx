import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, spacing } from '../theme';
import { TransactionRow, RecategorizeModal } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { formatDate } from '../lib/format';
import type { Category, Transaction } from '../types';

export function TransactionsScreen() {
  const userId = useAppStore((s) => s.userId);
  const [recatTx, setRecatTx] = useState<Transaction | null>(null);

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['allTransactions', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, categories(name, icon)')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId);
      return (data ?? []) as Category[];
    },
    enabled: !!userId,
  });

  // Group by date for SectionList
  const sections = useMemo(() => {
    if (!transactions) return [];
    const grouped = new Map<string, (typeof transactions)[0][]>();

    for (const tx of transactions) {
      const key = tx.date;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(tx);
    }

    return Array.from(grouped.entries()).map(([date, data]) => ({
      title: formatDate(date),
      data,
    }));
  }, [transactions]);

  const handleRecategorize = async (newCategoryId: string, createRule: boolean) => {
    if (!recatTx) return;

    await supabase
      .from('transactions')
      .update({
        category_id: newCategoryId,
        categorization_source: 'manual',
      })
      .eq('id', recatTx.id);

    if (createRule && recatTx.merchant_name) {
      await supabase.from('rules').insert({
        user_id: userId,
        match_type: 'merchant_exact',
        match_value: recatTx.merchant_name,
        category_id: newCategoryId,
        priority: 0,
      });
    }

    setRecatTx(null);
  };

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Transactions</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow
            merchantName={item.merchant_name}
            name={item.name}
            amount={item.amount}
            date={item.date}
            categoryName={item.categories?.name ?? null}
            categoryIcon={item.categories?.icon}
            pending={item.pending}
            onPress={() => setRecatTx(item as unknown as Transaction)}
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                No transactions yet. Connect your bank to start tracking.
              </Text>
            </View>
          ) : null
        }
      />

      <RecategorizeModal
        visible={!!recatTx}
        onClose={() => setRecatTx(null)}
        onSelect={handleRecategorize}
        categories={categories ?? []}
        merchantName={recatTx?.merchant_name || recatTx?.name || ''}
        currentCategoryId={recatTx?.category_id}
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
    paddingBottom: spacing['5xl'],
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
  },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg.primary,
  },
  sectionTitle: {
    ...typography.labelMedium,
    color: colors.text.muted,
  },
  empty: {
    padding: spacing['5xl'],
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.lg,
  },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
