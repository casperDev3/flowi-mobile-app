import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { CONTAINER_COLORS, containerColor, type Container, type ContainerPlace } from '@/utils/containers';

import { ContainersSheet, SheetButton, SheetLabel, sheetStyles } from './ContainersSheet';
import { fill } from './i18n';
import { PlacePicker } from './PlacePicker';
import type { ContainersColors } from './theme';
import type { ContainerFields } from './useContainersData';

export type ContainerFormRequest = { mode: 'new'; placeId: string | null } | { mode: 'edit'; container: Container };

/**
 * Форма коробки: назва, місце (пікер по дереву зі створенням на льоту),
 * колір. Рядок `location` із форми зник — його формує дерево (§8.1).
 * Фото коробки — у самій деталі, каруселлю.
 */
export function ContainerFormSheet({ request, places, c, onClose, onSubmit, onCreatePlace }: {
  request: ContainerFormRequest | null;
  places: readonly ContainerPlace[];
  c: ContainersColors;
  onClose: () => void;
  onSubmit: (fields: ContainerFields) => void;
  onCreatePlace: (name: string, parentId: string | null) => ContainerPlace | null;
}) {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [color, setColor] = useState<string>(CONTAINER_COLORS[0]);

  useEffect(() => {
    if (!request) return;
    if (request.mode === 'edit') {
      setName(request.container.name);
      setPlaceId(request.container.placeId ?? null);
      setColor(containerColor(request.container.color));
    } else {
      setName('');
      setPlaceId(request.placeId);
      setColor(CONTAINER_COLORS[0]);
    }
  }, [request]);

  const legacy = request?.mode === 'edit' && !request.container.placeId ? request.container.location : '';
  const save = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), placeId, color });
    onClose();
  };

  return (
    <ContainersSheet visible={!!request} onClose={onClose} c={c}
      title={request?.mode === 'edit' ? tr.editContainer : tr.newContainer}
      footer={<>
        <SheetButton label={tr.cancel} onPress={onClose} c={c} />
        <SheetButton label={tr.save} onPress={save} c={c} color={color} disabled={!name.trim()} flex={2} />
      </>}>
      <SheetLabel text={tr.containerName} c={c} />
      <TextInput value={name} onChangeText={setName} placeholder={tr.containerNamePlaceholder} placeholderTextColor={c.sub}
        autoFocus={request?.mode === 'new'} accessibilityLabel={tr.containerName}
        style={[sheetStyles.input, { backgroundColor: c.dim, color: c.text }]} />

      <SheetLabel text={tr.containerLocation} c={c} />
      {legacy ? <Text style={{ color: c.sub, fontSize: 12, marginBottom: 6 }}>{fill(tr.ctrLegacyLocation, { loc: legacy })}</Text> : null}
      <PlacePicker places={places} value={placeId} onChange={setPlaceId} c={c} accent={color}
        noneLabel={tr.ctrNoPlace} onCreate={onCreatePlace} />

      <SheetLabel text={tr.ctrColor} c={c} />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {CONTAINER_COLORS.map(option => (
          <TouchableOpacity key={option} onPress={() => setColor(option)} accessibilityRole="radio"
            accessibilityState={{ checked: color === option }} accessibilityLabel={`${tr.ctrColor} ${option}`}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: option,
              borderWidth: color === option ? 3 : 0, borderColor: c.isDark ? '#fff' : '#1A1433' }} />
          </TouchableOpacity>
        ))}
      </View>
    </ContainersSheet>
  );
}
