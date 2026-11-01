import { fontFamily, radius } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { useUiModules, isModuleEnabled } from '@/store/ui-preferences';
import { containerPlaceLabel, selectContainers } from '@/utils/containers';

import { fill } from './i18n';
import { QrScannerModal } from './QrScannerModal';
import { SearchHitRow } from './SearchHitRow';
import { useContainersColors } from './theme';
import { useContainersData } from './useContainersData';

const MAX_RESULTS = 8;

/**
 * Пошук по речах із «Сьогодні» (flowi-web-app/docs/specs/containers.md §7.2):
 * рядок + кнопка сканера. Порожній рядок — нічого не показує; непорожній —
 * результати, згруповані по коробках. Тап відкриває коробку в /containers.
 * Модуль вимкнено в ui_preferences — компонента немає зовсім.
 *
 * Монтується в app/(tabs)/today.tsx під шапкою.
 * `renderResults` дає планшету показати видачу в DetailPane праворуч, лишивши
 * список «Сьогодні» видимим (§7.2, «Планшет»).
 */
export function ContainerSearchPanel({ renderResults }: {
  renderResults?: (results: React.ReactNode | null) => React.ReactNode;
}) {
  const { tr } = useI18n();
  const c = useContainersColors();
  const router = useRouter();
  const { disabledModules } = useUiModules();
  const enabled = isModuleEnabled(disabledModules, 'containers');
  const data = useContainersData();
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);

  const matches = useMemo(
    () => (search.trim() ? selectContainers(data.containers, search, { items: data.items, places: data.places }) : []),
    [data.containers, data.items, data.places, search],
  );

  if (!enabled) return null;

  const open = (id: string) => router.push({ pathname: '/containers', params: { open: id } });

  const results = search.trim() ? (
    <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
      <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium }}>
        {data.status === 'failed' ? tr.ctrReadFailed : matches.length ? fill(tr.ctrFound, { n: matches.length }) : tr.ctrNothingFound}
      </Text>
      {matches.slice(0, MAX_RESULTS).map(match => (
        <SearchHitRow key={match.container.id} match={match} search={search}
          placeLabel={containerPlaceLabel(match.container, data.places)} selected={false} c={c} onPress={open} />
      ))}
      {matches.length > MAX_RESULTS ? (
        <TouchableOpacity onPress={() => router.push({ pathname: '/containers', params: { q: search } })}
          accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.text, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>{tr.ctrQuickSearchOpen}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill,
          paddingHorizontal: 16, minHeight: 44, ...c.gl.card }}>
          <IconSymbol name="magnifyingglass" size={16} color={c.sub} />
          <TextInput placeholder={tr.ctrQuickSearchPlaceholder} placeholderTextColor={c.muted} value={search} onChangeText={setSearch}
            accessibilityLabel={tr.ctrQuickSearchPlaceholder} returnKeyType="search"
            style={{ flex: 1, fontSize: 14, fontFamily: fontFamily.regular, color: c.text, paddingVertical: 10 }} />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={tr.close}
              style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => setScanning(true)} accessibilityRole="button" accessibilityLabel={tr.ctrScan}
          style={{ width: 44, height: 44, borderRadius: radius.pill, ...c.gl.card,
            alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="viewfinder" size={16} color={c.text} />
        </TouchableOpacity>
      </View>

      {renderResults ? renderResults(results) : results ? (
        <ScrollView style={{ maxHeight: 420, marginTop: 10 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {results}
        </ScrollView>
      ) : null}

      <QrScannerModal visible={scanning} containers={data.containers} onClose={() => setScanning(false)}
        onFound={open} onSearch={setSearch} />
    </View>
  );
}
