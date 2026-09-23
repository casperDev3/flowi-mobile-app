/**
 * components/projects/ProjectSyncIndicator.tsx — компактний стан обміну
 * ОДНОГО проєкту в шапці його розділів.
 *
 * Три стани, і всі три — відповідь на питання «чи те, що я бачу, свіже?»:
 *  · офлайн-режим — обміну не буде взагалі, і це нормально (свідомий вибір
 *    користувача), тож сірий значок без тривоги;
 *  · обмін іде — спінер;
 *  · обмін завершився — час останнього успішного обміну.
 *
 * Тап — примусовий обмін (`refreshProjectNow`), той самий, що й
 * pull-to-refresh: значок, який показує «оновлено 12:03», мусить давати
 * спосіб оновити зараз, а не лише констатувати.
 *
 * Стан живе в `store/project-sync.ts` модульним кешем (його пише сам обмін,
 * у тому числі з фонових шляхів поза React), тож читаємо через
 * `useSyncExternalStore`, а не через контекст.
 */
import React, { useCallback, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius } from '@/constants/tokens';
import { useAppMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';
import { getProjectSyncStatus, refreshProjectNow, subscribeProjectSyncStatus } from '@/store/project-sync';

export const PROJECT_SYNC_HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 } as const;

export function ProjectSyncIndicator({
  projectId,
  accent,
  subColor,
  dimColor,
}: {
  projectId: string;
  accent: string;
  /** Колір вторинного тексту екрана (`projectShellColors().sub`) — WCAG AA. */
  subColor: string;
  /** Тло значка (`projectShellColors().dim`). */
  dimColor: string;
}) {
  const { online } = useAppMode();
  const { tr, lang } = useI18n();

  const status = useSyncExternalStore(
    subscribeProjectSyncStatus,
    useCallback(() => getProjectSyncStatus(projectId), [projectId]),
  );

  const onPress = useCallback(() => {
    void refreshProjectNow(projectId).catch(e => {
      if (__DEV__) console.warn('[project-sync] ручний обмін не вдався:', e);
    });
  }, [projectId]);

  if (!online) {
    return (
      <View
        style={[s.pill, { backgroundColor: dimColor }]}
        accessibilityRole="text"
        accessibilityLabel={tr.offlineBadge}>
        <IconSymbol name="icloud.slash" size={12} color={subColor} />
        <Text style={[s.text, { color: subColor }]}>{tr.offlineBadge}</Text>
      </View>
    );
  }

  if (status.phase === 'syncing') {
    return (
      <View
        style={[s.pill, { backgroundColor: accent + '18' }]}
        accessibilityRole="text"
        accessibilityLabel={tr.syncingShort}>
        <ActivityIndicator size="small" color={accent} style={s.spinner} />
        <Text style={[s.text, { color: accent }]}>{tr.syncingShort}</Text>
      </View>
    );
  }

  const time = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={PROJECT_SYNC_HIT_SLOP}
      style={[s.pill, { backgroundColor: dimColor }]}
      accessibilityRole="button"
      accessibilityLabel={time ? `${tr.lastSyncAt}: ${time}` : tr.syncNow}>
      {time ? (
        <>
          <View style={[s.dot, { backgroundColor: '#10B981' }]} />
          <Text style={[s.text, { color: subColor }]}>{time}</Text>
        </>
      ) : (
        // Ще жодного успішного обміну в цьому сеансі — підпису немає навмисно:
        // «Синхронізувати зараз» у пілюлі шапки з'їдає рядок із заголовком.
        // Скрінрідер його отримує через accessibilityLabel вище.
        <IconSymbol name="arrow.triangle.2.circlepath" size={12} color={subColor} />
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.xxl,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 24,
  },
  // Спінер RN менший за 12pt не робиться — зменшуємо трансформом, як у
  // components/today/SyncBadge.tsx.
  spinner: { transform: [{ scale: 0.7 }] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '700' },
});
