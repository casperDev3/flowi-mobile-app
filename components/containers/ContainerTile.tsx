import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

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
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={2}>{con.name}</Text>
      {placeLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
          <IconSymbol name="location.fill" size={10} color={c.sub} />
          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>{placeLabel}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(con.id)} accessibilityRole="button"
      accessibilityLabel={`${con.name}${placeLabel ? `, ${placeLabel}` : ''}, ${itemsCount(tr, stats.count, lang)}`}
      accessibilityState={{ selected }}>
      {/* Товщина рамки НЕ змінюється від вибору: інакше вміст плитки сіпався б. */}
      <View style={{ width, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: selected ? color : color + '35' }}>
        {hasCover ? (
          <View>
            <MediaImage asset={cover} style={{ width: '100%', height: 96 }} pendingLabel={tr.ctrPhotoPending} placeholderColor={color + '20'} />
            <View style={{ height: 3, backgroundColor: color }} />
            <View style={{ paddingTop: 10, paddingHorizontal: 14, paddingBottom: 8 }}>{title}</View>
          </View>
        ) : (
          <LinearGradient colors={[color + '30', color + '10']} style={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: color + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <IconSymbol name="shippingbox.fill" size={20} color={color} />
            </View>
            {title}
          </LinearGradient>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: selected ? color + '22' : c.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
              {stats.count > 0 ? itemsCount(tr, stats.count, lang) : tr.ctrEmptyBox}
            </Text>
            {stats.lent ? (
              <Text style={{ color: c.text, fontSize: 11, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                <Text style={{ color: '#F59E0B' }}>● </Text>{fill(tr.ctrLentCount, { n: stats.lent })}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: color + '25', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.right" size={11} color={color} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});
