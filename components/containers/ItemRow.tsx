import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { ContainerItem, MediaAsset } from '@/utils/containers';

import { MediaImage } from './MediaImage';
import { StatusBadge } from './StatusBadge';
import type { ContainersColors } from './theme';

export interface ItemRowActions {
  onEdit: (item: ContainerItem) => void;
  onDelete: (item: ContainerItem) => void;
  onQty: (item: ContainerItem, delta: number) => void;
  onLend: (item: ContainerItem) => void;
  onReturn: (item: ContainerItem) => void;
  onDiscard: (item: ContainerItem) => void;
}

function Action({ icon, label, color, onPress, disabled }: {
  icon: 'minus' | 'plus' | 'person.fill' | 'arrow.uturn.backward' | 'archivebox' | 'pencil' | 'xmark';
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <IconSymbol name={icon} size={14} color={color} />
    </TouchableOpacity>
  );
}

/**
 * Рядок речі: назва, ×кількість, бейдж статусу, теги, примітка й дії.
 * Дії — кнопками, а не свайпом: кореневого GestureHandlerRootView в
 * застосунку немає, а кнопки ще й доступні VoiceOver без жестів.
 */
export const ItemRow = React.memo(function ItemRow({
  item, accent, c, cover, actions,
}: {
  item: ContainerItem;
  accent: string;
  c: ContainersColors;
  cover?: MediaAsset;
  actions: ItemRowActions;
}) {
  const { tr } = useI18n();
  const discarded = item.status === 'discarded';
  return (
    <View style={{ borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingTop: 11, paddingBottom: 6, opacity: discarded ? 0.72 : 1 }}>
      <TouchableOpacity onPress={() => actions.onEdit(item)} activeOpacity={0.75} accessibilityRole="button"
        accessibilityLabel={`${tr.ctrEditItem}: ${item.name}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {item.photoIds?.length ? (
          <MediaImage asset={cover} style={{ width: 40, height: 40, borderRadius: 9 }}
            pendingLabel={tr.ctrPhotoPending} placeholderColor={c.dim} />
        ) : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent, marginTop: 6 }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', textDecorationLine: discarded ? 'line-through' : 'none' }}>
              {item.name}
            </Text>
            {item.qty !== 1 ? <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>×{item.qty}</Text> : null}
            <StatusBadge status={item.status} lentTo={item.lentTo} textColor={c.text} />
          </View>
          {item.note ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 3, lineHeight: 17 }}>{item.note}</Text> : null}
          {item.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
              {item.tags.map(tag => (
                <View key={tag} style={{ backgroundColor: accent + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 2 }}>
        {!discarded ? (
          <>
            <Action icon="minus" label={`${tr.ctrQtyLess}: ${item.name}`} color={c.sub}
              disabled={item.qty <= 0} onPress={() => actions.onQty(item, -1)} />
            <Action icon="plus" label={`${tr.ctrQtyMore}: ${item.name}`} color={c.sub} onPress={() => actions.onQty(item, 1)} />
          </>
        ) : null}
        {item.status === 'lent' ? (
          <Action icon="arrow.uturn.backward" label={`${tr.ctrReturned}: ${item.name}`} color={c.sub} onPress={() => actions.onReturn(item)} />
        ) : item.status === 'in_box' ? (
          <Action icon="person.fill" label={`${tr.ctrLend}: ${item.name}`} color={c.sub} onPress={() => actions.onLend(item)} />
        ) : null}
        {discarded ? (
          <Action icon="arrow.uturn.backward" label={`${tr.ctrRestore}: ${item.name}`} color={c.sub} onPress={() => actions.onReturn(item)} />
        ) : (
          <Action icon="archivebox" label={`${tr.ctrDiscard}: ${item.name}`} color={c.sub} onPress={() => actions.onDiscard(item)} />
        )}
        <Action icon="xmark" label={`${tr.delete}: ${item.name}`} color={c.sub} onPress={() => actions.onDelete(item)} />
      </View>
    </View>
  );
});
