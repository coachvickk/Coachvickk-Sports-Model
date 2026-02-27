import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { LuxuryButton, LuxuryCard, LuxuryInput, ScreenContainer } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import type { SnowballMode } from '../types';

export function SettingsScreen() {
  const { profile, snowballMode, setSnowballMode, userId } = useAppStore();
  const { signOut } = useAuth();
  const [reserve, setReserve] = useState(
    String(profile?.protected_reserve ?? 0)
  );

  const handleModeChange = async (mode: SnowballMode) => {
    setSnowballMode(mode);
    if (userId) {
      await supabase
        .from('users_profile')
        .update({ snowball_mode: mode })
        .eq('id', userId);
    }
  };

  const handleSaveReserve = async () => {
    const amount = parseFloat(reserve) || 0;
    if (userId) {
      await supabase
        .from('users_profile')
        .update({ protected_reserve: amount })
        .eq('id', userId);
    }
    Alert.alert('Saved', `Protected reserve set to $${amount.toFixed(2)}`);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const modes: { id: SnowballMode; label: string }[] = [
    { id: 'hard', label: 'Hard' },
    { id: 'flexible', label: 'Flexible' },
    { id: 'hybrid', label: 'Hybrid' },
  ];

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <LuxuryCard style={styles.section}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.fieldValue}>{profile?.email ?? '—'}</Text>
        </LuxuryCard>

        {/* Snowball Mode */}
        <Text style={styles.sectionLabel}>SNOWBALL MODE</Text>
        <LuxuryCard style={styles.section}>
          <View style={styles.modeRow}>
            {modes.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => handleModeChange(m.id)}
                style={[
                  styles.modePill,
                  snowballMode === m.id && styles.modePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.modePillText,
                    snowballMode === m.id && styles.modePillTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </LuxuryCard>

        {/* Protected Reserve */}
        <Text style={styles.sectionLabel}>PROTECTED RESERVE</Text>
        <LuxuryCard style={styles.section}>
          <Text style={styles.reserveDesc}>
            Amount kept aside from allocatable funds as a safety buffer.
          </Text>
          <View style={styles.reserveRow}>
            <LuxuryInput
              value={reserve}
              onChangeText={setReserve}
              keyboardType="decimal-pad"
              placeholder="0.00"
              containerStyle={styles.reserveInput}
            />
            <LuxuryButton
              title="Save"
              onPress={handleSaveReserve}
              variant="secondary"
              size="sm"
            />
          </View>
        </LuxuryCard>

        {/* Sync */}
        <Text style={styles.sectionLabel}>DATA</Text>
        <LuxuryCard style={styles.section}>
          <LuxuryButton
            title="Sync Transactions"
            onPress={async () => {
              const { data: session } = await supabase.auth.getSession();
              const token = session?.session?.access_token;
              if (!token) return;

              const res = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/plaid-sync`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              const data = await res.json();
              if (data.success) {
                Alert.alert(
                  'Synced',
                  `${data.added} added, ${data.modified} modified, ${data.removed} removed`
                );
              }
            }}
            variant="secondary"
            size="md"
            style={styles.actionBtn}
          />
        </LuxuryCard>

        {/* Sign Out */}
        <LuxuryButton
          title="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          size="md"
          style={styles.signOutBtn}
        />

        <Text style={styles.version}>Luxury Budget v1.0.0</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing['3xl'],
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing['3xl'],
  },
  sectionLabel: {
    ...typography.labelMedium,
    color: colors.text.muted,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  section: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  fieldValue: {
    ...typography.bodyLarge,
    color: colors.text.primary,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modePill: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.tertiary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  modePillActive: {
    backgroundColor: colors.accent.goldMuted,
    borderColor: colors.accent.gold,
  },
  modePillText: {
    ...typography.labelMedium,
    color: colors.text.tertiary,
  },
  modePillTextActive: {
    color: colors.accent.gold,
  },
  reserveDesc: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  reserveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  reserveInput: {
    flex: 1,
    marginBottom: 0,
  },
  actionBtn: {
    width: '100%',
  },
  signOutBtn: {
    marginTop: spacing['3xl'],
  },
  version: {
    ...typography.bodySmall,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
