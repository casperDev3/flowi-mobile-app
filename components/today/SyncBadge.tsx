import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Radius } from '@/constants/tokens';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useAppMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';
import { useSync } from '@/store/sync-engine';
import { fontFamily } from '@/constants/theme';
import { glassOf, dsGlass } from '@/components/shared/dsTheme';

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins}хв`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}год`;
  return new Date(ms).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

export function SyncBadge() {
  const { online } = useAppMode();
  const router = useRouter();
  // DS v2: пігулки стану — тонований status.* фон, текст — text.primary для читабельності.
  const { t, isDark } = useDSTheme();
  const syncAccent = dsGlass(isDark).accent.lavender.ink;
  const { tr } = useI18n();
  const { state, lastSyncAt, pendingCount, conflictsCount } = useSync();

  const handlePress = () => {
    if (state === 'error' || conflictsCount > 0) {
      router.push('/sync');
    } else {
      router.push('/(tabs)/settings');
    }
  };

  // ── Офлайн ──────────────────────────────────────────────────────────────────
  if (!online) {
    const offlineSubColor = t.text.secondary;
    const offlineBg = glassOf(t).surfaceSubtle;
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: offlineBg }]}
        accessibilityRole="button"
        accessibilityLabel={tr.offlineBadge}>
        <IconSymbol name="icloud.slash" size={12} color={offlineSubColor} />
        <Text style={[s.text, { color: offlineSubColor, marginLeft: 4 }]}>{tr.offlineBadge}</Text>
      </TouchableOpacity>
    );
  }

  // ── Синхронізується ──────────────────────────────────────────────────────────
  if (state === 'syncing') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: syncAccent + '18' }]}
        accessibilityRole="button"
        accessibilityLabel={tr.sync}>
        <ActivityIndicator size="small" color={syncAccent} style={{ transform: [{ scale: 0.7 }] }} />
        <Text style={[s.text, { color: syncAccent, marginLeft: 4 }]}>Синхр…</Text>
      </TouchableOpacity>
    );
  }

  // ── Помилка ──────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: t.status.warning + '24' }]}
        accessibilityRole="button"
        accessibilityLabel={tr.syncError}>
        <IconSymbol name="exclamationmark.triangle" size={12} color={t.status.warning} />
        <Text style={[s.text, { color: t.text.primary, marginLeft: 4 }]}>{tr.syncError}</Text>
      </TouchableOpacity>
    );
  }

  // ── Конфлікти ──────────────────────────────────────────────────────────────
  if (conflictsCount > 0) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: t.status.danger + '18' }]}
        accessibilityRole="button"
        accessibilityLabel={`${conflictsCount} ${tr.syncConflictsCount}`}>
        <View style={[s.badge, { backgroundColor: t.status.danger }]}>
          <Text style={s.badgeText}>{conflictsCount}</Text>
        </View>
        <Text style={[s.text, { color: t.status.danger, marginLeft: 4 }]}>{tr.syncConflictsCount}</Text>
      </TouchableOpacity>
    );
  }

  // ── Очікує синхронізації (idle + pendingCount > 0) ───────────────────────
  if (pendingCount > 0 && state === 'idle') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: t.status.warning + '24' }]}
        accessibilityRole="button"
        accessibilityLabel={`${pendingCount} ${tr.syncPending}`}>
        <IconSymbol name="arrow.triangle.2.circlepath" size={12} color={t.status.warning} />
        <Text style={[s.text, { color: t.text.primary, marginLeft: 4, fontVariant: ['tabular-nums'] }]}>{pendingCount} {tr.syncPending}</Text>
      </TouchableOpacity>
    );
  }

  // ── Ок — зелена + відносний час ───────────────────────────────────────────
  const timeLabel = lastSyncAt ? fmtRelative(lastSyncAt) : '';
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={s.pill}
      accessibilityRole="button"
      accessibilityLabel={tr.onlineBadge}>
      <View style={s.dot} />
      <Text style={[s.text, { color: t.status.success, fontVariant: ['tabular-nums'] }]}>
        {timeLabel ? timeLabel : tr.onlineBadge}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xxl,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22A55B',
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontFamily: fontFamily.semibold,
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: fontFamily.semibold,
  },
});
