/**
 * components/health/HealthTabs.tsx — вкладки розділу «Здоровʼя».
 *
 * Розділ був розсипаний на вісім окремих екранів (`app/health-*.tsx`) плюс
 * три пункти сайдбара. Людина, яка хотіла порівняти сон із кроками, робила це
 * через хаб і два переходи назад. Тепер розділ один, а те, що було екранами, —
 * вкладки: перемикання коштує один тап і не втрачає місце в стеку.
 *
 * Маніфест лежить окремо від самого екрана, бо його читають троє: смуга
 * вкладок, сам екран (яку вкладку малювати) і редиректи старих маршрутів
 * (`app/health-summary.tsx` і решта) — усі мусять погоджуватись, що таке
 * «вкладка сну», інакше глибоке посилання відкриє не те.
 *
 * Підписи беруться зі словника (`store/translations.ts`), а не з рядків у
 * цьому файлі: мова — рантайм-вибір, і вписаний сюди текст зробив би вкладки
 * єдиним місцем застосунку, що не перекладається.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { HealthColors } from '@/utils/healthTheme';
import {
  ACCENT, ACCENT_CAL, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT, HEALTH_ACCENTS,
} from '@/utils/healthTheme';

/** Порядок вкладок — він же порядок у смузі. */
export const HEALTH_TABS = ['overview', 'nutrition', 'activity', 'sleep', 'body', 'prevention'] as const;

export type HealthTabId = (typeof HEALTH_TABS)[number];

/**
 * Значення `?tab=` з адреси у вкладку.
 *
 * Невідоме значення дає «Огляд», а не порожній екран: параметр приходить із
 * нагадувань і закладок, тобто з місць, які застосунок уже не контролює.
 */
export function parseHealthTab(raw: unknown): HealthTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return HEALTH_TABS.includes(value as HealthTabId) ? (value as HealthTabId) : 'overview';
}

export interface HealthTabMeta {
  id: HealthTabId;
  icon: IconSymbolName;
  color: string;
  /** Підпис — ключ словника: рядків у цьому файлі не заводимо. */
  label: (tr: Translations) => string;
}

export const HEALTH_TAB_META: HealthTabMeta[] = [
  { id: 'overview',   icon: 'chart.bar.fill',  color: ACCENT,        label: tr => tr.healthTabOverview },
  { id: 'nutrition',  icon: 'flame.fill',      color: ACCENT_CAL,    label: tr => tr.nutrition },
  // Тренування лишаються окремим розділом, а вкладка лише показує їхнє зведення.
  { id: 'activity',   icon: 'figure.walk',     color: ACCENT_STEPS,  label: tr => tr.healthTabActivity },
  { id: 'sleep',      icon: 'moon.fill',       color: ACCENT_SLEEP,  label: tr => tr.sleepRecovery },
  // «Тіло і вітальні»: вага, ІМТ, пульс і обводи — те, що було двома екранами.
  { id: 'body',       icon: 'ruler.fill',      color: ACCENT_WEIGHT, label: tr => tr.healthTabBody },
  { id: 'prevention', icon: 'cross.case.fill', color: HEALTH_ACCENTS.prevention, label: tr => tr.prevention },
];

export interface HealthTabBarProps {
  value: HealthTabId;
  onChange: (id: HealthTabId) => void;
  tr: Translations;
  c: HealthColors;
  /** Скільки справ «на сьогодні» висить у Профілактиці — бейдж на вкладці. */
  preventionBadge?: number;
}

/**
 * Смуга вкладок.
 *
 * Скролиться горизонтально, а не тисне шість підписів у ширину телефона:
 * «Активність · Тренування» не вміщається навіть на 430pt, і стиснення
 * перетворило б підписи на «Акт…». Активна вкладка тягне за собою колір свого
 * розділу — той самий, яким пофарбовані картки всередині.
 */
export function HealthTabBar({ value, onChange, tr, c, preventionBadge = 0 }: HealthTabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
      accessibilityRole="tablist">
      {HEALTH_TAB_META.map(meta => {
        const active = meta.id === value;
        const badge = meta.id === 'prevention' ? preventionBadge : 0;
        return (
          <TouchableOpacity
            key={meta.id}
            onPress={() => onChange(meta.id)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={meta.label(tr)}
            style={[s.tab, {
              borderColor: active ? meta.color : c.border,
              backgroundColor: active ? meta.color + '1F' : 'transparent',
            }]}>
            <IconSymbol name={meta.icon} size={14} color={active ? meta.color : c.sub} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={[s.label, { color: active ? meta.color : c.sub }]}>
              {meta.label(tr)}
            </Text>
            {badge > 0 && (
              <View style={[s.badge, { backgroundColor: meta.color }]}>
                <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 8, paddingRight: 4 },
  tab:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  label: { fontSize: 13, fontWeight: '700' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
