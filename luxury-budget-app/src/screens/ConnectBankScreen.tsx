import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { colors, typography, spacing } from '../theme';
import { LuxuryButton, LuxuryCard, ScreenContainer } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

interface ConnectBankScreenProps {
  onComplete: () => void;
}

export function ConnectBankScreen({ onComplete }: ConnectBankScreenProps) {
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState(false);
  const userId = useAppStore((s) => s.userId);

  const handleConnectBank = async () => {
    setLoading(true);
    try {
      // Step 1: Get link token from our edge function
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const linkRes = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/plaid-link`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const linkData = await linkRes.json();

      if (linkData.link_token) {
        // In a real app, this would open the Plaid Link SDK.
        // For sandbox/MVP, we'll simulate a successful connection.
        Alert.alert(
          'Plaid Link',
          'In production, this opens the Plaid Link SDK to connect your bank securely.\n\nFor sandbox testing, tap "Simulate Connection" below.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Simulate Connection',
              onPress: () => simulatePlaidConnection(token!),
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Could not create bank link. Check your Supabase/Plaid configuration.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to initiate bank connection.');
    }
    setLoading(false);
  };

  const simulatePlaidConnection = async (token: string) => {
    setLoading(true);
    try {
      // In sandbox, exchange a test public token
      const exchangeRes = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/plaid-exchange`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_token: 'public-sandbox-test-token',
          }),
        }
      );

      const exchangeData = await exchangeRes.json();
      if (exchangeData.success) {
        setLinked(true);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to link account.');
    }
    setLoading(false);
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Connect Your Bank</Text>
          <Text style={styles.subtitle}>
            Link your accounts to automatically track spending and sync
            transactions in real-time.
          </Text>
        </View>

        <LuxuryCard variant="elevated" style={styles.featureCard}>
          <Text style={styles.featureIcon}>🏦</Text>
          <Text style={styles.featureTitle}>Secure Bank Sync</Text>
          <Text style={styles.featureDesc}>
            Powered by Plaid. Bank-grade encryption. We never see your
            credentials.
          </Text>
        </LuxuryCard>

        <LuxuryCard style={styles.featureCard}>
          <Text style={styles.featureIcon}>🔄</Text>
          <Text style={styles.featureTitle}>Auto Categorization</Text>
          <Text style={styles.featureDesc}>
            Transactions are automatically categorized into your envelopes
            using intelligent merchant matching.
          </Text>
        </LuxuryCard>

        <LuxuryCard style={styles.featureCard}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureTitle}>6-Month Backfill</Text>
          <Text style={styles.featureDesc}>
            Get instant insight with up to 6 months of historical
            transaction data imported on connect.
          </Text>
        </LuxuryCard>

        <View style={styles.actions}>
          {linked ? (
            <LuxuryButton
              title="Continue"
              onPress={onComplete}
              size="lg"
              style={styles.mainBtn}
            />
          ) : (
            <>
              <LuxuryButton
                title="Connect Bank Account"
                onPress={handleConnectBank}
                loading={loading}
                size="lg"
                style={styles.mainBtn}
              />
              <LuxuryButton
                title="Skip for now"
                onPress={handleSkip}
                variant="ghost"
                size="sm"
              />
            </>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing['5xl'],
  },
  header: {
    marginBottom: spacing['3xl'],
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  featureCard: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: spacing.md,
  },
  featureTitle: {
    ...typography.titleMedium,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  featureDesc: {
    ...typography.bodySmall,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    marginTop: spacing['2xl'],
    alignItems: 'center',
  },
  mainBtn: {
    width: '100%',
    marginBottom: spacing.lg,
  },
});
