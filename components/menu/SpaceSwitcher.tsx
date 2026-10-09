/**
 * components/menu/SpaceSwitcher.tsx — перемикач групи меню в хедері.
 *
 * Раніше групи стояли окремим рядком чипів над вкладками: з трьома-чотирма
 * групами рядок прокручувався вбік і забирав висоту під меню. Тепер це
 * один чип із назвою поточної групи; список груп, «Показати архів»,
 * «Створити групу» і «Приєднатися» — в аркуші.
 */
import { Atlas } from '@/constants/atlas';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import type { MenuSpace } from '@/store/menu-api';

import { visibleSpaces } from './model';
import type { MenuColors } from './theme';

/**
 * Пауза між закриттям аркуша й відкриттям наступної модалки: SheetModal ще
 * ~150 ms тримає себе змонтованим, і модалка поверх нього лишила б
 * невидимий шар, що з'їдає дотики (NEW-02 у CLAUDE.md).
 */
const HANDOFF_MS = 220;

export function SpaceSwitcher({
  spaces,
  currentId,
  currentName,
  showArchive,
  onToggleArchive,
  onSelect,
  onCreate,
  onJoin,
  disabled,
  c,
}: {
  spaces: readonly MenuSpace[];
  currentId: string;
  currentName: string;
  showArchive: boolean;
  onToggleArchive: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  disabled: boolean;
  c: MenuColors;
}) {
  const { tr } = useI18n();
  const { isWide, height } = useResponsive();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const list = visibleSpaces(spaces, showArchive, currentId);
  const hasArchived = spaces.some((x) => x.archived);
  const label = currentName || tr.menu.spacesTitle;

  const after = (fn: () => void) => {
    setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, HANDOFF_MS);
  };

  const action = (key: string, text: string, onPress: () => void, icon: 'plus' | 'link') => (
    <TouchableOpacity
      key={key}
      onPress={() => after(onPress)}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={[st.row, { borderColor: c.border, backgroundColor: c.dim }]}>
      <IconSymbol name={icon} size={15} color={c.accent} />
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flex: 1, marginLeft: 10 }}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={tr.menu.switchSpace}
        accessibilityValue={{ text: label }}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [
          st.chip,
          { borderColor: c.border, backgroundColor: c.dim, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
        ]}>
        <IconSymbol name="person.2.fill" size={13} color={c.accent} />
        <Text numberOfLines={1} style={[st.chipText, { color: c.text }]}>
          {label}
        </Text>
        <IconSymbol name="chevron.down" size={11} color={c.sub} />
      </Pressable>

      <SheetModal visible={open} onClose={() => setOpen(false)}>
        <View
          style={[
            st.sheet,
            sheetColumnStyle(isWide),
            { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border },
          ]}>
          <Text style={[st.sheetLabel, { color: c.sub }]}>{tr.menu.spacesTitle}</Text>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {list.map((x) => {
              const on = x.id === currentId;
              const name = x.name + (x.archived ? ' · Архів' : '');
              return (
                <TouchableOpacity
                  key={x.id}
                  onPress={() => {
                    setOpen(false);
                    if (!on) onSelect(x.id);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={name}
                  style={[
                    st.row,
                    { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '15' : c.dim },
                  ]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: on ? c.accent : c.text, fontSize: 15, fontWeight: '600' }}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12 }}>
                      {x.is_owner ? 'Ви власник' : 'Ви учасник'}
                    </Text>
                  </View>
                  {on ? <IconSymbol name="checkmark" size={14} color={c.accent} /> : null}
                </TouchableOpacity>
              );
            })}
            {hasArchived ? (
              <TouchableOpacity
                onPress={onToggleArchive}
                accessibilityRole="button"
                accessibilityLabel={showArchive ? 'Сховати архів' : 'Показати архів'}
                style={st.link}>
                <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>
                  {showArchive ? 'Сховати архів' : 'Показати архів'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={[st.divider, { backgroundColor: c.border }]} />
            {action('create', '＋ Створити групу', onCreate, 'plus')}
            {action('join', 'Приєднатися за посиланням', onJoin, 'link')}
          </ScrollView>
        </View>
      </SheetModal>
    </>
  );
}

const st = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    maxWidth: 180,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    flexShrink: 1,
  },
  chipText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  sheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 16, gap: 10 },
  sheetLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Atlas.radius.large,
    borderWidth: 1,
    gap: 8,
  },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
