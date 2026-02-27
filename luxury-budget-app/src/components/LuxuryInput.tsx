import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

interface LuxuryInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function LuxuryInput({
  label,
  error,
  containerStyle,
  ...props
}: LuxuryInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        {...props}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : undefined,
          props.style,
        ]}
        placeholderTextColor={colors.text.muted}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.labelMedium,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.bodyLarge,
    color: colors.text.primary,
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  inputFocused: {
    borderColor: colors.accent.gold,
  },
  inputError: {
    borderColor: colors.semantic.danger,
  },
  error: {
    ...typography.bodySmall,
    color: colors.semantic.danger,
    marginTop: spacing.xs,
  },
});
