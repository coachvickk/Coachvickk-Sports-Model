import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, spacing } from '../theme';
import {
  RemainingDisplay,
  TransactionRow,
  RecategorizeModal,
  ScreenContainer,
} from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import type { Category, Transaction } from '../types';

interface CategoryDetailScreenProps {
  route: { params: { categoryId: string; envelopeId: string } };
}

export function CategoryDetailScreen({ route }: CategoryDetailScreenProps) {
  const { categoryId, envelopeId } = route.params;
  const userId = useAppStore((s) => s.userId);
  const [recatTx, setRecatTx] = useState<Transaction | null>(null);

  const { data: envelope } = useQuery({
    queryKey: ['envelope', envelopeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('envelopes')
        .select('*, categories(*)')
        .eq('id', envelopeId)
        .single();
      return data;
    },
    enabled: !!envelopeId,
  });

  const { data: transactions } = useQuery({
    queryKey: ['categoryTransactions', categoryId],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('category_id', categoryId)
        .eq('pending', false)
        .order('date', { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!userId && !!categoryId,
  });

  const { data: allCategories } = useQuery({
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

  const handleRecategorize = async (newCategoryId: string, createRule: boolean) => {
    if (!recatTx) return;

    // Update transaction
    await supabase
      .from('transactions')
      .update({
        category_id: newCategoryId,
        categorization_source: 'manual',
      })
      .eq('id', recatTx.id);

    // Create rule if requested
    if (createRule && recatTx.merchant_name) {
      await supabase.from('rules').insert({
        user_id: userId,
        match_type: 'merchant_exact',
        match_value: recatTx.merchant_name,
        category_id: newCategoryId,
        priority: 0,
      });

      // Log audit
      await supabase.from('audit_events').insert({
        user_id: userId,
        event_type: 'rule_created',
        description: `Created rule: "${recatTx.merchant_name}" → ${allCategories?.find((c) => c.id === newCategoryId)?.name}`,
        metadata: {
          merchant: recatTx.merchant_name,
          category_id: newCategoryId,
          match_type: 'merchant_exact',
        },
      });
    }

    setRecatTx(null);
  };

  const category = envelope?.categories;

  return (
    <View style={styles.screen}>
      <FlatList
        data={transactions ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.categoryIcon}>{category?.icon ?? '📁'}</Text>
              <Text style={styles.categoryName}>{category?.name ?? ''}</Text>
            </View>

            <RemainingDisplay
              remaining={envelope?.remaining ?? 0}
              allocated={envelope?.allocated ?? 0}
            />

            <Text style={styles.sectionTitle}>Transactions</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionRow
            merchantName={item.merchant_name}
            name={item.name}
            amount={item.amount}
            date={item.date}
            categoryName={category?.name ?? null}
            categoryIcon={category?.icon}
            pending={item.pending}
            onPress={() => setRecatTx(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
      />

      <RecategorizeModal
        visible={!!recatTx}
        onClose={() => setRecatTx(null)}
        onSelect={handleRecategorize}
        categories={allCategories ?? []}
        merchantName={recatTx?.merchant_name || recatTx?.name || ''}
        currentCategoryId={categoryId}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  categoryName: {
    ...typography.headlineLarge,
    color: colors.text.primary,
  },
  sectionTitle: {
    ...typography.headlineSmall,
    color: colors.text.primary,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  empty: {
    padding: spacing['5xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
  },
});
