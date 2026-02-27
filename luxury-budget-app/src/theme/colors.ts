/**
 * Luxury Budget — Color Palette
 * Dark charcoal base with champagne/gold accents.
 * NYC penthouse × Cartier editorial.
 */

export const colors = {
  // Backgrounds
  bg: {
    primary: '#0D0D0D',
    secondary: '#161616',
    tertiary: '#1C1C1E',
    elevated: '#222224',
    card: '#1A1A1C',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },

  // Text
  text: {
    primary: '#F5F2EE',
    secondary: '#A8A4A0',
    tertiary: '#6B6866',
    inverse: '#0D0D0D',
    muted: '#4A4745',
  },

  // Accent — Champagne / Gold
  accent: {
    gold: '#C9A96E',
    goldLight: '#D4BC8E',
    goldMuted: 'rgba(201, 169, 110, 0.15)',
    goldSubtle: 'rgba(201, 169, 110, 0.08)',
  },

  // Semantic
  semantic: {
    success: '#4CAF7D',
    successMuted: 'rgba(76, 175, 125, 0.12)',
    warning: '#D4A94E',
    warningMuted: 'rgba(212, 169, 78, 0.12)',
    danger: '#C75050',
    dangerMuted: 'rgba(199, 80, 80, 0.12)',
    info: '#5B8FB9',
    infoMuted: 'rgba(91, 143, 185, 0.12)',
  },

  // Borders
  border: {
    primary: 'rgba(245, 242, 238, 0.08)',
    secondary: 'rgba(245, 242, 238, 0.04)',
    accent: 'rgba(201, 169, 110, 0.25)',
  },

  // Utility
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type Colors = typeof colors;
