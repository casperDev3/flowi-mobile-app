/**
 * components/finance/SubscriptionForm.tsx — створення й редагування підписки.
 *
 * Аркуш (SheetModal) з усіма полями контракту: назва, сума, валюта, період
 * «кожні N днів/тижнів/місяців/років», наступна оплата, дата завершення або
 * безстроково, нагадування, проєкт, іконка + колір, категорія, рахунок (лише
 * довідково), нотатка, посилання.
 *
 * Форма нічого не пише сама: вона віддає чернетку в onSubmit, а екран робить
 * read-modify-write через applySubscriptionDraft (правка спредить наявний
 * запис — поля від інших клієнтів не губляться).
 *
 * Календар дат розкривається ІНЛАЙН, а не другою модалкою: аркуш уже модалка,
 * і iOS надійно не показує модалку поверх модалки.
 */
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { dsTheme, glassOf } from '@/components/shared/dsTheme';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { PickerField, type PickerFieldColors } from '@/components/shared/PickerField';
import { SheetModal } from '@/components/shared/SheetModal';
import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { monthGrid } from '@/utils/dateUtils';
import {
  PERIOD_UNITS,
  REMINDER_DAY_OPTIONS,
  dateKeyOf,
  formatDateKey,
  parseDateKey,
  periodUnitLabel,
  type SubscriptionDraft,
  type SubscriptionDraftError,
} from '@/utils/subscriptions';
import { useGlassStyles } from '@/components/finance/finPalette';

export const SUBSCRIPTION_ICONS: IconSymbolName[] = [
  'repeat', 'tv.fill', 'music.note', 'play.circle.fill', 'gamecontroller.fill', 'icloud.fill',
  'globe', 'wifi', 'phone.fill', 'house.fill', 'cart.fill', 'dumbbell.fill',
  'books.vertical.fill', 'graduationcap.fill', 'sparkles', 'creditcard.fill', 'bolt.fill', 'car.fill',
  'heart.fill', 'building.2.fill', 'laptopcomputer', 'brain',
];

export const SUBSCRIPTION_COLORS = [
  '#8B5CF6', '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#14B8A6', '#0EA5E9', '#3B82F6', '#EC4899', '#64748B',
];

export interface SubscriptionFormColors extends PickerFieldColors {
  red: string;
}

export interface SubscriptionFormOption {
  id: string;
  label: string;
  color?: string;
  icon?: IconSymbolName;
}

export function SubscriptionForm({
  visible, editing, initialDraft, onClose, onSubmit, error,
  currencies, projects, categories, accounts,
  colors: c, isDark, tr, lang,
}: {
  visible: boolean;
  /** Правка чи створення — лише для заголовка. */
  editing: boolean;
  initialDraft: SubscriptionDraft;
  onClose: () => void;
  onSubmit: (draft: SubscriptionDraft) => void;
  /** Помилка останньої спроби зберегти (валідація або запис). */
  error: SubscriptionDraftError | 'save' | null;
  currencies: { code: string; symbol: string }[];
  projects: SubscriptionFormOption[];
  categories: SubscriptionFormOption[];
  accounts: SubscriptionFormOption[];
  colors: SubscriptionFormColors;
  isDark: boolean;
  tr: Translations;
  lang: 'uk' | 'en';
}) {
  const { height, isWide } = useResponsive();
  const { t: ds } = useDS();
  const gs = useGlassStyles();
  const [draft, setDraft] = useState<SubscriptionDraft>(initialDraft);
  const [openCalendar, setOpenCalendar] = useState<'next' | 'end' | null>(null);

  // Кожне відкриття починається з тієї чернетки, яку дав екран.
  useEffect(() => {
    if (visible) {
      setDraft(initialDraft);
      setOpenCalendar(null);
    }
    // initialDraft навмисно лише на відкритті: екран перечитує сховище, і
    // нова посилка тих самих даних не мусить стирати набране.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const patch = (p: Partial<SubscriptionDraft>) => setDraft(d => ({ ...d, ...p }));
  const everyNum = Math.max(1, parseInt(draft.every, 10) || 1);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const reminderLabel = (days: number) =>
    days === 0 ? tr.subReminderDayOf : days === 1 ? tr.subReminder1 : days === 3 ? tr.subReminder3 : tr.subReminder7;

  const errorText = error === 'invalid'
    ? tr.subFormInvalid
    : error === 'endBeforeNext'
      ? tr.subEndBeforeNext
      : error === 'save'
        ? tr.subSaveError
        : null;

  const currencyList = useMemo(() => {
    // Валюта наявної підписки лишається вибраною, навіть якщо її прибрали з довідника.
    if (draft.currency && !currencies.some(cur => cur.code === draft.currency)) {
      return [...currencies, { code: draft.currency, symbol: draft.currency }];
    }
    return currencies;
  }, [currencies, draft.currency]);

  const pickerColors: PickerFieldColors = { text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet };
  const iconsPerRow = isWide ? 11 : 6;

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, { ...gs.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
        <OverlayMaterial isDark={isDark} radius={24} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[st.title, { color: c.text }]}>{editing ? tr.subEditTitle : tr.subNew}</Text>

          {/* Назва */}
          <Text style={[st.label, { color: c.sub }]}>{tr.subName}
            <Text style={{ color: ds.status.danger }}> *</Text>
          </Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            placeholder={tr.subNamePlaceholder}
            placeholderTextColor={ds.text.muted}
            autoFocus={!editing}
            maxLength={120}
            style={[st.input, { color: c.text, borderColor: error && !draft.name.trim() ? ds.status.danger : 'transparent', backgroundColor: c.dim }]}
          />

          {/* Сума + валюта */}
          <Text style={[st.label, { color: c.sub }]}>{tr.subAmountPerCycle}
            <Text style={{ color: ds.status.danger }}> *</Text>
          </Text>
          <TextInput
            value={draft.amount}
            onChangeText={(amount) => patch({ amount })}
            placeholder="0"
            placeholderTextColor={ds.text.muted}
            keyboardType="decimal-pad"
            accessibilityLabel={tr.subAmountPerCycle}
            style={[st.input, { color: c.text, borderColor:
                  error && !(Number(draft.amount.replace(",", ".")) > 0)
                    ? ds.status.danger
                    : 'transparent', backgroundColor: c.dim, fontSize: 18, fontFamily: fontFamily.semibold }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
            <View style={st.chipsRow}>
              {currencyList.map((cur) => {
                const on = draft.currency === cur.code;
                return (
                  <TouchableOpacity
                    key={cur.code}
                    onPress={() => patch({ currency: cur.code })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${tr.currency}: ${cur.code}`}
                    style={[st.chip, { backgroundColor: on ? ds.action.primary : (gs.subtle.backgroundColor as string), borderColor: 'transparent' }]}>
                    <Text style={{ color: on ? ds.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                      {cur.symbol} {cur.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Період: кожні N + одиниця */}
          <Text style={[st.label, { color: c.sub }]}>
            {tr.subPeriod}
            <Text style={{ color: ds.status.danger }}> *</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
              {tr.subEvery}
            </Text>
            <TouchableOpacity
              onPress={() => patch({ every: String(Math.max(1, everyNum - 1)) })}
              accessibilityRole="button"
              accessibilityLabel="−"
              style={[st.stepBtn, { backgroundColor: c.dim }]}>
              <IconSymbol name="minus" size={14} color={c.text} />
            </TouchableOpacity>
            <TextInput
              value={draft.every}
              onChangeText={every => patch({ every: every.replace(/[^0-9]/g, '').slice(0, 3) })}
              keyboardType="number-pad"
              accessibilityLabel={tr.subEvery}
              style={[st.input, st.everyInput, { color: c.text, borderColor: 'transparent', backgroundColor: c.dim }]}
            />
            <TouchableOpacity
              onPress={() => patch({ every: String(Math.min(999, everyNum + 1)) })}
              accessibilityRole="button"
              accessibilityLabel="+"
              style={[st.stepBtn, { backgroundColor: c.dim }]}>
              <IconSymbol name="plus" size={14} color={c.text} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
            <View style={st.chipsRow}>
              {PERIOD_UNITS.map(unit => {
                const on = draft.unit === unit;
                return (
                  <TouchableOpacity
                    key={unit}
                    onPress={() => patch({ unit })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[st.chip, { backgroundColor: on ? ds.action.primary : (gs.subtle.backgroundColor as string), borderColor: 'transparent' }]}>
                    <Text style={{ color: on ? ds.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                      {periodUnitLabel(unit, everyNum, lang)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Наступна оплата */}
          <Text style={[st.label, { color: c.sub }]}>
            {tr.subNextPayment}
            <Text style={{ color: ds.status.danger }}> *</Text>
          </Text>
          <DateButton
            value={draft.nextPaymentDate}
            open={openCalendar === 'next'}
            onToggle={() => setOpenCalendar(v => (v === 'next' ? null : 'next'))}
            label={tr.subNextPayment}
            locale={locale}
            c={c}
          />
          {openCalendar === 'next' ? (
            <InlineCalendar
              value={draft.nextPaymentDate}
              onPick={key => { patch({ nextPaymentDate: key }); setOpenCalendar(null); }}
              c={c}
              tr={tr}
            />
          ) : null}

          {/* Дата завершення / безстроково */}
          <Text style={[st.label, { color: c.sub }]}>{tr.subEndDate}</Text>
          <View style={st.chipsRow}>
            {([
              { on: draft.endDate === null, label: tr.subIndefinite, onPress: () => { patch({ endDate: null }); setOpenCalendar(null); } },
              {
                on: draft.endDate !== null,
                label: tr.subSetEndDate,
                onPress: () => {
                  if (draft.endDate === null) {
                    patch({ endDate: draft.nextPaymentDate || dateKeyOf(new Date()) });
                  }
                  setOpenCalendar('end');
                },
              },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.label}
                onPress={opt.onPress}
                accessibilityRole="button"
                accessibilityState={{ selected: opt.on }}
                style={[st.chip, { backgroundColor: opt.on ? ds.action.primary : (gs.subtle.backgroundColor as string), borderColor: 'transparent' }]}>
                <Text style={{ color: opt.on ? ds.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {draft.endDate !== null ? (
            <View style={{ marginTop: 8 }}>
              <DateButton
                value={draft.endDate}
                open={openCalendar === 'end'}
                onToggle={() => setOpenCalendar(v => (v === 'end' ? null : 'end'))}
                label={tr.subEndDate}
                locale={locale}
                c={c}
              />
              {openCalendar === 'end' ? (
                <InlineCalendar
                  value={draft.endDate}
                  onPick={key => { patch({ endDate: key }); setOpenCalendar(null); }}
                  c={c}
                  tr={tr}
                />
              ) : null}
            </View>
          ) : null}

          {/* Нагадування */}
          <Text style={[st.label, { color: c.sub }]}>{tr.subReminder}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={st.chipsRow}>
              {REMINDER_DAY_OPTIONS.map((days) => {
                const on = draft.reminderDaysBefore === days;
                return (
                  <TouchableOpacity
                    key={days}
                    onPress={() => patch({ reminderDaysBefore: days })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[st.chip, { backgroundColor: on ? ds.action.primary : (gs.subtle.backgroundColor as string), borderColor: 'transparent' }]}>
                    <IconSymbol name="bell" size={12} color={on ? ds.text.onAction : c.sub} />
                    <Text style={{ color: on ? ds.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                      {reminderLabel(days)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Проєкт / категорія / рахунок */}
          <PickerField
            label={tr.project}
            icon="folder"
            options={projects}
            value={draft.projectId}
            onSelect={projectId => patch({ projectId })}
            emptyOption={{ label: tr.noProject }}
            selectedLabel={draft.projectId ? projects.find(p => p.id === draft.projectId)?.label ?? null : null}
            alwaysSearch
            colors={pickerColors}
            isDark={isDark}
            tr={tr}
          />
          <PickerField
            label={tr.category}
            icon="tag.fill"
            options={categories}
            value={draft.category}
            onSelect={category => patch({ category })}
            emptyOption={{ label: tr.subNoCategory }}
            selectedLabel={draft.category}
            alwaysSearch
            colors={pickerColors}
            isDark={isDark}
            tr={tr}
          />
          <PickerField
            label={tr.account}
            icon="creditcard.fill"
            options={accounts}
            value={draft.accountId}
            onSelect={accountId => patch({ accountId })}
            emptyOption={{ label: tr.subNoAccount }}
            colors={pickerColors}
            isDark={isDark}
            tr={tr}
          />
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 4 }}>
            {tr.subAccountHint}
          </Text>

          {/* Іконка */}
          <Text style={[st.label, { color: c.sub }]}>{tr.icon}</Text>
          {chunk(SUBSCRIPTION_ICONS, iconsPerRow).map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {row.map(icon => {
                const on = draft.icon === icon;
                return (
                  <TouchableOpacity
                    key={icon}
                    onPress={() => patch({ icon })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${tr.icon}: ${icon}`}
                    style={[st.iconOption, { backgroundColor: on ? draft.color + '30' : c.dim, borderColor: on ? draft.color : 'transparent' }]}>
                    <IconSymbol name={icon} size={18} color={on ? draft.color : c.sub} />
                  </TouchableOpacity>
                );
              })}
              {row.length < iconsPerRow
                ? Array.from({ length: iconsPerRow - row.length }).map((_, i) => <View key={`pad${i}`} style={{ flex: 1 }} />)
                : null}
            </View>
          ))}

          {/* Колір */}
          <Text style={[st.label, { color: c.sub }]}>{tr.subColor}</Text>
          <View style={[st.chipsRow, { flexWrap: 'wrap' }]}>
            {SUBSCRIPTION_COLORS.map(color => {
              const on = draft.color.toLowerCase() === color.toLowerCase();
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => patch({ color })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${tr.subColor}: ${color}`}
                  style={[st.swatch, { backgroundColor: color, borderColor: on ? c.text : 'transparent' }]}>
                  {on ? <IconSymbol name="checkmark" size={14} color="#fff" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Нотатка + посилання */}
          <Text style={[st.label, { color: c.sub }]}>{tr.note}</Text>
          <TextInput
            value={draft.note}
            onChangeText={note => patch({ note })}
            placeholder={tr.note}
            placeholderTextColor={ds.text.muted}
            multiline
            maxLength={1000}
            style={[st.input, { color: c.text, borderColor: 'transparent', backgroundColor: c.dim, minHeight: 64, textAlignVertical: 'top' }]}
          />
          <Text style={[st.label, { color: c.sub }]}>{tr.subUrl}</Text>
          <TextInput
            value={draft.url}
            onChangeText={url => patch({ url })}
            placeholder="https://"
            placeholderTextColor={ds.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={500}
            style={[st.input, { color: c.text, borderColor: 'transparent', backgroundColor: c.dim }]}
          />

          {errorText ? (
            <Text accessibilityLiveRegion="polite" style={{ color: c.red, fontSize: 13, fontFamily: fontFamily.semibold, marginTop: 12 }}>
              {errorText}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => onSubmit(draft)}
            accessibilityRole="button"
            accessibilityLabel={tr.save}
            style={[st.saveBtn, { backgroundColor: ds.action.primary }]}>
            <Text style={{ ...dsType.label, fontSize: 15, color: ds.text.onAction }}>
              {editing ? tr.save : tr.create}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SheetModal>
  );
}

// ─── Дата ─────────────────────────────────────────────────────────────────────

function DateButton({ value, open, onToggle, label, locale, c }: {
  value: string;
  open: boolean;
  onToggle: () => void;
  label: string;
  locale: string;
  c: SubscriptionFormColors;
}) {
  const text = formatDateKey(value, locale);
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${text}`}
      style={[st.dateBtn, { borderColor: 'transparent', backgroundColor: c.dim }]}>
      <IconSymbol name="calendar" size={15} color={open ? c.text : c.sub} />
      <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
        {text}
      </Text>
      <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={13} color={c.sub} />
    </TouchableOpacity>
  );
}

function InlineCalendar({ value, onPick, c, tr }: {
  value: string;
  onPick: (dateKey: string) => void;
  c: SubscriptionFormColors;
  tr: Translations;
}) {
  const parsed = parseDateKey(value);
  const today = new Date();
  const [year, setYear] = useState(parsed ? parsed.y : today.getFullYear());
  const [month, setMonth] = useState(parsed ? parsed.m - 1 : today.getMonth());
  const selected = parsed ? new Date(parsed.y, parsed.m - 1, parsed.d).toDateString() : null;
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const empty = useMemo(() => new Set<string>(), []);

  const shift = (delta: number) => {
    const total = year * 12 + month + delta;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
  };

  return (
    <View style={[st.calendar, { borderColor: 'transparent', backgroundColor: c.dim }]}>
      <CalendarGrid
        year={year}
        month={month}
        markedDays={empty}
        selectedDate={selected}
        todayDate={today}
        weeks={weeks}
        onPrevMonth={() => shift(-1)}
        onNextMonth={() => shift(1)}
        onSelectDay={d => onPick(dateKeyOf(d))}
        c={c}
        months={tr.months}
        weekdays={tr.weekdays}
      />
    </View>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const st = StyleSheet.create({
  sheet:      { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  title:      { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, marginBottom: 4 },
  label:      { fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 16, marginBottom: 6, letterSpacing: 0.3 },
  // Поля DS: subtle-тло; рамка лише для стану помилки (прозора у спокої).
  input:      { borderRadius: radius.control, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 11, fontSize: 15, fontFamily: fontFamily.regular, ...dsType.numeric },
  everyInput: { width: 64, textAlign: 'center', paddingVertical: 8, fontFamily: fontFamily.semibold },
  stepBtn:    { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chipsRow:   { flexDirection: 'row', gap: 8 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, minHeight: 36, paddingHorizontal: 14, paddingVertical: 8 },
  dateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: 14, minHeight: touchTarget },
  calendar:   { borderRadius: radius.nested, padding: 12, marginTop: 8 },
  iconOption: { flex: 1, aspectRatio: 1, maxWidth: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 2 },
  swatch:     { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  saveBtn:    { marginTop: 20, borderRadius: radius.pill, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
});
