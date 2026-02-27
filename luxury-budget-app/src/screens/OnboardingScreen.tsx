import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';
import { LuxuryButton, LuxuryInput, ScreenContainer } from '../components';
import { useAuth } from '../hooks/useAuth';

export function OnboardingScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signUpWithEmail } = useAuth();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    const { error: authError } = isLogin
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password);

    if (authError) {
      setError(authError.message);
    }
    setLoading(false);
  };

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brandMark}>LB</Text>
          <Text style={styles.title}>Luxury Budget</Text>
          <Text style={styles.subtitle}>
            Financial control,{'\n'}elegantly engineered.
          </Text>
        </View>

        <View style={styles.form}>
          <LuxuryInput
            label="EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <LuxuryInput
            label="PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <LuxuryButton
            title={isLogin ? 'Sign In' : 'Create Account'}
            onPress={handleSubmit}
            loading={loading}
            size="lg"
            style={styles.submitBtn}
          />

          <LuxuryButton
            title={isLogin ? 'Create an account' : 'Already have an account?'}
            onPress={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            variant="ghost"
            size="sm"
          />
        </View>

        <Text style={styles.footer}>
          Top-down envelope budgeting{'\n'}with debt snowball acceleration.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing['5xl'],
  },
  brandMark: {
    ...typography.displayLarge,
    color: colors.accent.gold,
    fontWeight: '100',
    letterSpacing: 8,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    marginBottom: spacing['4xl'],
  },
  error: {
    ...typography.bodySmall,
    color: colors.semantic.danger,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  submitBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  footer: {
    ...typography.bodySmall,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
