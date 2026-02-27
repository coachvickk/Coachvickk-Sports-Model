import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing } from '../theme';
import { formatCurrency, formatDate } from '../lib/format';

interface TransactionRowProps {
  merchantName: string | null;
  name: string;
  amount: number;
  date: string;
  categoryName: string | null;
  categoryIcon?: string;
  pending?: boolean;
  onPress?: () => void;
}

export function TransactionRow({
  merchantName,
  name,
  amount,
  date,
  categoryName,
  categoryIcon,
  pending = false,
  onPress,
}: TransactionRowProps) {
  const displayName = merchantName || name;
  const isInflow = amount < 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.container}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{categoryIcon || '•'}</Text>
      </View>

      <View style={styles.details}>
        <Text style={styles.merchant} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.meta}>
          {categoryName || 'Uncategorized'}
          {pending ? '  ·  Pending' : ''}
        </Text>
      </View>

      <View style={styles.amountBlock}>
        <Text
          style={[
            styles.amount,
            isInflow && styles.amountInflow,
            pending && styles.amountPending,
          ]}
        >
          {isInflow ? '+' : '-'}{formatCurrency(Math.abs(amount))}
        </Text>
        <Text style={styles.date}>{formatDate(date)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.secondary,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 16,
  },
  details: {
    flex: 1,
    marginRight: spacing.md,
  },
  merchant: {
    ...typography.titleSmall,
    color: colors.text.primary,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  amount: {
    ...typography.titleSmall,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  amountInflow: {
    color: colors.semantic.success,
  },
  amountPending: {
    opacity: 0.5,
  },
  date: {
    ...typography.bodySmall,
    color: colors.text.muted,
    marginTop: 2,
  },
});
