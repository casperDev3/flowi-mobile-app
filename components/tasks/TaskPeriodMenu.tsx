/**
 * components/tasks/TaskPeriodMenu.tsx — фільтри головної зони «Завдань» на
 * ПЛАНШЕТІ: «Термінові» (першою) + випадний список періоду
 * Сьогодні / Завтра / Тиждень / Місяць / Всі / Без дедлайну.
 *
 * Нативний відповідник вебових `ds-section-tab «Термінові»` +
 * `components/tasks/task-period-menu.tsx`. Тригер — та сама pill, що й
 * вкладки розділу (SectionTabs: 36pt + hitSlop 4 = 44); меню — «брудне скло»
 * оверлею (OverlaySurface, Layout System v2.4) під тригером, тап поза меню
 * чи «Назад» на Android його закриває. Телефон цього компонента не бачить —
 * там лишаються чипи «Сьогодні · Тиждень · Всі» (+ «Без дедлайну»).
 */
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { OverlaySurface } from '@/components/ds/OverlaySurface';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { TASK_PERIOD_ORDER, type TaskPeriod } from '@/utils/taskPeriods';

import { useTaskPeriodStrings } from './taskPeriodStrings';

const PERIOD_ICONS: Record<TaskPeriod, IconSymbolName> = {
  today: 'sun.max',
  tomorrow: 'sun.horizon.fill',
  week: 'calendar',
  month: 'calendar.circle.fill',
  all: 'list.bullet',
  undated: 'list.bullet.clipboard',
};

const MENU_WIDTH = 248;

/** Pill у стилі SectionTabs: активна — action.primary, тиха — subtle. */
function usePill() {
  const { t, g, reduceTransparency } = useDS();
  const idle = reduceTransparency ? t.surface.subtle : g.surfaceSubtle;
  return useCallback((active: boolean) => ({
    box: active
      ? { backgroundColor: t.action.primary }
      : { backgroundColor: idle, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline },
    fg: active ? t.text.onAction : t.text.secondary,
  }), [t, idle]);
}

export function UrgentFilterToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const s = useTaskPeriodStrings();
  const pill = usePill()(value);
  return (
    <Pressable
      testID="tasks-urgent-toggle"
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={s.urgent}
      accessibilityHint={s.urgentHint}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [st.pill, pill.box, pressed && !value ? { opacity: 0.7 } : null]}>
      <IconSymbol name="flame.fill" size={14} color={pill.fg} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.label, { color: pill.fg }]}>{s.urgent}</Text>
    </Pressable>
  );
}

export function TaskPeriodMenu({ value, counts, onChange }: {
  value: TaskPeriod;
  /** Скільки НЕзавершених задач у кожному пункті (taskPeriodCounts). */
  counts: Record<TaskPeriod, number>;
  onChange: (next: TaskPeriod) => void;
}) {
  const s = useTaskPeriodStrings();
  const { t } = useDS();
  const pill = usePill()(true);
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const open = () => {
    const node = triggerRef.current;
    if (!node) { setAnchor({ x: 16, y: 120 }); return; }
    node.measureInWindow((x, y, _w, h) => setAnchor({ x, y: y + h + 6 }));
  };
  const close = () => setAnchor(null);
  const choose = (next: TaskPeriod) => {
    close();
    if (next !== value) onChange(next);
  };

  const label = s.periods[value];
  const left = anchor ? Math.max(8, Math.min(anchor.x, windowWidth - MENU_WIDTH - 8)) : 0;

  return (
    <>
      <Pressable
        ref={triggerRef}
        testID="tasks-period-trigger"
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={s.periodTrigger(label, counts[value])}
        accessibilityHint={s.periodHint}
        accessibilityState={{ expanded: !!anchor }}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [st.pill, pill.box, pressed ? { opacity: 0.85 } : null]}>
        <IconSymbol name={PERIOD_ICONS[value]} size={14} color={pill.fg} />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.label, { color: pill.fg }]}>{label}</Text>
        <View style={[st.count, { backgroundColor: 'rgba(127,127,135,0.35)' }]}>
          <Text style={[st.countText, { color: pill.fg }]}>{counts[value]}</Text>
        </View>
        <IconSymbol name="chevron.down" size={12} color={pill.fg} style={anchor ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>

      <Modal visible={!!anchor} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        {/* Тап поза меню закриває його (як клік поза меню на вебі). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={s.periodMenu} />
        {anchor ? (
          <OverlaySurface
            radius={radius.card}
            accessibilityViewIsModal
            style={[st.menu, { top: anchor.y, left, width: MENU_WIDTH }]}>
            <View accessibilityRole="menu" accessibilityLabel={s.periodMenu} testID="tasks-period-menu" style={st.menuInner}>
              {TASK_PERIOD_ORDER.map(period => {
                const checked = period === value;
                return (
                  <Pressable
                    key={period}
                    testID={`tasks-period-${period}`}
                    onPress={() => choose(period)}
                    accessibilityRole="menuitem"
                    accessibilityState={{ checked, selected: checked }}
                    accessibilityLabel={`${s.periods[period]}, ${counts[period]}`}
                    style={({ pressed }) => [st.item, pressed ? { backgroundColor: t.surface.subtle } : null]}>
                    <IconSymbol name={PERIOD_ICONS[period]} size={16} color={t.text.secondary} />
                    <Text numberOfLines={1} style={[st.itemLabel, { color: t.text.primary, fontFamily: checked ? fontFamily.semibold : fontFamily.medium }]}>
                      {s.periods[period]}
                    </Text>
                    <Text style={[st.itemCount, { color: t.text.secondary }]}>{counts[period]}</Text>
                    <IconSymbol name="checkmark" size={14} color={checked ? t.text.primary : 'transparent'} />
                  </Pressable>
                );
              })}
            </View>
          </OverlaySurface>
        ) : null}
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  label: { fontSize: 13, fontFamily: fontFamily.semibold },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  menu: { position: 'absolute' },
  menuInner: { padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.control },
  itemLabel: { flex: 1, fontSize: 15 },
  itemCount: { fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
});
