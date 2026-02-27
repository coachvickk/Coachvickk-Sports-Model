import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { LuxuryButton, ScreenContainer } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import type { SnowballMode } from '../types';

interface ModeSelectionScreenProps {
  onComplete: () => void;
}

const MODES: { id: SnowballMode; title: string; icon: string; description: string }[] = [
  {
    id: 'hard',
    title: 'Hard Mode',
    icon: '🔒',
    description:
      'Snowball extra is untouchable. Overspending can only pull from discretionary categories. Maximum debt payoff speed.',
  },
  {
    id: 'flexible',
    title: 'Flexible Mode',
    icon: '🔄',
    description:
      'Snowball extra can be reduced when overspending occurs. More forgiving, but slower debt payoff.',
  },
  {
    id: 'hybrid',
    title: 'Hybrid Mode',
    icon: '⚖',
    description:
      'Reduces discretionary categories first, then buffer, then snowball as a last resort. Balanced approach.',
  },
];

export function ModeSelectionScreen({ onComplete }: ModeSelectionScreenProps) {
  const [selected, setSelected] = useState<SnowballMode>('hybrid');
  const [loading, setLoading] = useState(false);
  const { userId, setSnowballMode, setOnboardingComplete } = useAppStore();

  const handleConfirm = async () => {
    setLoading(true);
    setSnowballMode(selected);

    if (userId) {
      await supabase
        .from('users_profile')
        .update({
          snowball_mode: selected,
          onboarding_complete: true,
        })
        .eq('id', userId);
    }

    setOnboardingComplete(true);
    setLoading(false);
    onComplete();
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.title}>Choose Your Mode</Text>
        <Text style={styles.subtitle}>
          This controls how the system handles overspending relative to your
          debt snowball extra payment.
        </Text>

        {MODES.map((mode) => (
          <TouchableOpacity
            key={mode.id}
            onPress={() => setSelected(mode.id)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.modeCard,
                selected === mode.id && styles.modeCardSelected,
              ]}
            >
              <View style={styles.modeHeader}>
                <Text style={styles.modeIcon}>{mode.icon}</Text>
                <Text
                  style={[
                    styles.modeTitle,
                    selected === mode.id && styles.modeTitleSelected,
                  ]}
                >
                  {mode.title}
                </Text>
                {selected === mode.id && (
                  <View style={styles.selectedDot} />
                )}
              </View>
              <Text style={styles.modeDesc}>{mode.description}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <LuxuryButton
          title="Confirm Mode"
          onPress={handleConfirm}
          loading={loading}
          size="lg"
          style={styles.confirmBtn}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing['5xl'],
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing['3xl'],
    lineHeight: 22,
  },
  modeCard: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border.primary,
  },
  modeCardSelected: {
    borderColor: colors.accent.gold,
    backgroundColor: colors.accent.goldSubtle,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modeIcon: {
    fontSize: 22,
    marginRight: spacing.md,
  },
  modeTitle: {
    ...typography.titleMedium,
    color: colors.text.primary,
    flex: 1,
  },
  modeTitleSelected: {
    color: colors.accent.gold,
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.gold,
  },
  modeDesc: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    lineHeight: 18,
    paddingLeft: 36,
  },
  confirmBtn: {
    marginTop: spacing.xl,
  },
});
