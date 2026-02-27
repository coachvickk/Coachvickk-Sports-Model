import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, spacing } from '../theme';
import { AuditRow } from '../components';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import type { AuditEvent } from '../types';

export function AuditScreen() {
  const userId = useAppStore((s) => s.userId);

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['auditEvents', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return (data ?? []) as AuditEvent[];
    },
    enabled: !!userId,
  });

  return (
    <View style={styles.screen}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.accent.gold}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>
              All rebalance events, rule changes, and system actions.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <AuditRow
            eventType={item.event_type}
            description={item.description}
            timestamp={item.created_at}
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                No activity yet. Events will appear here as you use the app.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listContent: {
    paddingBottom: spacing['5xl'],
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
  },
  empty: {
    padding: spacing['5xl'],
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.lg,
  },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
