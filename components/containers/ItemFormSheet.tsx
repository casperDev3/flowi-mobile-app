import { fontFamily, radius, type as dsType } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  clampQty,
  ITEM_STATUSES,
  parseTags,
  STATUS_COLORS,
  withStatus,
  type ContainerItem,
  type ItemStatus,
  type MediaAsset,
} from '@/utils/containers';
import { uuidV4 } from '@/utils/uuid';

import { ContainersSheet, SheetButton, SheetLabel, sheetStyles } from './ContainersSheet';
import { statusLabel } from './i18n';
import type { PhotoSource } from './media';
import { PhotoStrip } from './PhotoStrip';
import type { ContainersColors } from './theme';

export interface ItemFormRequest {
  containerId: string;
  item: ContainerItem | null;
  /** «Позичити» з рядка відкриває форму одразу з цим статусом. */
  status?: ItemStatus;
}

/** Форма речі: назва, кількість (степер), статус (сегмент), «кому позичив», теги, примітка, фото. */
export function ItemFormSheet({
  request, c, accent, mediaById, onClose, onSave, onAddPhoto, onRemovePhoto, onCoverPhoto, livePhotoIds,
}: {
  request: ItemFormRequest | null;
  c: ContainersColors;
  accent: string;
  mediaById: ReadonlyMap<string, MediaAsset>;
  onClose: () => void;
  onSave: (item: ContainerItem) => void;
  onAddPhoto: (itemId: string, source: PhotoSource) => Promise<void>;
  onRemovePhoto: (itemId: string, photoId: string) => void;
  onCoverPhoto: (itemId: string, photoId: string) => void;
  /** Актуальні фото редагованої речі (зі сховища, не з моменту відкриття). */
  livePhotoIds?: readonly string[];
}) {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [status, setStatus] = useState<ItemStatus>('in_box');
  const [lentTo, setLentTo] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!request) return;
    const item = request.item;
    setName(item?.name ?? '');
    setQty(String(item?.qty ?? 1));
    setStatus(request.status ?? item?.status ?? 'in_box');
    setLentTo(item?.lentTo ?? '');
    setTags((item?.tags ?? []).join(', '));
    setNote(item?.note ?? '');
  }, [request]);

  const count = clampQty(qty);
  const needsLentTo = status === 'lent' && !lentTo.trim();
  const canSave = !!name.trim() && !needsLentTo;

  const save = () => {
    if (!request || !canSave) return;
    const now = new Date().toISOString();
    const base: ContainerItem = {
      ...(request.item ?? { id: uuidV4(), createdAt: now, status: 'in_box' as const, tags: [], qty: 1 }),
      containerId: request.item?.containerId ?? request.containerId,
      name: name.trim(),
      qty: count,
      tags: parseTags(tags),
      note: note.trim() || undefined,
    } as ContainerItem;
    onSave(withStatus(base, status, now, lentTo));
    onClose();
  };

  const input = [sheetStyles.input, { backgroundColor: c.dim, color: c.text }];

  return (
    <ContainersSheet visible={!!request} onClose={onClose} c={c}
      title={request?.item ? tr.ctrEditItem : tr.ctrNewItem}
      footer={<>
        <SheetButton label={tr.cancel} onPress={onClose} c={c} />
        <SheetButton label={tr.save} onPress={save} c={c} primary disabled={!canSave} flex={2} />
      </>}>
      <SheetLabel text={tr.itemName} c={c} required />
      <TextInput value={name} onChangeText={setName} placeholder={tr.itemNamePlaceholder} placeholderTextColor={c.muted}
        autoFocus={!request?.item} style={input} accessibilityLabel={tr.itemName} />

      <SheetLabel text={tr.ctrItemQty} c={c} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={() => setQty(String(Math.max(0, count - 1)))} disabled={count <= 0}
          accessibilityRole="button" accessibilityLabel={tr.ctrQtyLess}
          style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center', opacity: count <= 0 ? 0.4 : 1 }}>
          <IconSymbol name="minus" size={16} color={c.text} />
        </TouchableOpacity>
        <TextInput value={qty} onChangeText={t => setQty(t.replace(/[^\d]/g, ''))} keyboardType="number-pad"
          accessibilityLabel={tr.ctrItemQty}
          style={[sheetStyles.input, { backgroundColor: c.dim, color: c.text, width: 72, textAlign: 'center', ...dsType.numeric }]} />
        <TouchableOpacity onPress={() => setQty(String(count + 1))} accessibilityRole="button" accessibilityLabel={tr.ctrQtyMore}
          style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="plus" size={16} color={c.text} />
        </TouchableOpacity>
      </View>

      <SheetLabel text={tr.ctrItemStatus} c={c} />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
        {ITEM_STATUSES.map(option => {
          const active = option === status;
          // Статусний колір — лише крапкою; сам сегмент — pill (активний = action.primary).
          const color = option === 'in_box' ? c.sub : STATUS_COLORS[option];
          return (
            <TouchableOpacity key={option} onPress={() => setStatus(option)} accessibilityRole="radio"
              accessibilityState={{ checked: active }} accessibilityLabel={statusLabel(tr, option)}
              style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6, paddingHorizontal: 6, backgroundColor: active ? c.t.action.primary : c.dim }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
              <Text numberOfLines={1} style={{ color: active ? c.t.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 }}>{statusLabel(tr, option)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {status === 'lent' ? (
        <>
          <SheetLabel text={tr.ctrLentTo} c={c} />
          <TextInput value={lentTo} onChangeText={setLentTo} placeholder={tr.ctrLentToPlaceholder} placeholderTextColor={c.muted}
            autoFocus={request?.status === 'lent'} style={input} accessibilityLabel={tr.ctrLentTo} />
          {needsLentTo ? <Text style={{ color: c.t.status.danger, fontSize: 12, fontFamily: fontFamily.regular, marginTop: 4 }}>{tr.ctrLentNeedsName}</Text> : null}
        </>
      ) : null}

      <SheetLabel text={tr.itemTags} c={c} />
      <TextInput value={tags} onChangeText={setTags} placeholder={tr.ctrTagsPlaceholder} placeholderTextColor={c.muted}
        style={input} accessibilityLabel={tr.itemTags} />

      <SheetLabel text={tr.itemNote} c={c} />
      <TextInput value={note} onChangeText={setNote} placeholder={tr.ctrNotePlaceholder} placeholderTextColor={c.muted}
        multiline style={[...input, { minHeight: 72, textAlignVertical: 'top' }]} accessibilityLabel={tr.itemNote} />

      {request?.item ? (
        <>
          <SheetLabel text={tr.ctrPhotos} c={c} />
          <PhotoStrip photoIds={livePhotoIds ?? request.item.photoIds} mediaById={mediaById} c={c} accent={accent}
            onAdd={source => onAddPhoto(request.item!.id, source)}
            onRemove={id => onRemovePhoto(request.item!.id, id)}
            onCover={id => onCoverPhoto(request.item!.id, id)} />
        </>
      ) : null}
    </ContainersSheet>
  );
}
