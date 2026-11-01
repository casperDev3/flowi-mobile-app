/**
 * components/finance/OperationsSummary.tsx — плашки над стрічкою «Операцій»:
 * попередження про операції без рахунку й чип фільтра за рахунком.
 *
 * 11.2026 (рішення власника): картку «Залишки» прибрано. Та сама цифра —
 * «На рахунках» по кожній валюті (utils/financeOverview.ts) з «Перенесено з
 * минулого» під нею — тепер великий KPI під заголовком «Фінанси» (шапка
 * екрана, app/(tabs)/explore.tsx). Тут лишились лише плашки, що стосуються
 * самої стрічки. Курсів немає, тож суми «≈ усього» між валютами немає свідомо.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useI18n } from '@/store/i18n';

export interface OperationsNoticesProps {
  /** Текст попередження про операції без рахунку; null — попередження немає. */
  unassignedLabel?: string | null;
  unassignedActive?: boolean;
  onPressUnassigned?: () => void;
  /** Назва рахунку, яким зараз відфільтровано стрічку; null — фільтра немає. */
  accountFilterName?: string | null;
  onClearAccountFilter?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Основна валюта першою, решта — за абеткою. */
export function orderCurrencies(codes: readonly string[], primary: string): string[] {
  return [...codes].sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.localeCompare(b)));
}

export function OperationsNotices({
  unassignedLabel, unassignedActive, onPressUnassigned,
  accountFilterName, onClearAccountFilter, style,
}: OperationsNoticesProps) {
  const { t } = useDS();
  const { tr } = useI18n();
  if (!unassignedLabel && !accountFilterName) return null;

  return (
    <View style={style}>
      {unassignedLabel ? (
        <TouchableOpacity
          onPress={onPressUnassigned}
          accessibilityRole="button"
          accessibilityState={{ selected: !!unassignedActive }}
          accessibilityLabel={unassignedLabel}
          style={[st.warn, { backgroundColor: unassignedActive ? t.action.primary : t.surface.card }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color={t.status.warning} />
          <Text style={{ color: unassignedActive ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.medium, flex: 1 }}>{unassignedLabel}</Text>
          <IconSymbol name={unassignedActive ? 'xmark' : 'chevron.right'} size={12} color={unassignedActive ? t.text.onAction : t.text.secondary} />
        </TouchableOpacity>
      ) : null}

      {accountFilterName ? (
        <TouchableOpacity
          onPress={onClearAccountFilter}
          accessibilityRole="button"
          accessibilityLabel={`${tr.finAccountFilterChip.replace('{name}', accountFilterName)}. ${tr.resetFilter}`}
          style={[st.chip, { backgroundColor: t.action.primary }]}>
          <IconSymbol name="creditcard.fill" size={12} color={t.text.onAction} />
          <Text numberOfLines={1} style={{ color: t.text.onAction, fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 }}>
            {tr.finAccountFilterChip.replace('{name}', accountFilterName)}
          </Text>
          <IconSymbol name="xmark" size={12} color={t.text.onAction} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, marginTop: 12, maxWidth: '100%' },
});
