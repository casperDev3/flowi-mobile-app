/**
 * components/layout-zones/ZoneStates.tsx — стани зони (Layout System v2.4).
 *
 * Кожна зона показує власний стан і НЕ блокує сусідні: поки статична зона
 * вантажиться, список уже працює; помилка панелі деталей не ховає список.
 *
 *   <ZoneSkeleton variant="list|columns|details|static" rows? />
 *       скелет у формі вмісту (рядки списку / колонки дошки / картка деталей)
 *   <ZoneEmpty icon? title caption? actionLabel? onAction? />
 *       пояснення + ОДНА головна дія; для панелі деталей — <ZoneEmpty details />
 *       («Виберіть запис»)
 *   <ZoneError message? onRetry />
 *       зрозумілий текст + «Повторити» всередині зони
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { EmptyState } from '@/components/ds/EmptyState';
import { PillButton } from '@/components/ds/PillButton';
import { Skeleton } from '@/components/ds/Skeleton';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { radius, space, type } from '@/constants/theme';

import { useZoneStrings } from './strings';

export type ZoneSkeletonVariant = 'list' | 'columns' | 'details' | 'static';

export function ZoneSkeleton({ variant = 'list', rows = 6, style }: {
  variant?: ZoneSkeletonVariant;
  rows?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useDSTheme();
  const s = useZoneStrings();
  const card = { backgroundColor: t.surface.card, borderRadius: radius.card };
  let body: React.ReactNode;
  if (variant === 'columns') {
    body = (
      <View style={st.colsRow}>
        {[0, 1, 2].map(c => (
          <View key={c} style={[st.col, card]}>
            <Skeleton width="50%" height={14} />
            {[0, 1, 2].map(i => <Skeleton key={i} height={64} radius={radius.nested} />)}
          </View>
        ))}
      </View>
    );
  } else if (variant === 'details') {
    body = (
      <View style={{ gap: space[3] }}>
        <Skeleton width="70%" height={22} />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {[0, 1, 2].map(i => <Skeleton key={i} width={84} height={32} radius={radius.pill} />)}
        </View>
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={14} width={i % 2 ? '85%' : '100%'} />)}
      </View>
    );
  } else if (variant === 'static') {
    body = (
      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={[st.kpi, card]}><Skeleton width="40%" height={28} /><Skeleton width="60%" height={12} /></View>
          <View style={[st.kpi, card]}><Skeleton width="40%" height={28} /><Skeleton width="60%" height={12} /></View>
        </View>
        {[0, 1, 2, 3].map(i => <View key={i} style={[st.row, card]}><Skeleton width="65%" height={14} /><Skeleton width="35%" height={11} /></View>)}
      </View>
    );
  } else {
    body = (
      <View style={{ gap: space[2] }}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={[st.row, card, { flexDirection: 'row', alignItems: 'center', gap: space[3] }]}>
            <Skeleton width={22} height={22} radius={11} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width={i % 3 === 1 ? '55%' : '75%'} height={14} />
              <Skeleton width="35%" height={11} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={s.loading}
      accessibilityState={{ busy: true }}>
      {body}
    </View>
  );
}

export function ZoneEmpty({
  details, icon, title, caption, actionLabel, onAction, actionTestID, testID, style,
}: {
  /** Порожня панель деталей: «Виберіть запис». */
  details?: boolean;
  icon?: IconSymbolName;
  title?: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useZoneStrings();
  return (
    <EmptyState
      icon={icon ?? (details ? 'sidebar.left' : 'tray')}
      title={title ?? (details ? s.selectRecord : '')}
      caption={caption ?? (details ? s.selectRecordHint : undefined)}
      actionLabel={actionLabel}
      onAction={onAction}
      actionTestID={actionTestID}
      testID={testID}
      style={style}
    />
  );
}

export function ZoneError({ title, message, onRetry, testID, style }: {
  title?: string;
  message?: string;
  onRetry: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useDSTheme();
  const s = useZoneStrings();
  return (
    <View testID={testID} accessibilityRole="alert" style={[st.error, style]}>
      <IconSymbol name="exclamationmark.triangle.fill" size={26} color={t.status.danger} />
      <Text style={[type.h2, { color: t.text.primary, textAlign: 'center' }]}>{title ?? s.loadFailed}</Text>
      {message ? <Text style={[type.body, { color: t.text.secondary, textAlign: 'center', maxWidth: 320 }]}>{message}</Text> : null}
      <PillButton label={s.retry} icon="arrow.clockwise" onPress={onRetry} variant="primary" size="sm" />
    </View>
  );
}

const st = StyleSheet.create({
  row: { padding: space[4], gap: 8 },
  kpi: { flex: 1, padding: space[4], gap: 8 },
  colsRow: { flexDirection: 'row', gap: space[3] },
  col: { flex: 1, padding: space[3], gap: space[2] },
  error: { alignItems: 'center', justifyContent: 'center', gap: space[3], paddingVertical: space[10], paddingHorizontal: space[6] },
});
