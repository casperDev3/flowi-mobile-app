import { fontFamily, radius } from '@/constants/theme';
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
  places, value, onChange, c, accent: _accent, noneLabel, onCreate, disabledFor,
}: {
  places: readonly ContainerPlace[];
  value: string | null;
  onChange: (id: string | null) => void;
  c: ContainersColors;
  /** Легасі-проп: вибір тепер нейтральний (DS v2), акцент не використовується. */
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
          borderRadius: radius.pill, backgroundColor: active ? c.card : 'transparent', opacity: disabled ? 0.4 : 1 }}>
        <IconSymbol name={icon} size={14} color={active ? c.text : c.sub} />
        <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: active ? fontFamily.semibold : fontFamily.regular }}>{label}</Text>
        {active ? <IconSymbol name="checkmark" size={14} color={c.text} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View accessibilityRole="radiogroup" style={{ borderRadius: radius.nested, backgroundColor: c.dim, padding: 4 }}>
      {row(null, noneLabel, 0, 'xmark.circle')}
      {rows.map(({ place, depth }) => row(place.id, place.name, depth, placeKindIcon(place.kind),
        disabledFor !== undefined && !canPlaceUnder(disabledFor, place.id, places)))}
      {onCreate ? (
        draft === null ? (
          <TouchableOpacity onPress={() => setDraft('')} accessibilityRole="button"
            accessibilityLabel={value ? tr.ctrPlaceCreateHere : tr.ctrPlaceNew}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10 }}>
            <IconSymbol name="plus" size={14} color={c.text} />
            <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 13 }}>{value ? tr.ctrPlaceCreateHere : tr.ctrPlaceNew}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ padding: 6, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput value={draft} onChangeText={setDraft} autoFocus placeholder={tr.ctrPlaceNamePlaceholder}
                placeholderTextColor={c.muted} onSubmitEditing={create} returnKeyType="done" accessibilityLabel={tr.ctrPlaceName}
                style={[sheetStyles.input, { ...c.gl.card, flex: 1, color: c.text }]} />
              <TouchableOpacity onPress={create} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel={tr.add}
                style={{ width: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: draft.trim() ? c.t.action.primary : c.card }}>
                <IconSymbol name="checkmark" size={16} color={draft.trim() ? c.t.text.onAction : c.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDraft(null); setError(false); }} accessibilityRole="button" accessibilityLabel={tr.cancel}
                style={{ ...c.gl.card, width: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="xmark" size={14} color={c.sub} />
              </TouchableOpacity>
            </View>
            {error ? <Text style={{ color: c.t.status.danger, fontSize: 12, fontFamily: fontFamily.regular }}>{tr.ctrPlaceTooDeep}</Text> : null}
          </View>
        )
      ) : null}
    </View>
  );
}
