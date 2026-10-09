import { Atlas } from '@/constants/atlas';
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
import { Layout } from '@/constants/tokens';
import type { Translations } from '@/store/translations';
import { ACCENT, type HealthColors } from '@/utils/healthTheme';

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
  /** Короткий підпис на смузі — ключ словника: рядків у цьому файлі не заводимо. */
  label: (tr: Translations) => string;
  /** Повна назва розділу для VoiceOver («Активність і тренування»). */
  a11yLabel: (tr: Translations) => string;
}

/**
 * Рішення власника (07.10): ОДИН акцент — зелений розділу — для всіх вкладок.
 * Колір вкладки за розділом (помаранчеве харчування, індиго сон…) робив смугу
 * райдужною й не схожою на решту застосунку; кольори розділів лишились лише
 * на даних — кільцях і графіках. Тому поля `color` у маніфесті більше немає.
 *
 * Підписи — короткі (Огляд · Харчування · Активність · Сон · Тіло ·
 * Профілактика): шість вкладок мусять стати в один ряд на планшеті без
 * прокрутки, а «Активність і тренування» туди не вміщується.
 */
export const HEALTH_TAB_META: HealthTabMeta[] = [
  { id: 'overview',   icon: 'chart.bar.fill',  label: tr => tr.healthTabOverview, a11yLabel: tr => tr.healthTabOverview },
  { id: 'nutrition',  icon: 'flame.fill',      label: tr => tr.nutrition,         a11yLabel: tr => tr.nutrition },
  // Тренування лишаються окремим розділом, а вкладка лише показує їхнє зведення.
  { id: 'activity',   icon: 'figure.walk',     label: tr => tr.activity,          a11yLabel: tr => tr.healthTabActivity },
  { id: 'sleep',      icon: 'moon.fill',       label: tr => tr.sleep,             a11yLabel: tr => tr.sleepRecovery },
  // «Тіло і вітальні»: вага, ІМТ, пульс і обводи — те, що було двома екранами.
  { id: 'body',       icon: 'ruler.fill',      label: tr => tr.healthTabBodyShort, a11yLabel: tr => tr.healthTabBody },
  { id: 'prevention', icon: 'cross.case.fill', label: tr => tr.prevention,        a11yLabel: tr => tr.prevention },
];

/** Проміжок між вкладками на смузі. */
export const HEALTH_TAB_GAP = 6;
/** Від цієї ширини однієї вкладки (у режимі «в один ряд») поруч із підписом є місце для іконки. */
export const HEALTH_TAB_ICON_MIN_WIDTH = 116;
/** Поля смуги — ті самі 20pt, що в ScreenHeader. */
const HEADER_SIDE_PAD = 20;

export interface HealthTabBarLayout {
  /** true — горизонтальна прокрутка (телефон); false — усі шість в один ряд. */
  scroll: boolean;
  /** Показувати іконку поруч із підписом. */
  showIcons: boolean;
  /** Ширина однієї вкладки в режимі «в один ряд» (для тестів і рішення про іконки). */
  tabWidth: number;
}

/**
 * Чиста функція: як розкласти смугу вкладок.
 *
 * Телефон — прокрутка, як і була. Планшет (medium/expanded) — шість вкладок
 * ділять ширину порівну (fill), а на дуже широкому вікні ряд не ширший за
 * Layout.wideMaxWidth і стоїть по центру. Іконки зникають, коли вкладка
 * вужча за HEALTH_TAB_ICON_MIN_WIDTH: на найвужчому medium (Split View,
 * рейка) підпис важливіший за піктограму.
 */
export function healthTabBarLayout(screenWidth: number, isWide: boolean): HealthTabBarLayout {
  if (!isWide) return { scroll: true, showIcons: true, tabWidth: 0 };
  const row = Math.min(Math.max(0, screenWidth - HEADER_SIDE_PAD * 2), Layout.wideMaxWidth);
  const n = HEALTH_TAB_META.length;
  const tabWidth = Math.max(0, (row - HEALTH_TAB_GAP * (n - 1)) / n);
  return { scroll: false, showIcons: tabWidth >= HEALTH_TAB_ICON_MIN_WIDTH, tabWidth };
}

export interface HealthTabBarProps {
  value: HealthTabId;
  onChange: (id: HealthTabId) => void;
  tr: Translations;
  c: HealthColors;
  /** Скільки справ «на сьогодні» висить у Профілактиці — бейдж на вкладці. */
  preventionBadge?: number;
  /** Розкладка смуги — з healthTabBarLayout(); без неї — прокрутка (телефон). */
  layout?: HealthTabBarLayout;
}

/**
 * Смуга вкладок: контурні «пігулки», активна — зеленим акцентом розділу.
 *
 * На телефоні скролиться горизонтально, а не тисне шість підписів у ширину
 * екрана. На планшеті — один ряд без прокрутки.
 */
export function HealthTabBar({ value, onChange, tr, c, preventionBadge = 0, layout }: HealthTabBarProps) {
  const lay = layout ?? { scroll: true, showIcons: true, tabWidth: 0 };
  const tabs = HEALTH_TAB_META.map(meta => {
    const active = meta.id === value;
    const badge = meta.id === 'prevention' ? preventionBadge : 0;
    const label = meta.label(tr);
    return (
      <TouchableOpacity
        key={meta.id}
        onPress={() => onChange(meta.id)}
        activeOpacity={0.85}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={badge > 0 ? `${meta.a11yLabel(tr)}, ${badge}` : meta.a11yLabel(tr)}
        style={[s.tab, !lay.scroll && s.tabFill, {
          borderColor: active ? ACCENT : c.border,
          backgroundColor: active ? ACCENT + '1F' : 'transparent',
        }]}>
        {lay.showIcons && <IconSymbol name={meta.icon} size={14} color={active ? ACCENT : c.sub} />}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={!lay.scroll}
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.4}
          style={[s.label, !lay.scroll && s.labelFill, { color: active ? ACCENT : c.sub }]}>
          {label}
        </Text>
        {badge > 0 && (
          <View style={[s.badge, { backgroundColor: ACCENT }]}>
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  });

  if (!lay.scroll) {
    return (
      <View accessibilityRole="tablist" style={s.fillRow}>
        {tabs}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
      accessibilityRole="tablist">
      {tabs}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 8, paddingRight: 4 },
  // Планшет: ряд на всю ширину шапки, але не ширший за стелю дашборда — і по центру.
  fillRow: { flexDirection: 'row', gap: HEALTH_TAB_GAP, width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center' },
  tab:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  // Ширина за вмістом (flexBasis 'auto') + рівний розподіл залишку. Раніше
  // flex:1 давав УСІМ вкладкам однакову ширину, і найдовша «Профілактика» з
  // бейджем на iPad portrait стискала шрифт — помітно дрібніше за сусідів.
  // adjustsFontSizeToFit лишився запасним — лише коли ряд справді не вміщає.
  tabFill: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, justifyContent: 'center', paddingHorizontal: 8 },
  label:   { fontSize: 13, fontWeight: '700' },
  labelFill: { flexShrink: 1 },
  badge:   { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: Atlas.type.headingWeight },
});
