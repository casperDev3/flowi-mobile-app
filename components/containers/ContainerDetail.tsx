import { fontFamily, radius, type as dsType } from '@/constants/theme';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  containerColor,
  containerPlaceLabel,
  containerStats,
  parseTags,
  type Container,
  type ContainerItem,
  type ContainerPlace,
  type MediaAsset,
} from '@/utils/containers';

import { fill, itemsCount } from './i18n';
import { ItemRow, type ItemRowActions } from './ItemRow';
import type { PhotoSource } from './media';
import { PhotoStrip } from './PhotoStrip';
import type { ContainersColors } from './theme';

function HeadButton({ icon, label, onPress, c, danger }: {
  icon: 'viewfinder' | 'pencil' | 'trash' | 'xmark';
  label: string;
  onPress: () => void;
  c: ContainersColors;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
        backgroundColor: danger ? c.t.status.danger + '14' : c.dim }}>
      <IconSymbol name={icon} size={14} color={danger ? c.t.status.danger : c.text} />
    </TouchableOpacity>
  );
}

/**
 * Вміст коробки — однаковий у колонці планшета й у модальному листі
 * телефона (DetailPane відповідає лише за обрамлення): карусель фото,
 * швидке додавання речі, речі з кількістю й статусом, викинуті — під
 * перемикачем. Речі — звичайним map: DetailPane уже загорнув усе в ScrollView.
 */
export function ContainerDetail({
  container, items, places, mediaById, c, actions, onClose, onEdit, onDelete, onQr, onQuickAdd, onAddPhoto, onRemovePhoto, onCoverPhoto,
}: {
  container: Container;
  /** Усі речі коробки, разом із викинутими. */
  items: readonly ContainerItem[];
  places: readonly ContainerPlace[];
  mediaById: ReadonlyMap<string, MediaAsset>;
  c: ContainersColors;
  actions: ItemRowActions;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQr: () => void;
  onQuickAdd: (fields: { name: string; tags: string[]; note?: string }) => void;
  onAddPhoto: (source: PhotoSource) => Promise<void>;
  onRemovePhoto: (id: string) => void;
  onCoverPhoto: (id: string) => void;
}) {
  const { tr, lang } = useI18n();
  const color = containerColor(container.color);
  const place = containerPlaceLabel(container, places);
  const stats = containerStats(items);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const visible = items.filter(item => showDiscarded || item.status !== 'discarded');

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onQuickAdd({ name: trimmed, tags: parseTags(tags), note: note.trim() || undefined });
    setName(''); setTags(''); setNote('');
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, lineHeight: 30, fontFamily: fontFamily.medium }}>{container.name}</Text>
          {place ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <IconSymbol name="location.fill" size={12} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, flexShrink: 1 }}>{place}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
          <HeadButton icon="viewfinder" label={tr.ctrQr} onPress={onQr} c={c} />
          <HeadButton icon="pencil" label={tr.editContainer} onPress={onEdit} c={c} />
          <HeadButton icon="trash" label={tr.deleteContainer} onPress={onDelete} c={c} danger />
          <HeadButton icon="xmark" label={tr.close} onPress={onClose} c={c} />
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <PhotoStrip photoIds={container.photoIds} mediaById={mediaById} c={c} accent={color} large
          onAdd={onAddPhoto} onRemove={onRemovePhoto} onCover={onCoverPhoto} />
      </View>

      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.dim, borderRadius: radius.pill,
            paddingHorizontal: 16, minHeight: 44 }}>
            <IconSymbol name="plus" size={14} color={c.sub} />
            <TextInput placeholder={tr.ctrNewItemPlaceholder} placeholderTextColor={c.muted} value={name} onChangeText={setName}
              onSubmitEditing={add} returnKeyType="done" accessibilityLabel={tr.addItem}
              style={{ flex: 1, fontSize: 14, fontFamily: fontFamily.regular, color: c.text, paddingVertical: 10 }} />
          </View>
          <TouchableOpacity onPress={add} disabled={!name.trim()} accessibilityRole="button" accessibilityLabel={tr.addItem}
            accessibilityState={{ disabled: !name.trim() }}
            style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: name.trim() ? c.t.action.primary : c.t.state.disabledBg }}>
            <IconSymbol name="arrow.up" size={18} color={name.trim() ? c.t.text.onAction : c.t.state.disabledText} />
          </TouchableOpacity>
        </View>
        {name.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: c.dim, borderRadius: radius.control,
              paddingHorizontal: 16 }}>
              <IconSymbol name="tag" size={12} color={c.sub} />
              <TextInput placeholder={tr.ctrTagsPlaceholder} placeholderTextColor={c.muted} value={tags} onChangeText={setTags}
                onSubmitEditing={add} returnKeyType="done" accessibilityLabel={tr.itemTags}
                style={{ flex: 1, fontSize: 13, fontFamily: fontFamily.regular, color: c.text, paddingVertical: 10 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6, backgroundColor: c.dim, borderRadius: radius.control,
              paddingHorizontal: 16, paddingVertical: 10 }}>
              <IconSymbol name="text.alignleft" size={12} color={c.sub} style={{ marginTop: 2 }} />
              <TextInput placeholder={tr.ctrNotePlaceholder} placeholderTextColor={c.muted} value={note} onChangeText={setNote}
                multiline accessibilityLabel={tr.itemNote} style={{ flex: 1, fontSize: 13, fontFamily: fontFamily.regular, color: c.text }} />
            </View>
          </>
        ) : null}
      </View>

      {stats.count > 0 || stats.discarded > 0 ? (
        <View style={{ marginTop: 20, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, flexShrink: 1, ...dsType.numeric }}>
              {itemsCount(tr, stats.count, lang)}
              {stats.units !== stats.count ? ` · ${fill(tr.ctrUnits, { n: stats.units })}` : ''}
              {stats.lent ? ` · ${fill(tr.ctrLentCount, { n: stats.lent })}` : ''}
            </Text>
            {stats.discarded ? (
              <TouchableOpacity onPress={() => setShowDiscarded(v => !v)} accessibilityRole="switch"
                accessibilityState={{ checked: showDiscarded }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>
                  {showDiscarded ? tr.ctrHideDiscarded : fill(tr.ctrShowDiscarded, { n: stats.discarded })}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {visible.map(item => (
            <ItemRow key={item.id} item={item} accent={color} c={c}
              cover={item.photoIds?.[0] ? mediaById.get(item.photoIds[0]) : undefined} actions={actions} />
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <IconSymbol name="archivebox" size={24} color={c.sub} />
          </View>
          <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, marginBottom: 4 }}>{tr.noItems}</Text>
          <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, textAlign: 'center' }}>{tr.ctrAddItemHint}</Text>
        </View>
      )}
    </View>
  );
}
