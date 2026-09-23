/**
 * Бейдж непрочитаних сповіщень (notifications-module.md §11: «таб
 * Налаштування / шапка»). Сам тримає лічильник живим: монтування бейджа —
 * це і є «застосунок хоче знати, скільки непрочитаних», тож повернення з
 * фону й онлайн-режим підтягують число, поки бейдж на екрані.
 *
 * Нуль — нічого не малює (порожнє коло на іконці читається як «щось є»).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/store/i18n';

import { fillTemplate } from './labels';
import { useUnreadNotificationsCount } from './use-notification-center';

interface Props {
  /** `dot` — лише крапка (для щільної іконки таб-бару), `count` — число. */
  variant?: 'count' | 'dot';
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function NotificationBadge({ variant = 'count', style, color = '#EF4444' }: Props) {
  const { tr } = useI18n();
  const count = useUnreadNotificationsCount();
  if (count <= 0) return null;
  const label = fillTemplate(tr.ncBadgeA11y, { count });
  if (variant === 'dot') {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[styles.dot, { backgroundColor: color }, style]}
      />
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: color }, style]}>
      <Text style={styles.text} allowFontScaling={false}>{formatBadgeCount(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 11, fontWeight: '800' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
