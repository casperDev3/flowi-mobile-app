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
import { BlurView } from 'expo-blur';
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Підібрано під найдовший рядок деталі («Дедлайн: 12 листопада 2026»). */
export const DETAIL_COLUMN_WIDTH = 380;

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
  children: React.ReactNode;
}

export function DetailPane({
  open, wide, onClose, isDark, sheetColor, borderColor, maxHeight, scrollRef, empty, children,
}: DetailPaneProps) {
  // Колонка не має власного верхнього відступу (він лишився на хедері
  // списку зліва), тож верхній виріз доводиться враховувати самій.
  const insets = useSafeAreaInsets();

  if (wide) {
    return (
      <View style={[st.column, { width: DETAIL_COLUMN_WIDTH, backgroundColor: sheetColor, borderLeftColor: borderColor }]}>
        {open ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[st.columnContent, { paddingTop: insets.top + 20 }]}>
            {children}
          </ScrollView>
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
        <Pressable style={st.overlay} onPress={onClose}>
          <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
            {open && (
              <BlurView
                intensity={isDark ? 50 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { maxHeight, borderColor, backgroundColor: sheetColor }]}>
                <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {children}
                </ScrollView>
              </BlurView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  column:        { borderLeftWidth: StyleSheet.hairlineWidth },
  columnContent: { padding: 20, paddingBottom: 40 },
  emptyBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:  { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:         { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
});
