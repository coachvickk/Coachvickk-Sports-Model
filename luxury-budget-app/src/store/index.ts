import { create } from 'zustand';
import type { SnowballMode, UserProfile } from '../types';

interface AppState {
  // Auth
  userId: string | null;
  session: unknown | null;
  isAuthenticated: boolean;

  // User Profile
  profile: UserProfile | null;
  snowballMode: SnowballMode;

  // Onboarding
  onboardingComplete: boolean;

  // UI
  isLoading: boolean;

  // Actions
  setSession: (session: unknown, userId: string) => void;
  clearSession: () => void;
  setProfile: (profile: UserProfile) => void;
  setSnowballMode: (mode: SnowballMode) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  session: null,
  isAuthenticated: false,
  profile: null,
  snowballMode: 'hybrid',
  onboardingComplete: false,
  isLoading: true,

  setSession: (session, userId) =>
    set({ session, userId, isAuthenticated: true }),

  clearSession: () =>
    set({
      session: null,
      userId: null,
      isAuthenticated: false,
      profile: null,
      onboardingComplete: false,
    }),

  setProfile: (profile) =>
    set({
      profile,
      snowballMode: profile.snowball_mode,
      onboardingComplete: profile.onboarding_complete,
    }),

  setSnowballMode: (mode) => set({ snowballMode: mode }),

  setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),

  setLoading: (loading) => set({ isLoading: loading }),
}));
