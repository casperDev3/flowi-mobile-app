/**
 * components/shared/DetailPane.tsx
 *
 * Оболонка для панелі деталі. Той самий вміст показується двома
 * різними способами залежно від того, скільки є місця:
 *
 *   вузько  — модальний лист поверх списку (як було й лишається на телефоні)
 *   широко  — постійна колонка праворуч, список видно поруч
 *
 * Компонент нічого не знає про завдання: він відповідає лише за обрамлення.
 * Вміст приходить через children і закриває всю логіку редагування на собі.
 *
 * Три колонки вмикаються на `expanded` (≥840), а не на будь-якому
 * широкому екрані. На `medium` (600–840) сайдбар уже займає 232pt, і
 * деталь вийшла б вужчою за 260pt — читалася б гірше, ніж на весь екран.
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout } from '@/constants/tokens';
import { radius, space } from '@/constants/theme';
import { dsTheme, glassOf, glassRim } from '@/components/shared/dsTheme';

/** Підібрано під найдовший рядок деталі («Дедлайн: 12 листопада 2026»). */
export const DETAIL_COLUMN_WIDTH = Layout.detailWidth;

export interface DetailPaneProps {
  /** Чи є вибране завдання. */
  open: boolean;
  /** Показувати колонкою замість модалки. */
  wide: boolean;
  onClose: () => void;
  isDark: boolean;
  sheetColor: string;
  borderColor: string;
  /** Стеля висоти для модального листа; у колонці не використовується. */
  maxHeight: number;
  scrollRef: React.RefObject<ScrollView | null>;
  /** Що показати в колонці, коли нічого не вибрано. У модалці не потрібне. */
  empty?: React.ReactNode;
  /**
   * Липка шапка: стоїть НАД прокруткою, тож кнопки закриття/редагування й
   * вкладки лишаються на місці, поки гортається лише тіло. Необовʼязкова —
   * екрани без неї виглядають і поводяться як раніше.
   */
  header?: React.ReactNode;
  /**
   * Ширина колонки (лише wide). За замовчуванням DETAIL_COLUMN_WIDTH;
   * ListDetailLayout передає detailColumnWidthFor(вікно).
   */
  columnWidth?: number;
  /**
   * Сталa висота модального листа (лише вузький екран). Без неї лист
   * підлаштовується під вміст — і картка з вкладками стрибала по висоті при
   * кожному перемиканні «Основне / Деталі / Активність». Зі сталою висотою
   * міняється лише вміст прокрутки. Клавіатура лист стискає (flexShrink),
   * а не виштовхує за верх екрана.
   */
  sheetHeight?: number;
  /**
   * Липкий низ (P2 аудиту 2026-10): кнопки «Видалити / Виконано» стоять ПІД
   * прокруткою, а не в її кінці — інакше на відкритті лист різав їх навпіл.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailPane({
  open, wide, onClose, isDark, sheetColor, borderColor, maxHeight, scrollRef, empty, header, columnWidth = DETAIL_COLUMN_WIDTH, sheetHeight, footer, children,
}: DetailPaneProps) {
  // Колонка не має власного верхнього відступу (він лишився на хедері
  // списку зліва), тож верхній виріз доводиться враховувати самій.
  const insets = useSafeAreaInsets();
  // DS v2: колонка — surface.card, лист — surface.elevated; без блюру й рамки.
  const t = dsTheme(isDark);
  void sheetColor; void borderColor;

  if (wide) {
    return (
      <View style={[st.column, { width: columnWidth, backgroundColor: glassOf(t).surfaceStrong, ...glassRim(t, 'strong') }]}>
        {open ? (
          <>
            {header ? (
              <View style={[st.columnHeader, { paddingTop: insets.top + 20 }]}>{header}</View>
            ) : null}
            <ScrollView
              ref={scrollRef}
              style={st.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[st.columnContent, { paddingTop: header ? 4 : insets.top + 20 }, footer ? { paddingBottom: 16 } : null]}>
              {children}
            </ScrollView>
            {footer ? <View style={[st.columnFooter, { borderTopColor: t.border.hairline, paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View> : null}
          </>
        ) : (
          // Порожня колонка без пояснення читається як помилка рендеру.
          <View style={[st.emptyBox, { paddingTop: insets.top + 28 }]}>{empty}</View>
        )}
      </View>
    );
  }

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable accessible={false} style={[st.overlay, { backgroundColor: t.surface.overlay }]} onPress={onClose}>
          <Pressable accessible={false} onPress={e => e.stopPropagation()} style={[st.sheetWrapper, sheetHeight ? st.shrink : null]}>
            {open && (
              <View
                style={[st.sheet, sheetHeight ? { height: Math.min(sheetHeight, maxHeight), flexShrink: 1 } : null, { maxHeight, backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }]}>
                {/* Шапка поза ScrollView: лист обмежений maxHeight, і
                    flexShrink у прокрутки віддає місце саме їй, а не шапці. */}
                {header}
                <ScrollView ref={scrollRef} style={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {children}
                </ScrollView>
                {footer ? <View style={[st.sheetFooter, { borderTopColor: t.border.hairline }]}>{footer}</View> : null}
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  column:        {},
  columnHeader:  { paddingHorizontal: space.cardPadding, paddingBottom: 4 },
  columnContent: { padding: space.cardPadding, paddingBottom: 40 },
  columnFooter:  { paddingHorizontal: space.cardPadding, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sheetFooter:   { paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  scroll:        { flexShrink: 1 },
  shrink:        { flexShrink: 1 },
  emptyBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  sheetWrapper:  { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:         { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
});
