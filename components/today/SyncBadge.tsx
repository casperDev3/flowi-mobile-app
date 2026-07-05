import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Radius } from '@/constants/tokens';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';
import { useSync } from '@/store/sync-engine';

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
  const isDark = useColorScheme() === 'dark';
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
    const offlineSubColor = isDark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)';
    const offlineBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
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
        style={[s.pill, { backgroundColor: '#7C3AED18' }]}
        accessibilityRole="button"
        accessibilityLabel="Синхронізація…">
        <ActivityIndicator size="small" color="#7C3AED" style={{ transform: [{ scale: 0.7 }] }} />
        <Text style={[s.text, { color: '#7C3AED', marginLeft: 4 }]}>Синхр…</Text>
      </TouchableOpacity>
    );
  }

  // ── Помилка ──────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: '#F59E0B18' }]}
        accessibilityRole="button"
        accessibilityLabel={tr.syncError}>
        <IconSymbol name="exclamationmark.triangle" size={12} color="#F59E0B" />
        <Text style={[s.text, { color: '#F59E0B', marginLeft: 4 }]}>{tr.syncError}</Text>
      </TouchableOpacity>
    );
  }

  // ── Конфлікти ──────────────────────────────────────────────────────────────
  if (conflictsCount > 0) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: '#EF444418' }]}
        accessibilityRole="button"
        accessibilityLabel={`${conflictsCount} ${tr.syncConflictsCount}`}>
        <View style={[s.badge, { backgroundColor: '#EF4444' }]}>
          <Text style={s.badgeText}>{conflictsCount}</Text>
        </View>
        <Text style={[s.text, { color: '#EF4444', marginLeft: 4 }]}>{tr.syncConflictsCount}</Text>
      </TouchableOpacity>
    );
  }

  // ── Очікує синхронізації (idle + pendingCount > 0) ───────────────────────
  if (pendingCount > 0 && state === 'idle') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.pill, { backgroundColor: '#D9770618' }]}
        accessibilityRole="button"
        accessibilityLabel={`${pendingCount} ${tr.syncPending}`}>
        <IconSymbol name="arrow.triangle.2.circlepath" size={12} color="#D97706" />
        <Text style={[s.text, { color: '#D97706', marginLeft: 4 }]}>{pendingCount} {tr.syncPending}</Text>
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
      <Text style={[s.text, { color: '#10B981' }]}>
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
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
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
    fontWeight: '800',
  },
});
