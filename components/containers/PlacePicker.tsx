import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { buildPlaceTree, canPlaceUnder, flattenPlaceTree, type ContainerPlace } from '@/utils/containers';

import { sheetStyles } from './ContainersSheet';
import { placeKindIcon } from './i18n';
import type { ContainersColors } from './theme';

/**
 * Пікер місця по дереву (плаский список із відступами) з можливістю створити
 * нове місце на льоту — всередині обраного (§8.1). `disabledFor` — id місця,
 * що саме редагується: його піддерево й надто глибокі батьки недоступні.
 */
export function PlacePicker({
  places, value, onChange, c, accent, noneLabel, onCreate, disabledFor,
}: {
  places: readonly ContainerPlace[];
  value: string | null;
  onChange: (id: string | null) => void;
  c: ContainersColors;
  accent: string;
  noneLabel: string;
  /** Створити місце під `parentId`; null — не вийшло (глибина). */
  onCreate?: (name: string, parentId: string | null) => ContainerPlace | null;
  disabledFor?: string | null;
}) {
  const { tr } = useI18n();
  const rows = useMemo(() => flattenPlaceTree(buildPlaceTree(places)), [places]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const create = () => {
    const name = (draft ?? '').trim();
    if (!name || !onCreate) return;
    const parent = value && canPlaceUnder(null, value, places) ? value : null;
    const created = onCreate(name, parent);
    if (!created) { setError(true); return; }
    setError(false);
    setDraft(null);
    onChange(created.id);
  };

  const row = (id: string | null, label: string, depth: number, icon: ReturnType<typeof placeKindIcon> | 'xmark.circle', disabled = false) => {
    const active = value === id;
    return (
      <TouchableOpacity key={id ?? '__none__'} onPress={() => onChange(id)} disabled={disabled}
        accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 10 + depth * 16, paddingRight: 10,
          borderRadius: 10, backgroundColor: active ? accent + '22' : 'transparent', opacity: disabled ? 0.4 : 1 }}>
        <IconSymbol name={icon} size={14} color={active ? accent : c.sub} />
        <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: active ? '700' : '500' }}>{label}</Text>
        {active ? <IconSymbol name="checkmark" size={14} color={accent} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View accessibilityRole="radiogroup" style={{ borderRadius: 12, backgroundColor: c.dim, padding: 4 }}>
      {row(null, noneLabel, 0, 'xmark.circle')}
      {rows.map(({ place, depth }) => row(place.id, place.name, depth, placeKindIcon(place.kind),
        disabledFor !== undefined && !canPlaceUnder(disabledFor, place.id, places)))}
      {onCreate ? (
        draft === null ? (
          <TouchableOpacity onPress={() => setDraft('')} accessibilityRole="button"
            accessibilityLabel={value ? tr.ctrPlaceCreateHere : tr.ctrPlaceNew}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10 }}>
            <IconSymbol name="plus" size={14} color={accent} />
            <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{value ? tr.ctrPlaceCreateHere : tr.ctrPlaceNew}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ padding: 6, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput value={draft} onChangeText={setDraft} autoFocus placeholder={tr.ctrPlaceNamePlaceholder}
                placeholderTextColor={c.sub} onSubmitEditing={create} returnKeyType="done" accessibilityLabel={tr.ctrPlaceName}
                style={[sheetStyles.input, { flex: 1, backgroundColor: c.card, color: c.text }]} />
              <TouchableOpacity onPress={create} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel={tr.add}
                style={{ width: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: draft.trim() ? accent : c.card }}>
                <IconSymbol name="checkmark" size={16} color={draft.trim() ? '#fff' : c.sub} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDraft(null); setError(false); }} accessibilityRole="button" accessibilityLabel={tr.cancel}
                style={{ width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card }}>
                <IconSymbol name="xmark" size={14} color={c.sub} />
              </TouchableOpacity>
            </View>
            {error ? <Text style={{ color: c.sub, fontSize: 12 }}>{tr.ctrPlaceTooDeep}</Text> : null}
          </View>
        )
      ) : null}
    </View>
  );
}
