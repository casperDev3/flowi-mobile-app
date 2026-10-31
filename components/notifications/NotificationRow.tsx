import { Atlas } from '@/constants/atlas';
import { fontFamily } from '@/constants/theme';
/**
 * Картка одного сповіщення інбоксу.
 *
 * Непрочитане видно трьома способами одночасно — жирний заголовок, крапка
 * акценту і слово в `accessibilityLabel` — бо лише колір не прочитає ні
 * VoiceOver, ні людина з порушенням кольоросприйняття.
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { InboxItem } from '@/api/notifications';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { dsTheme, glassOf, glassRim } from '@/components/shared/dsTheme';

import { eventLook } from './labels';

export interface NotificationRowColors {
  border: string;
  text: string;
  sub: string;
  accent: string;
  unreadBg: string;
}

interface Props {
  item: InboxItem;
  timeText: string;
  isDark: boolean;
  colors: NotificationRowColors;
  unreadLabel: string;
  archiveLabel: string;
  collapsedText: string | null;
  onOpen: (item: InboxItem) => void;
  onArchive: (item: InboxItem) => void;
  /** Дії під текстом картки (напр. «Прийняти/Відхилити» запрошення в проєкт). */
  footer?: React.ReactNode;
}

export const NotificationRow = React.memo(function NotificationRow({
  item, timeText, isDark, colors, unreadLabel, archiveLabel, collapsedText, onOpen, onArchive, footer,
}: Props) {
  const unread = !item.read_at;
  const look = eventLook(item.category, item.event_type);
  const handleOpen = useCallback(() => onOpen(item), [onOpen, item]);
  const handleArchive = useCallback(() => onArchive(item), [onArchive, item]);
  const meta = [item.project?.name, timeText].filter(Boolean).join(' · ');
  // DS v2: картка — surface.card без рамки й блюру.
  const t = dsTheme(isDark);
  const a11y = [unread ? unreadLabel : null, item.title, item.body, meta].filter(Boolean).join('. ');

  return (
    <View
      style={[styles.card, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }, unread && { backgroundColor: colors.unreadBg }]}>
      <View style={styles.row}>
      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}>
        <View style={[styles.iconBox, { backgroundColor: look.color + '20' }]}>
          <IconSymbol name={look.icon} size={17} color={look.color} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, { color: colors.text, fontFamily: unread ? fontFamily.bold : fontFamily.semibold }]}
              numberOfLines={2}>
              {item.title}
            </Text>
            {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
          </View>
          {item.body ? (
            <Text style={[styles.body, { color: unread ? colors.text : colors.sub }]} numberOfLines={3}>
              {item.body}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.project?.color ? (
              <View style={[styles.projectDot, { backgroundColor: item.project.color }]} />
            ) : null}
            <Text style={[styles.meta, { color: colors.sub }]} numberOfLines={1}>
              {meta}
              {collapsedText ? ` · ${collapsedText}` : ''}
            </Text>
          </View>
        </View>
      </Pressable>
      <TouchableOpacity
        onPress={handleArchive}
        accessibilityRole="button"
        accessibilityLabel={`${archiveLabel}: ${item.title}`}
        style={styles.archiveBtn}>
        <View style={[styles.archiveIcon, { backgroundColor: glassOf(t).surfaceSubtle }]}>
          <IconSymbol name="xmark" size={12} color={colors.sub} />
        </View>
      </TouchableOpacity>
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Atlas.radius.xlarge,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  // Вирівняно з текстом картки: 12 (padding) + 34 (іконка) + 12 (відступ).
  footer: { paddingLeft: 66, paddingRight: 16, paddingBottom: 16 },
  main: { flex: 1, flexDirection: 'row', padding: 16, paddingRight: 4, minHeight: 44 },
  iconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, marginLeft: 12, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontFamily: fontFamily.regular, flex: 1, fontSize: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  body: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  projectDot: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 12, fontFamily: fontFamily.regular, flexShrink: 1, fontVariant: ['tabular-nums'] },
  // Ціль 44×44 власними розмірами, а не hitSlop: кнопка стоїть впритул до
  // краю картки, і hitSlop за межі батька не працює (CLAUDE.md, A11Y-08).
  archiveBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  archiveIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
