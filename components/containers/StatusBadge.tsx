import React from 'react';
import { Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { STATUS_COLORS, type ItemStatus } from '@/utils/containers';

import { fill, statusLabel } from './i18n';

/**
 * Бейдж статусу. «У коробці» бейджа не має — це норма. Позичена річ
 * підписана «у <кого>», а не місцем коробки: фізично її там немає (§7.1).
 * Текст — основним кольором, статусний колір лише в крапці й рамці (контраст).
 */
export function StatusBadge({ status, lentTo, textColor }: { status: ItemStatus; lentTo?: string; textColor: string }) {
  const { tr } = useI18n();
  if (status === 'in_box') return null;
  const color = STATUS_COLORS[status];
  const text = status === 'lent' && lentTo ? fill(tr.ctrLentAt, { name: lentTo }) : statusLabel(tr, status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: color + '80',
      backgroundColor: color + '1F', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 180 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ color: textColor, fontSize: 11, fontWeight: '600', flexShrink: 1 }}>{text}</Text>
    </View>
  );
}
