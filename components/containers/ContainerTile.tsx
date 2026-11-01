import { fontFamily, radius, shadow, type as dsType } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { containerColor, type Container, type ContainerStats, type MediaAsset } from '@/utils/containers';

import { fill, itemsCount } from './i18n';
import { MediaImage } from './MediaImage';
import type { ContainersColors } from './theme';

/**
 * Плитка коробки: обкладинка (перше фото) замість градієнта, лічильник
 * речей і бейдж «N позичено» (§8.1). Мемоізована: у сітці на сотні коробок
 * кожен символ у пошуку інакше переганяв би всі плитки.
 */
export const ContainerTile = React.memo(function ContainerTile({
  container: con, stats, placeLabel, cover, width, selected, c, onPress,
}: {
  container: Container;
  stats: ContainerStats;
  placeLabel: string;
  cover?: MediaAsset;
  width: number;
  selected: boolean;
  c: ContainersColors;
  onPress: (id: string) => void;
}) {
  const { tr, lang } = useI18n();
  const color = containerColor(con.color);
  const hasCover = !!con.photoIds?.length;
  const title = (
    <>
      <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, letterSpacing: -0.2 }} numberOfLines={2}>{con.name}</Text>
      {placeLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
          <IconSymbol name="location.fill" size={10} color={c.sub} />
          <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium, flexShrink: 1 }} numberOfLines={1}>{placeLabel}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(con.id)} accessibilityRole="button"
      accessibilityLabel={`${con.name}${placeLabel ? `, ${placeLabel}` : ''}, ${itemsCount(tr, stats.count, lang)}`}
      accessibilityState={{ selected }}
      style={{ borderRadius: radius.cardCompact, ...shadow[c.isDark ? 'dark' : 'light'].card }}>
      {/* Omni (DS v2.2): суцільна bento-плитка (surface.card + м'яка тінь), не скло.
          Товщина рамки НЕ змінюється від вибору (прозора 2px у спокої): інакше вміст плитки сіпався б. */}
      <View style={{ width, borderRadius: radius.cardCompact, overflow: 'hidden', backgroundColor: c.t.surface.card,
        borderWidth: 2, borderColor: selected ? color : 'transparent' }}>
        {hasCover ? (
          <View>
            <MediaImage asset={cover} style={{ width: '100%', height: 96 }} pendingLabel={tr.ctrPhotoPending} placeholderColor={color + '20'} />
            <View style={{ height: 3, backgroundColor: color }} />
            <View style={{ paddingTop: 10, paddingHorizontal: 14, paddingBottom: 8 }}>{title}</View>
          </View>
        ) : (
          <View style={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color + '24', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <IconSymbol name="shippingbox.fill" size={20} color={color} />
            </View>
            {title}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          paddingHorizontal: 14, paddingVertical: 10,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border,
          backgroundColor: selected ? color + '1A' : 'transparent' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, ...dsType.numeric }} numberOfLines={1}>
              {stats.count > 0 ? itemsCount(tr, stats.count, lang) : tr.ctrEmptyBox}
            </Text>
            {stats.lent ? (
              <Text style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.semibold, marginTop: 2, ...dsType.numeric }} numberOfLines={1}>
                <Text style={{ color: c.t.status.warning }}>● </Text>{fill(tr.ctrLentCount, { n: stats.lent })}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 22, height: 22, borderRadius: radius.pill, backgroundColor: color + '25', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.right" size={11} color={color} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});
