import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';
import type { AuditEventType } from '../types';

interface AuditRowProps {
  eventType: AuditEventType;
  description: string;
  timestamp: string;
}

const EVENT_ICONS: Record<AuditEventType, string> = {
  rebalance: '⚖',
  overspend: '⚠',
  categorize: '📂',
  rule_created: '📝',
  debt_payoff: '🎉',
  snowball_rollover: '❄',
  envelope_adjust: '✏',
  transaction_sync: '🔄',
  manual_edit: '👤',
};

export function AuditRow({ eventType, description, timestamp }: AuditRowProps) {
  const time = new Date(timestamp);
  const timeStr = time.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{EVENT_ICONS[eventType] || '•'}</Text>
      <View style={styles.content}>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.time}>{timeStr}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.secondary,
  },
  icon: {
    fontSize: 18,
    marginRight: spacing.md,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  description: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  time: {
    ...typography.bodySmall,
    color: colors.text.muted,
    marginTop: 4,
  },
});
