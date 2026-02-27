import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { formatCurrency, formatPercent } from '../lib/format';
import { LuxuryCard } from './LuxuryCard';

interface DebtCardProps {
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  dueDay: number;
  isTarget?: boolean;
  isPaidOff?: boolean;
  onPress?: () => void;
}

export function DebtCard({
  name,
  balance,
  apr,
  minimumPayment,
  dueDay,
  isTarget = false,
  isPaidOff = false,
  onPress,
}: DebtCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <LuxuryCard
        variant={isTarget ? 'accent' : 'default'}
        style={[styles.card, isPaidOff && styles.paidOff]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.name}>{name}</Text>
            {isTarget && (
              <Text style={styles.targetLabel}>CURRENT TARGET</Text>
            )}
            {isPaidOff && (
              <Text style={styles.paidOffLabel}>PAID OFF</Text>
            )}
          </View>
          <Text style={[styles.balance, isPaidOff && styles.balancePaidOff]}>
            {formatCurrency(balance)}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>APR</Text>
            <Text style={styles.detailValue}>
              {formatPercent(apr, 1)}
            </Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>MINIMUM</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(minimumPayment)}
            </Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>DUE</Text>
            <Text style={styles.detailValue}>
              {ordinal(dueDay)}
            </Text>
          </View>
        </View>
      </LuxuryCard>
    </TouchableOpacity>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  paidOff: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  name: {
    ...typography.titleMedium,
    color: colors.text.primary,
  },
  targetLabel: {
    ...typography.labelSmall,
    color: colors.accent.gold,
    marginTop: 4,
  },
  paidOffLabel: {
    ...typography.labelSmall,
    color: colors.semantic.success,
    marginTop: 4,
  },
  balance: {
    ...typography.displaySmall,
    color: colors.text.primary,
  },
  balancePaidOff: {
    textDecorationLine: 'line-through',
    color: colors.text.tertiary,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.primary,
  },
  detail: {
    alignItems: 'center',
  },
  detailLabel: {
    ...typography.labelSmall,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.text.secondary,
  },
});
