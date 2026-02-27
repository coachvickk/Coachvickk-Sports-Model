/**
 * Luxury Budget — Typography System
 * Serif headlines (Georgia) paired with modern sans (System).
 * Large type hierarchy with editorial rhythm.
 */

import { Platform, TextStyle } from 'react-native';

const serifFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});

const sansFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const monoFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const typography = {
  // Display — Hero numbers, large remaining balances
  displayLarge: {
    fontFamily: sansFamily,
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '200',
    letterSpacing: -1.5,
  } as TextStyle,

  displayMedium: {
    fontFamily: sansFamily,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '300',
    letterSpacing: -1,
  } as TextStyle,

  displaySmall: {
    fontFamily: sansFamily,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '300',
    letterSpacing: -0.5,
  } as TextStyle,

  // Headlines — Section headers, serif elegance
  headlineLarge: {
    fontFamily: serifFamily,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '400',
    letterSpacing: 0,
  } as TextStyle,

  headlineMedium: {
    fontFamily: serifFamily,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400',
    letterSpacing: 0.15,
  } as TextStyle,

  headlineSmall: {
    fontFamily: serifFamily,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0.15,
  } as TextStyle,

  // Title — Cards, list headers
  titleLarge: {
    fontFamily: sansFamily,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: 0,
  } as TextStyle,

  titleMedium: {
    fontFamily: sansFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.15,
  } as TextStyle,

  titleSmall: {
    fontFamily: sansFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  } as TextStyle,

  // Body
  bodyLarge: {
    fontFamily: sansFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0.25,
  } as TextStyle,

  bodyMedium: {
    fontFamily: sansFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0.25,
  } as TextStyle,

  bodySmall: {
    fontFamily: sansFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0.4,
  } as TextStyle,

  // Label — Buttons, chips, tags
  labelLarge: {
    fontFamily: sansFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,

  labelMedium: {
    fontFamily: sansFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  } as TextStyle,

  labelSmall: {
    fontFamily: sansFamily,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  } as TextStyle,

  // Mono — Numbers, amounts
  mono: {
    fontFamily: monoFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  } as TextStyle,

  monoLarge: {
    fontFamily: monoFamily,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '400',
    letterSpacing: -0.5,
  } as TextStyle,
} as const;

export type Typography = typeof typography;
