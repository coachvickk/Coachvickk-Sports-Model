import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';
import { formatCurrency } from '../lib/format';

interface RemainingDisplayProps {
  remaining: number;
  allocated: number;
  label?: string;
}

export function RemainingDisplay({
  remaining,
  allocated,
  label = 'Remaining',
}: RemainingDisplayProps) {
  const percentUsed = allocated > 0 ? ((allocated - remaining) / allocated) * 100 : 0;
  const isLow = percentUsed > 80;
  const isDanger = percentUsed > 95;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.amount,
          isDanger && styles.amountDanger,
          isLow && !isDanger && styles.amountWarning,
        ]}
      >
        {formatCurrency(remaining)}
      </Text>
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, percentUsed)}%` },
              isDanger && styles.barDanger,
              isLow && !isDanger && styles.barWarning,
            ]}
          />
        </View>
      </View>
      <Text style={styles.subtitle}>
        {formatCurrency(allocated - remaining)} spent of {formatCurrency(allocated)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  label: {
    ...typography.labelMedium,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  amount: {
    ...typography.displayLarge,
    color: colors.text.primary,
  },
  amountWarning: {
    color: colors.semantic.warning,
  },
  amountDanger: {
    color: colors.semantic.danger,
  },
  barContainer: {
    width: '80%',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  barTrack: {
    height: 3,
    backgroundColor: colors.border.primary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent.gold,
    borderRadius: 2,
  },
  barWarning: {
    backgroundColor: colors.semantic.warning,
  },
  barDanger: {
    backgroundColor: colors.semantic.danger,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
  },
});
