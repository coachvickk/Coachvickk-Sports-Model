import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { LuxuryButton } from './LuxuryButton';
import type { Category } from '../types';

interface RecategorizeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (categoryId: string, createRule: boolean) => void;
  categories: Category[];
  merchantName: string;
  currentCategoryId?: string | null;
}

export function RecategorizeModal({
  visible,
  onClose,
  onSelect,
  categories,
  merchantName,
  currentCategoryId,
}: RecategorizeModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    currentCategoryId ?? null
  );
  const [createRule, setCreateRule] = useState(false);

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId, createRule);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Recategorize</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.merchant}>{merchantName}</Text>

        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          style={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryRow,
                selectedId === item.id && styles.categoryRowSelected,
              ]}
              onPress={() => setSelectedId(item.id)}
            >
              <Text style={styles.categoryIcon}>{item.icon}</Text>
              <Text style={styles.categoryName}>{item.name}</Text>
              {selectedId === item.id && (
                <Text style={styles.check}>✓</Text>
              )}
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity
          style={styles.ruleToggle}
          onPress={() => setCreateRule(!createRule)}
        >
          <View
            style={[styles.checkbox, createRule && styles.checkboxChecked]}
          >
            {createRule && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.ruleText}>
            Always categorize "{merchantName}" this way
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <LuxuryButton
            title="Apply"
            onPress={handleConfirm}
            disabled={!selectedId}
            style={styles.applyBtn}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    paddingTop: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.headlineMedium,
    color: colors.text.primary,
  },
  closeBtn: {
    ...typography.bodyMedium,
    color: colors.accent.gold,
  },
  merchant: {
    ...typography.titleMedium,
    color: colors.text.secondary,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  list: {
    flex: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.secondary,
  },
  categoryRowSelected: {
    backgroundColor: colors.accent.goldSubtle,
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  categoryName: {
    ...typography.bodyLarge,
    color: colors.text.primary,
    flex: 1,
  },
  check: {
    ...typography.titleMedium,
    color: colors.accent.gold,
  },
  ruleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.primary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.text.tertiary,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent.gold,
    borderColor: colors.accent.gold,
  },
  checkboxMark: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: '700',
  },
  ruleText: {
    ...typography.bodyMedium,
    color: colors.text.secondary,
    flex: 1,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  applyBtn: {
    width: '100%',
  },
});
