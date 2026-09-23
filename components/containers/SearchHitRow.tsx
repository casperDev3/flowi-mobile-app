import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { containerColor, highlight, type ContainerMatch } from '@/utils/containers';

import { itemsCount } from './i18n';
import { StatusBadge } from './StatusBadge';
import type { ContainersColors } from './theme';

/** Текст із підсвіченим збігом — та сама формула `highlight`, що й на вебі. */
export function Highlighted({ text, search, color, style }: {
  text: string;
  search: string;
  color: string;
  style: object;
}) {
  const segments = highlight(text, search);
  return (
    <Text style={style}>
      {segments.map((segment, i) => segment.hit
        ? <Text key={i} style={{ backgroundColor: color + '33', color }}>{segment.text}</Text>
        : <Text key={i}>{segment.text}</Text>)}
    </Text>
  );
}

/**
 * Результат пошуку: картка коробки → знайдені речі всередині (§7.2).
 * Відповідь на «де лежить дріт» — назва коробки, тож вона заголовок картки.
 */
export const SearchHitRow = React.memo(function SearchHitRow({ match, search, placeLabel, selected, c, onPress }: {
  match: ContainerMatch;
  search: string;
  placeLabel: string;
  selected: boolean;
  c: ContainersColors;
  onPress: (containerId: string) => void;
}) {
  const { tr, lang } = useI18n();
  const { container, items, total, byContainer } = match;
  const color = containerColor(container.color);
  const shown = items.slice(0, 4);
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(container.id)} accessibilityRole="button"
      accessibilityLabel={`${container.name}${placeLabel ? `, ${placeLabel}` : ''}`} accessibilityState={{ selected }}>
      <BlurView intensity={c.isDark ? 20 : 38} tint={c.isDark ? 'dark' : 'light'}
        style={{ borderRadius: 14, borderWidth: 1, borderColor: selected ? color : color + '40', padding: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
          <Highlighted text={container.name} search={search} color={color}
            style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '800' }} />
          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>
            {!search.trim() || byContainer ? itemsCount(tr, total, lang) : `${items.length}/${total}`}
          </Text>
        </View>
        {placeLabel ? (
          <Highlighted text={placeLabel} search={search} color={color} style={{ color: c.sub, fontSize: 12, marginTop: 2, marginLeft: 16 }} />
        ) : null}
        {shown.length ? (
          <View style={{ marginTop: 8, gap: 5, marginLeft: 16 }}>
            {shown.map(item => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Highlighted text={item.name} search={search} color={color} style={{ color: c.text, fontSize: 13, fontWeight: '600' }} />
                {item.qty !== 1 ? <Text style={{ color: c.sub, fontSize: 12 }}>×{item.qty}</Text> : null}
                <StatusBadge status={item.status} lentTo={item.lentTo} textColor={c.text} />
                {item.tags.length ? (
                  <Highlighted text={item.tags.map(t => `#${t}`).join(' ')} search={search} color={color}
                    style={{ color: c.sub, fontSize: 11 }} />
                ) : null}
              </View>
            ))}
            {items.length > shown.length ? <Text style={{ color: c.sub, fontSize: 11 }}>+{items.length - shown.length}</Text> : null}
          </View>
        ) : null}
      </BlurView>
    </TouchableOpacity>
  );
});
