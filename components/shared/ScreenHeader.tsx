/**
 * components/shared/ScreenHeader.tsx
 *
 * Фіксований хедер екрана: великий заголовок і група кнопок праворуч.
 *
 * Компонент спільний навмисно. Та сама розмітка стояла копією в шести
 * таб-екранах, і разом із копіями розповзалися два баги:
 *
 *  1. Верхній інсет віддавали нативному `SafeAreaView edges={['top']}` —
 *     через що хедер періодично малювався під статус-баром (докладно чому —
 *     у hooks/use-top-inset.ts). Тепер відступ рахує useTopInset() у JS.
 *
 *  2. Заголовок мав `flex: 1` і жодного numberOfLines. На 320pt від рядка
 *     лишалося ~158pt після трьох кнопок по 36pt, а «Завдання» у 32pt/800
 *     займає майже стільки ж — довший переклад або системне збільшення
 *     шрифту обрізало заголовок посеред слова. Тепер коробка заголовка
 *     стискається (flexShrink), а не забирає місце в кнопок.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTopInset } from '@/hooks/use-top-inset';

/**
 * Ціль дотику 44×56pt навколо кнопки 36×36.
 *
 * Асиметрія навмисна. По вертикалі кнопці ніхто не заважає, тож там лишаються
 * історичні 10pt — звужувати вже відвантажену ціль дотику заради однаковості
 * чисел не варто. По горизонталі 10pt дати не можна: між сусідніми кнопками
 * gap 7pt, тож їхні зони перекривалися б на 13pt, і тап між двома кнопками
 * діставався б тій, що вище в порядку сиблінгів, — тобто навмання. 4pt дає
 * рівно 44pt за HIG і майже не перекривається.
 */
export const HEADER_BUTTON_HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 } as const;

/**
 * Стеля масштабування заголовка. Dynamic Type множить кегль до 3×, а 32pt×3
 * не влазить у жодну ширину — рядок або обрізається, або витісняє кнопки.
 * Решта тексту на екранах масштабується як раніше, обмежений тільки заголовок.
 */
export const TITLE_MAX_FONT_SCALE = 1.4;

// ─── Кнопка хедера ────────────────────────────────────────────────────────────

export interface HeaderButtonProps {
  onPress: () => void;
  onLongPress?: () => void;
  /** Обов'язковий: іконка сама по собі скрінрідеру нічого не каже. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Кольори кнопки — вони в кожного екрана свої. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function HeaderButton({
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}: HeaderButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.button, style]}>
      {children}
    </TouchableOpacity>
  );
}

// ─── Хедер ────────────────────────────────────────────────────────────────────

export interface ScreenHeaderProps {
  title: string;
  /** Колір заголовка: у кожного екрана своя тема. */
  color: string;
  /** Рядок НАД заголовком — привітання на екрані «Сьогодні». */
  eyebrow?: React.ReactNode;
  /** Кнопки праворуч. */
  actions?: React.ReactNode;
  /** Вміст під рядком заголовка: MonthPicker тощо. */
  children?: React.ReactNode;
  /** Історично 10 на більшості екранів і 14 на «Час» — лишаємо це екрану. */
  paddingBottom?: number;
  /** Не всюди 32pt: на «Сьогодні» заголовок 26pt. */
  titleStyle?: StyleProp<TextStyle>;
}

export function ScreenHeader({
  title,
  color,
  eyebrow,
  actions,
  children,
  paddingBottom = 10,
  titleStyle,
}: ScreenHeaderProps) {
  const topInset = useTopInset();
  const insets = useSafeAreaInsets();

  /**
   * Бічний інсет ненульовий лише в ландшафті на пристрої з вирізом — там
   * сталих 20pt не вистачає, і перша кнопка ховається за «чубчиком».
   */
  const sidePad = 20 + Math.max(insets.left, insets.right);

  return (
    <View style={{ paddingTop: topInset + 14, paddingHorizontal: sidePad, paddingBottom }}>
      <View style={styles.row}>
        {/*
         * flexShrink:1 замість flex:1 — коробка заголовка віддає місце
         * кнопкам, а не забирає його. space-between на рядку тримає кнопки
         * біля правого краю навіть тоді, коли заголовок короткий.
         */}
        <View style={styles.titleBox}>
          {eyebrow}
          <Text
            style={[styles.pageTitle, titleStyle, { color }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}>
            {title}
          </Text>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleBox: {
    flexShrink: 1,
  },
  // Явний нуль документує намір: кнопки не стискаються НІКОЛИ, інакше
  // 36pt-квадрат перетворюється на вертикальну смужку.
  actions: {
    flexDirection: 'row',
    gap: 7,
    flexShrink: 0,
  },
  // lineHeight заданий явно: без нього великий кегль обрізається зверху
  // й знизу на Android.
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  below: {
    marginTop: 8,
  },
});
