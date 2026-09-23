import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { MAX_PHOTOS, type MediaAsset } from '@/utils/containers';

import { MediaImage } from './MediaImage';
import { PhotoPermissionError, PhotoUnavailableError, type PhotoSource } from './media';
import type { ContainersColors } from './theme';

/**
 * Каруселька фото коробки чи речі: до трьох, перше — обкладинка.
 * Додавання працює й офлайн: фото лягає у файл і чергу вивантаження.
 * «Прибрати» знімає посилання; самі байти прибирає сервер пізніше (§5.5).
 */
export function PhotoStrip({
  photoIds, mediaById, c, accent, large = false, onAdd, onRemove, onCover,
}: {
  photoIds: readonly string[] | undefined;
  mediaById: ReadonlyMap<string, MediaAsset>;
  c: ContainersColors;
  accent: string;
  large?: boolean;
  onAdd: (source: PhotoSource) => Promise<void>;
  onRemove: (id: string) => void;
  onCover: (id: string) => void;
}) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const ids = photoIds ?? [];
  const w = large ? 200 : 76;
  const h = large ? 140 : 76;

  const add = () => {
    const run = async (source: PhotoSource) => {
      setBusy(true);
      try {
        await onAdd(source);
      } catch (e) {
        const message = e instanceof PhotoPermissionError ? tr.ctrPhotoPermission
          : e instanceof PhotoUnavailableError ? tr.ctrPhotoUnavailable
            : tr.ctrPhotoFailed;
        Alert.alert(tr.ctrPhotoFailed, message === tr.ctrPhotoFailed ? undefined : message);
        if (__DEV__ && !(e instanceof PhotoPermissionError)) console.warn('[containers] фото:', e);
      } finally {
        setBusy(false);
      }
    };
    Alert.alert(tr.ctrPhotoAdd, undefined, [
      { text: tr.ctrPhotoCamera, onPress: () => void run('camera') },
      { text: tr.ctrPhotoLibrary, onPress: () => void run('library') },
      { text: tr.cancel, style: 'cancel' },
    ]);
  };

  const manage = (id: string, index: number) => {
    Alert.alert(tr.ctrPhotos, undefined, [
      ...(index > 0 ? [{ text: tr.ctrPhotoCover, onPress: () => onCover(id) }] : []),
      { text: tr.ctrPhotoRemove, style: 'destructive' as const, onPress: () => onRemove(id) },
      { text: tr.cancel, style: 'cancel' as const },
    ]);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {ids.map((id, index) => (
        <TouchableOpacity key={id} onPress={() => manage(id, index)} activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${tr.ctrPhotos} ${index + 1}${index === 0 ? ` · ${tr.ctrPhotoCoverBadge}` : ''}`}>
          <MediaImage asset={mediaById.get(id)} style={{ width: w, height: h, borderRadius: 12 }}
            pendingLabel={tr.ctrPhotoPending} placeholderColor={c.dim} />
          {index === 0 && ids.length > 1 ? (
            <View style={{ position: 'absolute', left: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999,
              paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{tr.ctrPhotoCoverBadge}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
      {ids.length < MAX_PHOTOS ? (
        <TouchableOpacity onPress={add} disabled={busy} accessibilityRole="button" accessibilityLabel={tr.ctrPhotoAdd}
          style={{ width: large ? 110 : w, height: h, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
            borderColor: accent + '70', backgroundColor: accent + '10', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {busy ? <ActivityIndicator color={accent} /> : <IconSymbol name="camera.fill" size={18} color={accent} />}
          {large ? <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{tr.ctrPhotoAdd}</Text> : null}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
