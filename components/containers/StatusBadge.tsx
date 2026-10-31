import React from 'react';
import { Text, View } from 'react-native';

import { fontFamily, radius } from '@/constants/theme';
import { useI18n } from '@/store/i18n';
import { STATUS_COLORS, type ItemStatus } from '@/utils/containers';

import { fill, statusLabel } from './i18n';

/**
 * Бейдж статусу. «У коробці» бейджа не має — це норма. Позичена річ
 * підписана «у <кого>», а не місцем коробки: фізично її там немає (§7.1).
 * Текст — основним кольором, статусний колір лише в крапці й тоні тла (контраст).
 */
export function StatusBadge({ status, lentTo, textColor }: { status: ItemStatus; lentTo?: string; textColor: string }) {
  const { tr } = useI18n();
  if (status === 'in_box') return null;
  const color = STATUS_COLORS[status];
  const text = status === 'lent' && lentTo ? fill(tr.ctrLentAt, { name: lentTo }) : statusLabel(tr, status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: color + '1F', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 180 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ color: textColor, fontSize: 11, fontFamily: fontFamily.semibold, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}
