/**
 * components/notes/NotesList.tsx — список нотаток: «Список» або «Сітка».
 *
 * Список — SectionList (віртуалізація: нотаток бувають сотні). Сітка — та
 * сама групова розкладка, але картки в незалежних колонках (MasonryColumns:
 * картка лягає в найкоротшу колонку, тож довга нотатка не лишає дірок).
 */
import React from 'react';
import { ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import { SwipeRow, type SwipeAction } from '@/components/layout-zones/SwipeRow';
import { MasonryColumns } from '@/components/shared/MasonryColumns';
import { Atlas } from '@/constants/atlas';
import { fontFamily } from '@/constants/theme';
import type { Note } from '@/utils/notes';

import { NoteListItem } from './NoteListItem';
import type { NotesViewMode } from './noteActions';
import type { NotesPalette } from './notesTheme';

export interface NotesSection {
  key: string;
  title: string;
  data: Note[];
}

export function NotesList({
  sections, mode, columns, colors: c, selectedId, locale, emptyText, emptyNode, footer, onOpen, swipeActionsFor, isDark = false,
}: {
  sections: NotesSection[];
  mode: NotesViewMode;
  columns: number;
  colors: NotesPalette;
  selectedId: string | null;
  locale: string;
  emptyText: string;
  /** Стан зони замість простого тексту (Layout System: скелет / порожньо з дією). */
  emptyNode?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  onOpen: (note: Note) => void;
  /** Свайп рядка вліво (лише «Список»): закріпити / видалити — Layout System v2.4. */
  swipeActionsFor?: (note: Note) => SwipeAction[];
  isDark?: boolean;
}) {
  const header = (section: NotesSection) => (
    <Text style={[s.section, { color: c.sub }]}>{section.title} · {section.data.length}</Text>
  );
  const empty = emptyNode !== undefined ? (emptyNode ?? <View />)
    : <Text testID="notes-empty" style={{ padding: 20, color: c.sub, textAlign: 'center', fontFamily: fontFamily.regular }}>{emptyText}</Text>;

  if (mode === 'grid') {
    return (
      <ScrollView testID="notes-grid" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
        {sections.length === 0 ? empty : sections.map(section => (
          <View key={section.key}>
            {header(section)}
            <MasonryColumns columnCount={columns} items={section.data.map(note => ({
              key: note.id,
              node: <NoteListItem note={note} variant="card" colors={c} selected={selectedId === note.id}
                locale={locale} isDark={isDark} onPress={() => onOpen(note)} />,
            }))} />
          </View>
        ))}
        {footer}
      </ScrollView>
    );
  }

  return (
    <SectionList testID="notes-rows" sections={sections} keyExtractor={note => note.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 16 }} stickySectionHeadersEnabled={false}
      ListFooterComponent={footer ?? null}
      ListEmptyComponent={empty}
      renderSectionHeader={({ section }) => header(section)}
      renderItem={({ item }) => {
        const actions = swipeActionsFor?.(item) ?? [];
        return (
          <SwipeRow actions={actions} radius={Atlas.radius.large}>
            {a11y => (
              <NoteListItem note={item} variant="row" colors={c} selected={selectedId === item.id} locale={locale}
                isDark={isDark} a11y={actions.length ? a11y : undefined} onPress={() => onOpen(item)} />
            )}
          </SwipeRow>
        );
      }} />
  );
}

const s = StyleSheet.create({
  section: { fontFamily: fontFamily.semibold, fontSize: 13, paddingTop: 12, paddingBottom: 8 },
});
