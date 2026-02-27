import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

interface LuxuryCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'accent';
}

export function LuxuryCard({ children, style, variant = 'default' }: LuxuryCardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'accent' && styles.accent,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.primary,
    ...shadows.sm,
  },
  elevated: {
    backgroundColor: colors.bg.elevated,
    ...shadows.md,
  },
  accent: {
    backgroundColor: colors.bg.card,
    borderColor: colors.border.accent,
    borderWidth: 1,
    ...shadows.gold,
  },
});
