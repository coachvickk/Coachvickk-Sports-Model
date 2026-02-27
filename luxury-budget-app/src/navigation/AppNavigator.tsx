import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';
import { useAppStore } from '../store';

import {
  OnboardingScreen,
  ConnectBankScreen,
  ModeSelectionScreen,
  HomeScreen,
  CategoryDetailScreen,
  TransactionsScreen,
  DebtsScreen,
  AuditScreen,
  SettingsScreen,
} from '../screens';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Dark luxury navigation theme
const LuxuryTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent.gold,
    background: colors.bg.primary,
    card: colors.bg.secondary,
    text: colors.text.primary,
    border: colors.border.primary,
    notification: colors.accent.gold,
  },
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '◆',
    Transactions: '≡',
    Debts: '❄',
    Activity: '◷',
    Settings: '⚙',
  };

  return (
    <View style={tabStyles.iconContainer}>
      <Text
        style={[
          tabStyles.icon,
          focused && tabStyles.iconFocused,
        ]}
      >
        {icons[label] || '•'}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  icon: {
    fontSize: 18,
    color: colors.text.muted,
  },
  iconFocused: {
    color: colors.accent.gold,
  },
});

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg.secondary,
          borderTopColor: colors.border.primary,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 80,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent.gold,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          ...typography.labelSmall,
          fontSize: 9,
          letterSpacing: 1.2,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Debts" component={DebtsScreen} />
      <Tab.Screen name="Activity" component={AuditScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function OnboardingFlow() {
  const [step, setStep] = useState<'bank' | 'mode' | 'done'>('bank');
  const { setOnboardingComplete } = useAppStore();

  if (step === 'bank') {
    return <ConnectBankScreen onComplete={() => setStep('mode')} />;
  }

  if (step === 'mode') {
    return (
      <ModeSelectionScreen
        onComplete={() => {
          setStep('done');
          setOnboardingComplete(true);
        }}
      />
    );
  }

  return null;
}

export function AppNavigator() {
  const { isAuthenticated, onboardingComplete } = useAppStore();

  return (
    <NavigationContainer theme={LuxuryTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg.primary },
          animation: 'fade',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : !onboardingComplete ? (
          <Stack.Screen name="OnboardingFlow" component={OnboardingFlow} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="CategoryDetail"
              component={CategoryDetailScreen}
              options={{
                headerShown: true,
                headerTitle: '',
                headerBackTitle: 'Back',
                headerStyle: { backgroundColor: colors.bg.primary },
                headerTintColor: colors.accent.gold,
                animation: 'slide_from_right',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
