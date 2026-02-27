import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { formatCurrency } from '../lib/format';
import { LuxuryCard } from './LuxuryCard';

interface EnvelopeCardProps {
  name: string;
  icon: string;
  allocated: number;
  remaining: number;
  isProtected?: boolean;
  isSnowball?: boolean;
  onPress?: () => void;
}

export function EnvelopeCard({
  name,
  icon,
  allocated,
  remaining,
  isProtected = false,
  isSnowball = false,
  onPress,
}: EnvelopeCardProps) {
  const spent = allocated - remaining;
  const percentUsed = allocated > 0 ? (spent / allocated) * 100 : 0;
  const isLow = percentUsed > 75;
  const isEmpty = remaining <= 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <LuxuryCard
        variant={isSnowball ? 'accent' : 'default'}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.iconRow}>
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{name}</Text>
              {isProtected && (
                <Text style={styles.badge}>PROTECTED</Text>
              )}
              {isSnowball && (
                <Text style={[styles.badge, styles.snowballBadge]}>
                  SNOWBALL
                </Text>
              )}
            </View>
          </View>
          <View style={styles.amountBlock}>
            <Text
              style={[
                styles.remaining,
                isEmpty && styles.remainingEmpty,
                isLow && !isEmpty && styles.remainingLow,
              ]}
            >
              {formatCurrency(remaining)}
            </Text>
            <Text style={styles.allocated}>
              of {formatCurrency(allocated)}
            </Text>
          </View>
        </View>

        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, percentUsed)}%` },
              isLow && styles.barLow,
              isEmpty && styles.barEmpty,
            ]}
          />
        </View>
      </LuxuryCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    ...typography.titleMedium,
    color: colors.text.primary,
  },
  badge: {
    ...typography.labelSmall,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  snowballBadge: {
    color: colors.accent.gold,
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  remaining: {
    ...typography.titleLarge,
    color: colors.text.primary,
  },
  remainingLow: {
    color: colors.semantic.warning,
  },
  remainingEmpty: {
    color: colors.semantic.danger,
  },
  allocated: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
  },
  barTrack: {
    height: 2,
    backgroundColor: colors.border.primary,
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent.goldLight,
    borderRadius: 1,
  },
  barLow: {
    backgroundColor: colors.semantic.warning,
  },
  barEmpty: {
    backgroundColor: colors.semantic.danger,
  },
});
