import React, { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { PLACE_KINDS, type ContainerPlace, type PlaceKind } from '@/utils/containers';

import { ContainersSheet, SheetButton, SheetLabel, sheetStyles } from './ContainersSheet';
import { placeKindIcon, placeKindLabel } from './i18n';
import { PlacePicker } from './PlacePicker';
import { CONTAINERS_ACCENT, type ContainersColors } from './theme';
import type { PlaceFields } from './useContainersData';

export type PlaceFormRequest = { mode: 'new'; parentId: string | null } | { mode: 'edit'; place: ContainerPlace };

/**
 * Місце: назва, тип (лише іконка й підказка — вкладати можна будь-що в
 * будь-що), батько. Батьки, під якими місце вийшло б глибше 4 рівнів чи
 * всередині себе, вимкнені. Видалення перевішує дітей і коробки на рівень вище.
 */
export function PlaceFormSheet({ request, places, c, onClose, onSubmit, onDelete }: {
  request: PlaceFormRequest | null;
  places: readonly ContainerPlace[];
  c: ContainersColors;
  onClose: () => void;
  /** false — не вийшло (глибина/цикл). */
  onSubmit: (fields: PlaceFields) => boolean;
  onDelete: (place: ContainerPlace) => void;
}) {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlaceKind>('room');
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!request) return;
    setError(false);
    if (request.mode === 'edit') {
      setName(request.place.name);
      setKind(request.place.kind);
      setParentId(request.place.parentId ?? null);
    } else {
      setName('');
      setKind(request.parentId ? 'furniture' : 'room');
      setParentId(request.parentId);
    }
  }, [request]);

  const save = () => {
    if (!name.trim()) return;
    if (!onSubmit({ name: name.trim(), kind, parentId })) { setError(true); return; }
    onClose();
  };

  const remove = () => {
    if (request?.mode !== 'edit') return;
    const place = request.place;
    Alert.alert(tr.ctrPlaceDelete, tr.ctrPlaceDeleteMsg, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => { onDelete(place); onClose(); } },
    ]);
  };

  return (
    <ContainersSheet visible={!!request} onClose={onClose} c={c}
      title={request?.mode === 'edit' ? tr.ctrPlaceEdit : tr.ctrPlaceNew}
      footer={<>
        <SheetButton label={tr.cancel} onPress={onClose} c={c} />
        <SheetButton label={tr.save} onPress={save} c={c} color={CONTAINERS_ACCENT} disabled={!name.trim()} flex={2} />
      </>}>
      <SheetLabel text={tr.ctrPlaceName} c={c} />
      <TextInput value={name} onChangeText={setName} placeholder={tr.ctrPlaceNamePlaceholder} placeholderTextColor={c.sub}
        autoFocus={request?.mode === 'new'} accessibilityLabel={tr.ctrPlaceName}
        style={[sheetStyles.input, { backgroundColor: c.dim, color: c.text }]} />

      <SheetLabel text={tr.ctrPlaceKind} c={c} />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PLACE_KINDS.map(option => {
          const active = option === kind;
          return (
            <TouchableOpacity key={option} onPress={() => setKind(option)} accessibilityRole="radio"
              accessibilityState={{ checked: active }} accessibilityLabel={placeKindLabel(tr, option)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 12,
                borderWidth: 1, borderColor: active ? CONTAINERS_ACCENT : c.border, backgroundColor: active ? CONTAINERS_ACCENT + '22' : c.dim }}>
              <IconSymbol name={placeKindIcon(option)} size={13} color={active ? CONTAINERS_ACCENT : c.sub} />
              <Text style={{ color: c.text, fontSize: 13, fontWeight: active ? '800' : '600' }}>{placeKindLabel(tr, option)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SheetLabel text={tr.ctrPlaceParent} c={c} />
      <PlacePicker places={places} value={parentId} onChange={setParentId} c={c} accent={CONTAINERS_ACCENT}
        noneLabel={tr.ctrPlaceTopLevel} disabledFor={request?.mode === 'edit' ? request.place.id : null} />
      {error ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tr.ctrPlaceTooDeep}</Text> : null}

      {request?.mode === 'edit' ? (
        <TouchableOpacity onPress={remove} accessibilityRole="button" accessibilityLabel={tr.ctrPlaceDelete}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 14, alignSelf: 'flex-start' }}>
          <IconSymbol name="trash" size={14} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontWeight: '700' }}>{tr.ctrPlaceDelete.replace(/\?$/, '')}</Text>
        </TouchableOpacity>
      ) : null}
    </ContainersSheet>
  );
}
