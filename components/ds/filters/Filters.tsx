/**
 * components/ds/filters/Filters.tsx — уніфіковані фільтри DS v2.5 (ПЛАНШЕТ).
 *
 * Один ряд, одна висота: видимо 36pt, а рамка контролу — 44pt (зона дотику
 * — справжній розмір, не hitSlop: hitSlop обрізається межами предка, A11Y-08).
 * Підпис усередині контролу:
 *   Segmented     — 2–4 взаємовиключні варіанти (Живі/Архів, Список/Kanban…)
 *   FilterSelect  — власне випадне меню «Підпис: Значення ⌄» (одиночний і
 *                   мультивибір), меню — «брудне скло» OverlaySurface
 *   FilterSearch  — поле пошуку тієї ж висоти
 *   FilterBar     — горизонтальний ряд без переносу; те, що не влізло,
 *                   їде в «Фільтри · N»
 *
 * Лише для НЕ компактних вікон: сторінка перевіряє `useFiltersV25()` і на
 * телефоні лишає свій старий UI. Самі примітиви існуючих екранів не чіпають.
 *
 * API дзеркальне до вебового `@/components/ui` (flowi-web-app/components/ui/filters.tsx).
 * Опис — docs/design-system-v2.md, розділ «Filters (v2.5)».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';

import { OverlaySurface } from '@/components/ds/OverlaySurface';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useResponsive } from '@/hooks/use-responsive';

import {
  FILTER_CONTROL_H, FILTER_GAP, FILTER_HIT_H, FILTER_SEARCH_THRESHOLD,
  countHiddenActive, filterTriggerText, matchesQuery, overflowTriggerText, partitionFilterItems, placeFilterMenu,
  type MenuAnchor,
} from './filterLogic';

// ─── Гейт ────────────────────────────────────────────────────────────────────

/**
 * Чи можна малювати фільтри v2.5: лише НЕ компактне вікно (iPad, широке
 * вікно Split View). Телефон/compact — старий UI сторінки без змін.
 */
export function useFiltersV25(): boolean {
  return useResponsive().isWide;
}

// ─── Спільне ─────────────────────────────────────────────────────────────────

type IconLike = IconSymbolName | ReactNode;

function renderIcon(icon: IconLike | undefined, color: string, size = 14) {
  if (icon == null || icon === false) return null;
  if (typeof icon === 'string') return <IconSymbol name={icon as IconSymbolName} size={size} color={color} />;
  return icon;
}

function useControlColors() {
  const { t, g, rt, isDark } = useDSTheme();
  return {
    t, isDark, rt,
    idle: rt ? t.surface.subtle : g.surfaceSubtle,
    border: t.border.hairline,
  };
}

/** Поповер-меню на «брудному склі», прив'язаний до тригера. */
function AnchoredMenu({
  open, anchor, onClose, label, children, width,
}: {
  open: boolean;
  anchor: MenuAnchor | null;
  onClose: () => void;
  label: string;
  children: ReactNode;
  width?: number;
}) {
  const win = useWindowDimensions();
  const [size, setSize] = useState({ w: width ?? 0, h: 0 });
  if (!open || !anchor) return null;
  const pos = placeFilterMenu(anchor, size, win);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрити меню"
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={{ position: 'absolute', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        onLayout={(e: LayoutChangeEvent) => {
          const h = e.nativeEvent.layout.height;
          if (Math.abs(h - size.h) > 1) setSize(s => ({ ...s, h }));
        }}>
        <OverlaySurface radius={radius.nested} style={{ maxHeight: pos.maxHeight, paddingVertical: 4 }}>
          {children}
        </OverlaySurface>
      </View>
    </Modal>
  );
}

// ─── Segmented ───────────────────────────────────────────────────────────────

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
  icon?: IconLike;
  count?: number | string;
  disabled?: boolean;
  testID?: string;
}

export interface SegmentedProps<V extends string = string> {
  /** Доступне ім'я групи: «Вигляд задач». */
  label: string;
  value: V;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  /** radiogroup (типово) · tablist (перемикає панелі) · pressed (кнопки-перемикачі). */
  semantics?: 'radiogroup' | 'tablist' | 'pressed';
  /** На всю ширину, сегменти порівну. */
  stretch?: boolean;
  /** Лише іконки; підпис — для озвучення. */
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Одна pill-доріжка 36pt з внутрішнім «бігунком» — для 2–4 взаємовиключних
 * варіантів. Більше варіантів — FilterSelect.
 */
export function Segmented<V extends string = string>({
  label, value, options, onChange, semantics = 'radiogroup', stretch, iconOnly, style, testID,
}: SegmentedProps<V>) {
  const { t, idle, border } = useControlColors();
  const reduceMotion = useReduceMotion();
  const [frames, setFrames] = useState<Record<string, { x: number; w: number }>>({});
  const thumbX = useRef(new Animated.Value(0)).current;
  const thumbW = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const frame = frames[value];

  useEffect(() => {
    if (!frame) return;
    if (!placed.current || reduceMotion) {
      thumbX.setValue(frame.x);
      thumbW.setValue(frame.w);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.timing(thumbX, { toValue: frame.x, duration: 180, useNativeDriver: false }),
      Animated.timing(thumbW, { toValue: frame.w, duration: 180, useNativeDriver: false }),
    ]).start();
  }, [frame, reduceMotion, thumbW, thumbX]);

  const groupRole = semantics === 'tablist' ? 'tablist' : semantics === 'radiogroup' ? 'radiogroup' : undefined;
  const itemRole = semantics === 'tablist' ? 'tab' : semantics === 'radiogroup' ? 'radio' : 'button';

  return (
    <View
      testID={testID}
      accessibilityRole={groupRole}
      accessibilityLabel={label}
      style={[st.track, stretch ? st.stretch : null, style]}>
      {/* Видима доріжка 36pt; сам рядок 44pt — це і є зона дотику (не hitSlop). */}
      <View pointerEvents="none" style={[st.trackFill, { backgroundColor: idle, borderColor: border }]} />
      {frame ? (
        <Animated.View
          pointerEvents="none"
          style={[st.thumb, { left: thumbX, width: thumbW, backgroundColor: t.action.primary }]}
        />
      ) : null}
      {options.map(opt => {
        const on = opt.value === value;
        const fg = opt.disabled ? t.text.muted : on ? t.text.onAction : t.text.secondary;
        const a11yLabel = opt.count != null ? `${opt.label}, ${opt.count}` : opt.label;
        return (
          <Pressable
            key={opt.value}
            testID={opt.testID ?? (testID ? `${testID}-${opt.value}` : undefined)}
            disabled={opt.disabled}
            onPress={() => { if (!on) onChange(opt.value); }}
            onLayout={(e: LayoutChangeEvent) => {
              const { x, width } = e.nativeEvent.layout;
              setFrames(f => (f[opt.value]?.x === x && f[opt.value]?.w === width ? f : { ...f, [opt.value]: { x, w: width } }));
            }}
            accessibilityRole={itemRole}
            accessibilityLabel={a11yLabel}
            accessibilityState={
              semantics === 'radiogroup' ? { checked: on, disabled: opt.disabled } : { selected: on, disabled: opt.disabled }
            }
            style={({ pressed }) => [
              st.seg,
              stretch ? { flex: 1 } : null,
              pressed && !on ? { opacity: 0.7 } : null,
            ]}>
            {/* Поки бігунок не виміряний — активний сегмент фарбується сам. */}
            {on && !frame ? <View pointerEvents="none" style={[st.segFallback, { backgroundColor: t.action.primary }]} /> : null}
            {renderIcon(opt.icon, fg)}
            {iconOnly ? null : (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.segLabel, { color: fg }]}>{opt.label}</Text>
            )}
            {opt.count != null && !iconOnly ? (
              <Text style={[st.count, { color: fg }]}>{opt.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── FilterSelect ────────────────────────────────────────────────────────────

export interface FilterOption<V extends string = string> {
  value: V;
  label: string;
  icon?: IconLike;
  /** Кольорова крапка (колір проєкту). */
  color?: string;
  count?: number | string;
  description?: string;
  disabled?: boolean;
}

interface FilterSelectCommon<V extends string> {
  /** Підпис усередині тригера («Проєкт») і доступне ім'я. */
  label: string;
  options: readonly FilterOption<V>[];
  /** Текст «нічого не обрано» у тригері (типово «Усі»). */
  allLabel?: string;
  placeholder?: string;
  /** Пошук у меню; типово — коли варіантів > 8. */
  searchable?: boolean;
  /** «Скинути» в мультивиборі. */
  resetLabel?: string;
  /** Сховати «Підпис:» (лишається в озвученні). */
  hideLabel?: boolean;
  icon?: IconLike;
  disabled?: boolean;
  /** Розтягнути тригер (усередині меню «Фільтри»). */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface FilterSelectSingleProps<V extends string = string> extends FilterSelectCommon<V> {
  multiple?: false;
  value: V | null;
  onChange: (value: V | null) => void;
  /** Рядок «нічого не обрано» у меню («Усі проєкти») → onChange(null). */
  emptyOption?: { label: string };
  /** Значення, яке теж вважається «не фільтрує» (напр. 'all'). */
  neutralValue?: V;
}

export interface FilterSelectMultiProps<V extends string = string> extends FilterSelectCommon<V> {
  multiple: true;
  value: readonly V[];
  onChange: (value: V[]) => void;
}

export type FilterSelectProps<V extends string = string> = FilterSelectSingleProps<V> | FilterSelectMultiProps<V>;

/** Чи фільтрує зараз FilterSelect (для `active` у FilterBar). */
export function isFilterSelectActive<V extends string>(p: { multiple?: boolean; value: V | null | readonly V[]; neutralValue?: V }): boolean {
  if (Array.isArray(p.value)) return p.value.length > 0;
  return p.value != null && p.value !== p.neutralValue;
}

export function FilterSelect<V extends string = string>(props: FilterSelectProps<V>) {
  const {
    label, options, allLabel = 'Усі', placeholder, searchable, resetLabel = 'Скинути', hideLabel, icon,
    disabled, stretch, style, testID,
  } = props;
  const { t, idle, border } = useControlColors();
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [query, setQuery] = useState('');

  const selected: V[] = props.multiple ? [...props.value] : props.value != null ? [props.value] : [];
  const selectedLabels = selected
    .map(v => options.find(o => o.value === v)?.label)
    .filter((l): l is string => Boolean(l));
  const singleNullLabel = !props.multiple && props.value == null ? props.emptyOption?.label : undefined;
  const text = filterTriggerText({
    label, multiple: props.multiple, selectedLabels, allLabel, placeholder: singleNullLabel ?? placeholder,
  });
  const active = props.multiple ? props.value.length > 0 : isFilterSelectActive(props);
  const showSearch = searchable ?? options.length > FILTER_SEARCH_THRESHOLD;
  const rows = useMemo(() => options.filter(o => matchesQuery(o.label, query)), [options, query]);

  const openMenu = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  }, []);
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);

  const pick = (v: V | null) => {
    if (props.multiple) {
      if (v == null) { props.onChange([]); return; }
      const has = props.value.includes(v);
      props.onChange(has ? props.value.filter(x => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
      close();
    }
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        testID={testID}
        disabled={disabled}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={text.prefix ? `${label}: ${text.value}` : text.value}
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [
          st.hit,
          stretch ? st.stretch : null,
          pressed ? { opacity: 0.7 } : null,
          disabled ? { opacity: 0.5 } : null,
          style,
        ]}>
        <View style={[st.pill, { backgroundColor: idle, borderColor: active ? t.text.secondary : border }, stretch ? st.pillStretch : null]}>
          {renderIcon(icon, t.text.secondary)}
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.pillText, stretch ? { flex: 1 } : { flexShrink: 1 }]}>
            {text.prefix && !hideLabel ? <Text style={{ color: t.text.secondary }}>{`${text.prefix}: `}</Text> : null}
            <Text style={{ color: t.text.primary }}>{text.value}</Text>
          </Text>
          <IconSymbol name="chevron.down" size={14} color={t.text.secondary} />
        </View>
      </Pressable>

      <AnchoredMenu open={open} anchor={anchor} onClose={close} label={label}>
        {showSearch ? (
          <View style={[st.searchWrap, { backgroundColor: idle }]}>
            <IconSymbol name="magnifyingglass" size={14} color={t.text.secondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Пошук"
              placeholderTextColor={t.text.muted}
              accessibilityLabel={`Пошук: ${label}`}
              autoCorrect={false}
              style={[st.searchInput, { color: t.text.primary }]}
            />
          </View>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }}>
          {!props.multiple && props.emptyOption && matchesQuery(props.emptyOption.label, query) ? (
            <OptionRow
              label={props.emptyOption.label}
              checked={props.value == null}
              mode="single"
              muted
              onPress={() => pick(null)}
            />
          ) : null}
          {rows.map(o => (
            <OptionRow
              key={o.value}
              label={o.label}
              icon={o.icon}
              color={o.color}
              count={o.count}
              description={o.description}
              disabled={o.disabled}
              checked={selected.includes(o.value)}
              mode={props.multiple ? 'multi' : 'single'}
              onPress={() => pick(o.value)}
            />
          ))}
          {rows.length === 0 ? (
            <Text style={[st.empty, { color: t.text.secondary }]}>Нічого не знайдено</Text>
          ) : null}
        </ScrollView>
        {props.multiple ? (
          <View style={[st.footer, { borderTopColor: border }]}>
            <Pressable
              onPress={() => pick(null)}
              disabled={props.value.length === 0}
              accessibilityRole="button"
              style={({ pressed }) => [st.footerBtn, pressed ? { opacity: 0.6 } : null]}>
              <Text style={[st.footerText, { color: props.value.length ? t.text.primary : t.text.muted }]}>{resetLabel}</Text>
            </Pressable>
            <Pressable onPress={close} accessibilityRole="button" style={st.footerBtn}>
              <Text style={[st.footerText, { color: t.text.primary, fontFamily: fontFamily.semibold }]}>Готово</Text>
            </Pressable>
          </View>
        ) : null}
      </AnchoredMenu>
    </>
  );
}

function OptionRow({
  label, icon, color, count, description, disabled, checked, mode, muted, onPress,
}: {
  label: string;
  icon?: IconLike;
  color?: string;
  count?: number | string;
  description?: string;
  disabled?: boolean;
  checked: boolean;
  mode: 'single' | 'multi';
  muted?: boolean;
  onPress: () => void;
}) {
  const { t, idle } = useControlColors();
  const fg = disabled ? t.text.muted : muted ? t.text.secondary : t.text.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={mode === 'multi' ? 'checkbox' : 'radio'}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [st.option, pressed ? { backgroundColor: idle } : null]}>
      {mode === 'multi' ? (
        <View style={[st.checkbox, { borderColor: checked ? t.action.primary : t.text.secondary }, checked ? { backgroundColor: t.action.primary } : null]}>
          {checked ? <IconSymbol name="checkmark" size={12} color={t.text.onAction} /> : null}
        </View>
      ) : null}
      {color ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
      {renderIcon(icon, t.text.secondary, 16)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.optionText, { color: fg }]}>{label}</Text>
        {description ? (
          <Text numberOfLines={2} style={[st.optionDesc, { color: t.text.secondary }]}>{description}</Text>
        ) : null}
      </View>
      {count != null ? <Text style={[st.count, { color: t.text.secondary }]}>{count}</Text> : null}
      {mode === 'single' && checked ? <IconSymbol name="checkmark" size={16} color={t.text.primary} /> : null}
    </Pressable>
  );
}

// ─── FilterSearch ────────────────────────────────────────────────────────────

export function FilterSearch({
  value, onChangeText, placeholder = 'Пошук', label, style, testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Доступне ім'я поля. */
  label: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t, idle, border } = useControlColors();
  return (
    <View style={[st.hit, st.search, style]}>
      <View style={[st.pill, st.searchPill, { backgroundColor: idle, borderColor: border }]}>
      <IconSymbol name="magnifyingglass" size={14} color={t.text.secondary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.text.muted}
        accessibilityLabel={label}
        returnKeyType="search"
        autoCorrect={false}
        style={[st.searchInput, { color: t.text.primary }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Очистити пошук" style={st.clearBtn}>
          <IconSymbol name="xmark.circle.fill" size={16} color={t.text.muted} />
        </Pressable>
      ) : null}
      </View>
    </View>
  );
}

// ─── FilterBar ───────────────────────────────────────────────────────────────

export interface FilterBarItem {
  id: string;
  node: ReactNode;
  /** Чи фільтрує зараз (true → 1, число → стільки) — для «Фільтри · N». */
  active?: boolean | number;
  /** Ніколи не ховати в «Фільтри». */
  pinned?: boolean;
  /** Підпис над контролом — ЛИШЕ в меню «Фільтри» (для Segmented без власного підпису). */
  menuLabel?: string;
}

export interface FilterBarProps {
  /** Доступне ім'я ряду: «Фільтри проєктів». */
  label: string;
  items: readonly FilterBarItem[];
  /** Ліворуч, не ховається (FilterSearch). */
  search?: ReactNode;
  /** Праворуч, не ховається. */
  actions?: ReactNode;
  overflowLabel?: string;
  /** Показати «Скинути», коли хоч щось активне. */
  onReset?: () => void;
  resetLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * ОДИН ряд без переносу. Вимірює елементи у невидимому ряду, ділить їх
 * `partitionFilterItems`, а хвіст, що не вліз, складає в «Фільтри · N».
 */
export function FilterBar({
  label, items, search, actions, overflowLabel = 'Фільтри', onReset, resetLabel = 'Скинути', style, testID,
}: FilterBarProps) {
  const { t, idle, border } = useControlColors();
  const [available, setAvailable] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [overflowW, setOverflowW] = useState(0);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const overflowRef = useRef<View>(null);

  const measured = items.every(it => widths[it.id] != null) && overflowW > 0 && available > 0;
  const { visible, hidden } = measured
    ? partitionFilterItems({
        widths: items.map(it => widths[it.id]),
        pinned: items.map(it => Boolean(it.pinned)),
        available,
        gap: FILTER_GAP,
        overflowWidth: overflowW,
      })
    : { visible: items.map((_, i) => i), hidden: [] as number[] };
  const hiddenActive = countHiddenActive(hidden, items.map(it => it.active));
  const anyActive = items.some(it => (typeof it.active === 'number' ? it.active > 0 : Boolean(it.active)));

  useEffect(() => { if (!hidden.length && open) setOpen(false); }, [hidden.length, open]);

  const openOverflow = () => {
    overflowRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  return (
    <View testID={testID} accessibilityLabel={label} style={[st.bar, style]}>
      {search ? <View style={st.searchSlot}>{search}</View> : null}
      <View
        style={st.itemsRegion}
        onLayout={(e: LayoutChangeEvent) => setAvailable(Math.floor(e.nativeEvent.layout.width))}>
        {/* Вимірювальний ряд: невидимий, без дотику й озвучення. */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={st.measure}>
          {items.map(it => (
            <View
              key={it.id}
              style={st.itemSlot}
              onLayout={(e: LayoutChangeEvent) => {
                const w = Math.ceil(e.nativeEvent.layout.width);
                setWidths(m => (m[it.id] === w ? m : { ...m, [it.id]: w }));
              }}>
              {it.node}
            </View>
          ))}
          <View style={st.itemSlot} onLayout={(e: LayoutChangeEvent) => setOverflowW(Math.ceil(e.nativeEvent.layout.width))}>
            <View style={st.hit}>
              <View style={[st.pill, { borderColor: border }]}>
                <IconSymbol name="line.3.horizontal.decrease" size={14} color={t.text.secondary} />
                <Text style={st.pillText}>{overflowTriggerText(overflowLabel, 99)}</Text>
              </View>
            </View>
          </View>
        </View>

        {visible.map(i => (
          <View key={items[i].id} style={st.itemSlot}>{items[i].node}</View>
        ))}
        {hidden.length ? (
          <Pressable
            ref={overflowRef}
            onPress={openOverflow}
            accessibilityRole="button"
            accessibilityLabel={hiddenActive ? `${overflowLabel}, активних: ${hiddenActive}` : overflowLabel}
            accessibilityState={{ expanded: open }}
            style={({ pressed }) => [st.hit, pressed ? { opacity: 0.7 } : null]}>
            <View style={[st.pill, { backgroundColor: idle, borderColor: hiddenActive ? t.text.secondary : border }]}>
              <IconSymbol name="line.3.horizontal.decrease" size={14} color={t.text.secondary} />
              <Text numberOfLines={1} style={[st.pillText, { color: t.text.primary }]}>
                {overflowTriggerText(overflowLabel, hiddenActive)}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      {onReset && anyActive ? (
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          style={({ pressed }) => [st.hit, st.ghost, pressed ? { opacity: 0.6 } : null]}>
          <Text style={[st.pillText, { color: t.text.secondary }]}>{resetLabel}</Text>
        </Pressable>
      ) : null}
      {actions ? <View style={st.actionsSlot}>{actions}</View> : null}

      <AnchoredMenu open={open && hidden.length > 0} anchor={anchor} onClose={() => setOpen(false)} label={overflowLabel}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={st.overflowList}>
          {hidden.map(i => (
            <View key={items[i].id} style={st.overflowItem}>
              {items[i].menuLabel ? (
                <Text style={[st.overflowCaption, { color: t.text.secondary }]}>{items[i].menuLabel}</Text>
              ) : null}
              {items[i].node}
            </View>
          ))}
        </ScrollView>
      </AnchoredMenu>
    </View>
  );
}

// ─── Стилі ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  overflowCaption: { fontSize: 12, lineHeight: 16, marginBottom: 2 },
  track: { flexDirection: 'row', alignItems: 'center', height: FILTER_HIT_H, paddingHorizontal: 2, alignSelf: 'flex-start' },
  trackFill: {
    position: 'absolute', left: 0, right: 0, top: (FILTER_HIT_H - FILTER_CONTROL_H) / 2, bottom: (FILTER_HIT_H - FILTER_CONTROL_H) / 2,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  stretch: { alignSelf: 'stretch' },
  thumb: {
    position: 'absolute', top: (FILTER_HIT_H - FILTER_CONTROL_H) / 2 + 2, bottom: (FILTER_HIT_H - FILTER_CONTROL_H) / 2 + 2,
    borderRadius: radius.pill,
  },
  seg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: FILTER_HIT_H, minWidth: 44, paddingHorizontal: 12,
  },
  segFallback: {
    position: 'absolute', left: 0, right: 0, top: (FILTER_HIT_H - FILTER_CONTROL_H) / 2 + 2, bottom: (FILTER_HIT_H - FILTER_CONTROL_H) / 2 + 2,
    borderRadius: radius.pill,
  },
  hit: { height: FILTER_HIT_H, justifyContent: 'center', alignSelf: 'flex-start' },
  segLabel: { fontSize: 13, fontFamily: fontFamily.medium },
  count: { fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: FILTER_CONTROL_H,
    paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  pillStretch: { alignSelf: 'stretch', justifyContent: 'space-between' },
  pillText: { fontSize: 13, fontFamily: fontFamily.medium },
  ghost: { paddingHorizontal: 10 },
  search: { minWidth: 160, maxWidth: 280, alignSelf: 'stretch' },
  searchPill: { paddingHorizontal: 12 },
  clearBtn: { width: 32, height: FILTER_HIT_H, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: FILTER_CONTROL_H,
    marginHorizontal: 6, marginTop: 2, marginBottom: 4, paddingHorizontal: 10, borderRadius: radius.control,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fontFamily.regular, paddingVertical: 0 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
    paddingHorizontal: 12, marginHorizontal: 4, borderRadius: radius.control,
  },
  optionText: { fontSize: 14, fontFamily: fontFamily.regular },
  optionDesc: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 1 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { fontSize: 14, paddingHorizontal: 16, paddingVertical: 12 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4, paddingHorizontal: 8, paddingTop: 4,
  },
  footerBtn: { height: FILTER_HIT_H, justifyContent: 'center', paddingHorizontal: 8 },
  footerText: { fontSize: 14, fontFamily: fontFamily.medium },
  bar: { flexDirection: 'row', alignItems: 'center', gap: FILTER_GAP, minHeight: FILTER_HIT_H },
  searchSlot: { flexShrink: 1, flexGrow: 0, minWidth: 160, maxWidth: 280 },
  itemsRegion: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: FILTER_GAP, overflow: 'hidden' },
  itemSlot: { flexShrink: 0 },
  measure: { position: 'absolute', left: 0, top: 0, width: 10000, opacity: 0, flexDirection: 'row', alignItems: 'center' },
  actionsSlot: { flexDirection: 'row', alignItems: 'center', gap: FILTER_GAP, flexShrink: 0 },
  overflowList: { gap: 8, padding: 8 },
  overflowItem: { alignSelf: 'stretch' },
});
