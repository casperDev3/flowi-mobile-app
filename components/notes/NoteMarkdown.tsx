/**
 * components/notes/NoteMarkdown.tsx — показ тексту нотатки з розміткою.
 *
 * Розмітка живе В ТЕКСТІ (`# заголовок`, `- пункт`, `- [ ] чек-лист`), а не в
 * окремих полях запису. Через це нотатка з чек-листом лишається читабельною
 * скрізь, де її відкриють без цього екрана — у старій збірці, у вебі до
 * оновлення, у буфері обміну. Ціна — розбір на льоту, і він тут єдиний на
 * обидві платформи: правила в `utils/notes.ts`, дзеркальні до `lib/notes.ts`.
 *
 * Чек-бокс перемикає САМ ТЕКСТ (`toggleChecklistAt`), а не якийсь паралельний
 * стан: інакше два джерела правди розʼїхались би на першому ж редагуванні
 * рядка вручну.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { parseInlineSpans, parseNoteMarkdown, type NoteBlock } from '@/utils/notes';

export interface NoteMarkdownColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
  panel: string;
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 22, 2: 19, 3: 17 };

function Line({ block, color }: { block: NoteBlock; color: string }) {
  const spans = parseInlineSpans(block.text);
  return (
    <Text style={[
      s.line,
      { color },
      block.kind === 'heading' ? { fontSize: HEADING_SIZE[block.level ?? 3], fontWeight: '700' } : null,
      block.kind === 'todo' && block.done ? s.done : null,
    ]}>
      {spans.length === 0 ? block.text : spans.map((span, index) => (
        <Text key={index} style={[
          span.bold ? { fontWeight: '700' } : null,
          span.italic ? { fontStyle: 'italic' } : null,
          span.code ? s.code : null,
        ]}>{span.text}</Text>
      ))}
    </Text>
  );
}

export function NoteMarkdown({
  body,
  colors: c,
  emptyLabel,
  onToggle,
  onCreateTask,
  createTaskLabel,
}: {
  body: string;
  colors: NoteMarkdownColors;
  emptyLabel: string;
  /** Відсутній — чек-бокси лише показуються (перегляд без права правки). */
  onToggle?: (line: number) => void;
  /** Відсутній — дії «створити задачу» в рядках немає. */
  onCreateTask?: (line: number) => void;
  createTaskLabel: string;
}) {
  const blocks = parseNoteMarkdown(body);
  if (!blocks.some(block => block.kind !== 'empty')) {
    return <Text style={{ color: c.sub }}>{emptyLabel}</Text>;
  }

  return (
    <View testID="notes-preview-body">
      {blocks.map(block => {
        if (block.kind === 'empty') return <View key={block.line} style={s.gap} />;
        const actionable = Boolean(onCreateTask) && block.text.length > 0;
        return (
          <View key={block.line} style={s.row}>
            {block.kind === 'todo' && (
              <TouchableOpacity
                testID={`note-check-${block.line}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: block.done, disabled: !onToggle }}
                accessibilityLabel={block.text}
                disabled={!onToggle}
                onPress={() => onToggle?.(block.line)}
                style={[s.box, { borderColor: block.done ? c.accent : c.border, backgroundColor: block.done ? c.accent : 'transparent' }]}>
                <Text style={{ color: block.done ? c.panel : 'transparent', fontWeight: '700' }}>✓</Text>
              </TouchableOpacity>
            )}
            {block.kind === 'bullet' && <Text style={[s.marker, { color: c.sub }]}>•</Text>}
            {block.kind === 'quote' && <View style={[s.bar, { backgroundColor: c.border }]} />}
            <Line block={block} color={block.kind === 'quote' ? c.sub : c.text} />
            {actionable && (
              <TouchableOpacity
                testID={`note-line-task-${block.line}`}
                accessibilityRole="button"
                accessibilityLabel={`${createTaskLabel}: ${block.text}`}
                onPress={() => onCreateTask?.(block.line)}
                style={s.action}>
                <Text style={{ color: c.accent, fontSize: 18, fontWeight: '700' }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  gap: { height: 10 },
  line: { flex: 1, fontSize: 17, lineHeight: 26 },
  done: { textDecorationLine: 'line-through', opacity: 0.6 },
  marker: { fontSize: 17, lineHeight: 26, width: 14, textAlign: 'center' },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  // 44×44 — мінімальна ціль дотику; сам квадратик менший, поле навколо лишається.
  box: { width: 24, height: 24, marginTop: 2, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8 },
  code: { fontFamily: 'Courier', fontSize: 15 },
});
