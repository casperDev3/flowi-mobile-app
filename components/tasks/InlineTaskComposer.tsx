/**
 * components/tasks/InlineTaskComposer.tsx — поле «одна назва» просто в колонці
 * дошки / секції статусу простору проєкту.
 *
 * Паритет із вебом: там задачу заводять ПРЯМО в тій колонці, де вона має
 * лежати, і статус колонки стає статусом задачі без жодного пікера. На
 * мобільному цього не було взагалі — єдиним входом був спільний рядок
 * угорі екрана, який завжди клав задачу в першу todo-колонку, тож «створити
 * одразу в „На перевірці“» вимагало створити й потім перенести.
 *
 * Компонент навмисно НІЧОГО не знає ні про задачі, ні про статуси: він
 * віддає введений рядок, а куди саме його покласти — вирішує екран
 * (`app/project/[id]/tasks.tsx`), бо там і тільки там відомі колонки проєкту.
 * Підписи приходять пропами з i18n екрана — власного словника тут немає.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

export interface InlineComposerColors {
  text: string;
  sub: string;
  dim: string;
  border: string;
  accent: string;
}

export function InlineTaskComposer({
  value, onChangeText, onSubmit, onCancel, onDetails, placeholder,
  submitLabel, cancelLabel, detailsLabel, colors, accentColor,
}: {
  value: string;
  onChangeText: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /**
   * «Детальніше» — повна форма з ТИМ САМИМ статусом (дзеркало веб-композера
   * колонки). Без цього переходу інлайн-поле було б глухим кутом для задачі,
   * якій потрібні дедлайн чи виконавець: довелось би створити тут і одразу
   * відкривати редактор.
   */
  onDetails?: () => void;
  placeholder: string;
  /** Доступне ім'я кнопки «створити» — з `tr`, не літерал. */
  submitLabel: string;
  cancelLabel: string;
  detailsLabel?: string;
  colors: InlineComposerColors;
  /** Колір колонки, у яку пишемо, — щоб було видно, КУДИ саме впаде задача. */
  accentColor?: string;
}) {
  const accent = accentColor ?? colors.accent;
  return (
    <View style={[st.row, { borderColor: accent, backgroundColor: colors.dim }]}>
      <View style={[st.dot, { backgroundColor: accent }]} />
      <TextInput
        // Клавіатура відкривається одразу: поле з'явилось у відповідь на тап
        // саме по цьому місцю, і зайвий другий тап тут був би шумом.
        autoFocus
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={colors.sub}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        // Клавіатура НЕ ховається після Enter: у колонку зазвичай заводять
        // кілька задач поспіль, і екран лишає поле відкритим.
        blurOnSubmit={false}
        returnKeyType="done"
        style={[st.input, { color: colors.text }]}
      />
      {onDetails && detailsLabel ? (
        <TouchableOpacity
          onPress={onDetails}
          accessibilityRole="button"
          accessibilityLabel={detailsLabel}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
          <IconSymbol name="arrow.up.right" size={15} color={colors.sub} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onSubmit}
        disabled={!value.trim()}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
        <IconSymbol name="plus" size={16} color={value.trim() ? accent : colors.sub} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
        <IconSymbol name="xmark" size={14} color={colors.sub} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Порожнє місце колонки/секції як ЦІЛЬ ТАПУ.
 *
 * Це і є «тап по порожньому місцю» з паритету: у колонці без задач інакше
 * немає жодної цілі, а в колонці із задачами смуга під останньою карткою
 * грає ту саму роль, що порожнє місце під нею на дошці вебу.
 */
export function InlineComposerSlot({
  label, colors, onPress, minHeight = 44,
}: {
  label: string;
  colors: InlineComposerColors;
  onPress: () => void;
  minHeight?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.slot, { borderColor: colors.border, minHeight }]}>
      <IconSymbol name="plus" size={13} color={colors.sub} />
      <Text numberOfLines={1} style={{ color: colors.sub, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  input: { flex: 1, fontSize: 13, paddingVertical: 10 },
  slot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 10,
  },
});
