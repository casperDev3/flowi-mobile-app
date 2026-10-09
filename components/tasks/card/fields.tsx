import { Atlas } from '@/constants/atlas';
/**
 * components/tasks/card/fields.tsx — поля картки завдання.
 *
 * Кожне поле = тригер (рядок або чип, див. primitives.tsx) + власний аркуш
 * вибору. Значення приходить згори, зміна йде одним колбеком: поле нічого не
 * зберігає саме — правку застосовує екран (той самий шлях, що й інші правки
 * задачі: історія, синк, права).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { PriorityPicker } from '@/components/tasks/PriorityPicker';
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import type { PickerCreateOption } from '@/components/shared/PickerField';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { isSameDay, monthGrid } from '@/utils/dateUtils';
import { filterPickerOptions, pickerCreateName } from '@/utils/pickerOptions';
import { initialReminderDraft, resolveReminderMoment } from '@/utils/reminderTime';
import { priorityColor, priorityLabel, type TaskPriority } from '@/utils/taskUtils';

import {
  FieldTrigger,
  OptionRow,
  PropertySheet,
  SheetButtons,
  cardStyles,
  type CardColors,
  type TriggerVariant,
} from './primitives';

// ─── Дати ────────────────────────────────────────────────────────────────────

/**
 * Дата без часу → ISO опівдні за місцевим часом. Північ місцевого часу в UTC
 * для східних поясів — уже попередній день, і клієнт, що читає перші 10
 * символів (веб), показав би дедлайн на день раніше. Полудень лишає запас
 * ±11 годин у будь-який бік.
 */
export function dayToIso(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  return d.toISOString();
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** ISO або «YYYY-MM-DD» (кінець повторення) → Date; другий — як місцевий день. */
export function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(value);
}

export function formatDay(iso: string | null | undefined, locale: string, withWeekday = false): string | null {
  if (!iso) return null;
  const d = parseDay(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long' });
}

/** «1 г 30 хв» з хвилин; undefined → null. */
export function formatMinutes(total: number | undefined, units: { h: string; m: string }): string | null {
  if (!total || total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} ${units.h} ${m} ${units.m}`;
  if (h) return `${h} ${units.h}`;
  return `${m} ${units.m}`;
}

// ─── Список варіантів ────────────────────────────────────────────────────────

export interface FieldOption {
  id: string;
  label: string;
  color?: string;
  icon?: IconSymbolName;
  sub?: string;
}

export interface OptionFieldProps {
  variant?: TriggerVariant;
  icon: IconSymbolName;
  label: string;
  options: FieldOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Варіант «нічого» (без проєкту, без виконавця, беклог). */
  emptyOption?: { label: string; icon?: IconSymbolName };
  /** Підпис обраного, коли його немає серед options (архівний проєкт). */
  selectedLabel?: string | null;
  /** Колір значення в тригері береться з кольору варіанта. */
  colorValue?: boolean;
  search?: boolean;
  createOption?: PickerCreateOption;
  disabled?: boolean;
  colors: CardColors;
  isDark: boolean;
}

export function OptionField({
  variant, icon, label, options, value, onChange, emptyOption, selectedLabel, colorValue,
  search, createOption, disabled, colors: c, isDark,
}: OptionFieldProps) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.id === value) ?? null;
  const shownLabel = selected?.label ?? (value ? selectedLabel ?? null : null);
  const withSearch = search || !!createOption || options.length > 6;
  const visible = useMemo(() => filterPickerOptions(options, query), [options, query]);
  const draftName = createOption ? pickerCreateName(options, query) : null;
  const createText = !createOption || !draftName ? ''
    : typeof createOption.label === 'function' ? createOption.label(draftName) : `${createOption.label} «${draftName}»`;

  const close = () => { setOpen(false); setQuery(''); };
  const choose = (id: string | null) => { onChange(id); close(); };

  return (
    <>
      <FieldTrigger
        variant={variant}
        icon={selected?.icon ?? icon}
        label={label}
        value={shownLabel ?? (variant === 'chip' ? null : emptyOption?.label ?? null)}
        placeholder={tr.cardNotSet}
        dotColor={selected?.color}
        valueColor={colorValue ? selected?.color : undefined}
        onPress={disabled ? undefined : () => setOpen(true)}
        colors={c}
      />
      <PropertySheet visible={open} title={label} onClose={close} colors={c} isDark={isDark}>
        {withSearch ? (
          <TextInput
            placeholder={tr.pickerSearch}
            placeholderTextColor={c.sub}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            accessibilityLabel={tr.pickerSearch}
            style={[st.search, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]}
          />
        ) : null}
        {createOption && draftName ? (
          <TouchableOpacity
            onPress={() => { createOption.onCreate(draftName); close(); }}
            accessibilityRole="button"
            accessibilityLabel={createText}
            style={[st.create, { borderColor: c.accent }]}>
            <IconSymbol name="plus" size={14} color={c.accent} />
            <Text numberOfLines={1} style={{ flex: 1, color: c.accent, fontWeight: '700', fontSize: 14 }}>{createText}</Text>
          </TouchableOpacity>
        ) : null}
        {emptyOption && !query.trim() ? (
          <OptionRow label={emptyOption.label} icon={emptyOption.icon} active={value === null} onPress={() => choose(null)} colors={c} />
        ) : null}
        {visible.map(o => (
          <OptionRow key={o.id} label={o.label} sub={o.sub} color={o.color} icon={o.icon} active={o.id === value} onPress={() => choose(o.id)} colors={c} />
        ))}
        {visible.length === 0 ? (
          <Text style={{ color: c.sub, textAlign: 'center', paddingVertical: 20 }}>{tr.pickerNothingFound}</Text>
        ) : null}
      </PropertySheet>
    </>
  );
}

/** Множинний вибір (залежності, обовʼязковий результат). */
export function MultiOptionField({
  icon, label, options, value, onChange, disabled, colors: c, isDark, summary,
}: {
  icon: IconSymbolName;
  label: string;
  options: FieldOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Підпис у рядку; за замовчуванням — перелік обраних або «N обрано». */
  summary?: string;
  colors: CardColors;
  isDark: boolean;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([...value]);
  const [query, setQuery] = useState('');
  // Ключ-рядок, а не сам масив: `?? []` згори дає новий масив щорендеру, і
  // тік таймера скидав би вибір посеред редагування.
  const valueKey = value.join('|');
  useEffect(() => { if (open) setDraft(valueKey ? valueKey.split('|') : []); }, [open, valueKey]);
  const chosen = options.filter(o => value.includes(o.id));
  const shown = summary ?? (chosen.length === 0 ? null
    : chosen.length <= 2 ? chosen.map(o => o.label).join(', ')
    : tr.cardSelectedCount.replace('{n}', String(chosen.length)));
  const visible = filterPickerOptions(options, query);
  const toggle = (id: string) => setDraft(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  return (
    <>
      <FieldTrigger icon={icon} label={label} value={shown} placeholder={tr.cardNotSet}
        onPress={disabled ? undefined : () => setOpen(true)} colors={c} />
      <PropertySheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        colors={c}
        isDark={isDark}
        footer={<SheetButtons colors={c}
          secondary={{ label: tr.cancel, onPress: () => setOpen(false) }}
          primary={{ label: tr.cardDone, onPress: () => { onChange(draft); setOpen(false); } }} />}>
        {options.length > 6 ? (
          <TextInput placeholder={tr.pickerSearch} placeholderTextColor={c.sub} value={query} onChangeText={setQuery}
            accessibilityLabel={tr.pickerSearch}
            style={[st.search, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
        ) : null}
        {visible.map(o => (
          <OptionRow key={o.id} label={o.label} sub={o.sub} icon={draft.includes(o.id) ? 'checkmark.square.fill' : 'square.dashed'}
            active={draft.includes(o.id)} onPress={() => toggle(o.id)} colors={c} />
        ))}
        {visible.length === 0 ? (
          <Text style={{ color: c.sub, textAlign: 'center', paddingVertical: 20 }}>{tr.pickerNothingFound}</Text>
        ) : null}
      </PropertySheet>
    </>
  );
}

// ─── Дата ────────────────────────────────────────────────────────────────────

export interface DateFieldProps {
  variant?: TriggerVariant;
  icon?: IconSymbolName;
  label: string;
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Червоний підпис (прострочений дедлайн). */
  danger?: boolean;
  disabled?: boolean;
  today: Date;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}

export function DateField({ variant, icon = 'calendar', label, value, onChange, danger, disabled, today, colors: c, isDark, locale }: DateFieldProps) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const base = value ? new Date(value) : today;
  const [year, setYear] = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());
  useEffect(() => {
    if (!open) return;
    const b = value ? new Date(value) : today;
    setYear(b.getFullYear()); setMonth(b.getMonth());
  }, [open, value, today]);
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const presets = [
    { label: tr.dateToday, days: 0 },
    { label: tr.dateTomorrow, days: 1 },
    { label: tr.datePlus3, days: 3 },
    { label: tr.datePlus7, days: 7 },
  ];
  // CalendarGrid порівнює саме за toDateString — лише для підсвітки клітинки.
  const selectedKey = value ? parseDay(value).toDateString() : null;
  const pick = (d: Date | null) => { onChange(d ? dayToIso(d) : null); setOpen(false); };
  return (
    <>
      <FieldTrigger
        variant={variant}
        icon={icon}
        label={label}
        value={formatDay(value, locale, true)}
        placeholder={tr.cardNotSet}
        tone={danger ? 'danger' : 'normal'}
        onPress={disabled ? undefined : () => setOpen(true)}
        colors={c}
      />
      <PropertySheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        colors={c}
        isDark={isDark}
        footer={value ? <SheetButtons colors={c} secondary={{ label: tr.cardClearDate, onPress: () => pick(null), destructive: true }} /> : undefined}>
        <View style={st.presetRow}>
          {presets.map(p => {
            const day = addDays(today, p.days);
            const on = !!value && isSameDay(parseDay(value), day);
            return (
              <TouchableOpacity key={p.label} onPress={() => pick(day)} accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[cardStyles.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.dim }]}>
                <Text style={{ color: on ? '#fff' : c.text, fontSize: 13, fontWeight: '600' }}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[st.calendar, { borderColor: c.border, backgroundColor: c.dim }]}>
          <CalendarGrid
            year={year}
            month={month}
            markedDays={new Set()}
            selectedDate={selectedKey}
            todayDate={today}
            weeks={weeks}
            months={tr.months}
            weekdays={tr.weekdays}
            onPrevMonth={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            onNextMonth={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            onSelectDay={d => pick(d)}
            c={c}
          />
        </View>
      </PropertySheet>
    </>
  );
}

// ─── Пріоритет ───────────────────────────────────────────────────────────────

export function PriorityField({ variant, value, onChange, disabled, colors: c, isDark }: {
  variant?: TriggerVariant;
  value: TaskPriority;
  onChange: (level: TaskPriority) => void;
  disabled?: boolean;
  colors: CardColors;
  isDark: boolean;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const color = priorityColor(value) ?? undefined;
  return (
    <>
      <FieldTrigger
        variant={variant}
        icon="exclamationmark.circle"
        label={tr.priority}
        value={value === null ? (variant === 'chip' ? null : tr.priorityNone) : priorityLabel(value)}
        valueColor={color}
        onPress={disabled ? undefined : () => setOpen(true)}
        colors={c}
      />
      <PropertySheet visible={open} title={tr.priority} onClose={() => setOpen(false)} colors={c} isDark={isDark}>
        <PriorityPicker value={value} onChange={level => { onChange(level); setOpen(false); }} colors={c} />
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 10, marginBottom: 4 }}>{tr.cardPriorityHint}</Text>
      </PropertySheet>
    </>
  );
}

// ─── Оцінка часу ─────────────────────────────────────────────────────────────

const ESTIMATE_PRESETS = [15, 30, 60, 120, 240, 480];

export function EstimateField({ value, onChange, disabled, colors: c, isDark }: {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  disabled?: boolean;
  colors: CardColors;
  isDark: boolean;
}) {
  const { tr } = useI18n();
  const units = { h: tr.cardHourShort, m: tr.cardMinShort };
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [mins, setMins] = useState('');
  useEffect(() => {
    if (!open) return;
    const total = value ?? 0;
    setHours(total >= 60 ? String(Math.floor(total / 60)) : '');
    setMins(total % 60 ? String(total % 60) : '');
  }, [open, value]);
  const typed = (parseInt(hours || '0', 10) || 0) * 60 + (parseInt(mins || '0', 10) || 0);
  const apply = (minutes: number | undefined) => { onChange(minutes && minutes > 0 ? minutes : undefined); setOpen(false); };
  return (
    <>
      <FieldTrigger icon="timer" label={tr.timeEstimate} value={formatMinutes(value, units)} placeholder={tr.cardNotSet}
        onPress={disabled ? undefined : () => setOpen(true)} colors={c} />
      <PropertySheet
        visible={open}
        title={tr.timeEstimate}
        onClose={() => setOpen(false)}
        colors={c}
        isDark={isDark}
        footer={<SheetButtons colors={c}
          secondary={value ? { label: tr.clear, onPress: () => apply(undefined), destructive: true } : { label: tr.cancel, onPress: () => setOpen(false) }}
          primary={{ label: tr.save, onPress: () => apply(typed) }} />}>
        <View style={st.presetRow}>
          {ESTIMATE_PRESETS.map(m => {
            const on = value === m;
            return (
              <TouchableOpacity key={m} onPress={() => apply(m)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[cardStyles.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.dim }]}>
                <Text style={{ color: on ? '#fff' : c.text, fontSize: 13, fontWeight: '600' }}>{formatMinutes(m, units)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <TextInput value={hours} onChangeText={v => setHours(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad"
            placeholder={tr.hoursPlaceholder} placeholderTextColor={c.sub} accessibilityLabel={tr.hoursPlaceholder}
            style={[st.numInput, { backgroundColor: c.dim, color: c.text, borderColor: c.border }]} />
          <Text style={{ color: c.sub, fontWeight: '700' }}>:</Text>
          <TextInput value={mins} onChangeText={v => setMins(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad"
            placeholder={tr.minutesPlaceholder} placeholderTextColor={c.sub} accessibilityLabel={tr.minutesPlaceholder}
            style={[st.numInput, { backgroundColor: c.dim, color: c.text, borderColor: c.border }]} />
        </View>
      </PropertySheet>
    </>
  );
}

// ─── Повторення ──────────────────────────────────────────────────────────────

export function recurrenceLabel(rule: RecurrenceRule | undefined, tr: ReturnType<typeof useI18n>['tr'], locale: string): string | null {
  if (!rule) return null;
  const freq = { daily: tr.cardRepeatDaily, weekly: tr.cardRepeatWeekly, monthly: tr.cardRepeatMonthly, yearly: tr.cardRepeatYearly }[rule.freq];
  const unit = { daily: tr.cardUnitDays, weekly: tr.cardUnitWeeks, monthly: tr.cardUnitMonths, yearly: tr.cardUnitYears }[rule.freq];
  let text = rule.interval > 1 ? `${tr.cardRepeatEvery} ${rule.interval} ${unit}` : freq;
  if (rule.freq === 'weekly' && rule.daysOfWeek?.length) {
    text += ` · ${[...rule.daysOfWeek].sort().map(i => tr.weekdays[i]).join(', ')}`;
  }
  if (rule.until) text += ` · ${tr.cardRepeatUntil.toLowerCase()} ${formatDay(rule.until, locale) ?? rule.until}`;
  return text;
}

export function RepeatField({ value, onChange, disabled, today, colors: c, isDark, locale }: {
  value: RecurrenceRule | undefined;
  onChange: (rule: RecurrenceRule | undefined) => void;
  disabled?: boolean;
  today: Date;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [freq, setFreq] = useState<RecurrenceRule['freq']>('weekly');
  const [interval, setInterval_] = useState(1);
  const [days, setDays] = useState<number[]>([]);
  const [until, setUntil] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setFreq(value?.freq ?? 'weekly');
    setInterval_(value?.interval ?? 1);
    setDays(value?.daysOfWeek ?? []);
    setUntil(value?.until ? dayToIso(parseDay(value.until)) : null);
  }, [open, value]);
  const save = () => {
    onChange({
      freq,
      interval,
      daysOfWeek: freq === 'weekly' && days.length ? [...days].sort() : undefined,
      // Як і раніше у формі — дата кінця зберігається як YYYY-MM-DD.
      until: until ? isoToYmd(until) : undefined,
    });
    setOpen(false);
  };
  const freqs: { key: RecurrenceRule['freq']; label: string }[] = [
    { key: 'daily', label: tr.cardRepeatDaily },
    { key: 'weekly', label: tr.cardRepeatWeekly },
    { key: 'monthly', label: tr.cardRepeatMonthly },
    { key: 'yearly', label: tr.cardRepeatYearly },
  ];
  const unit = { daily: tr.cardUnitDays, weekly: tr.cardUnitWeeks, monthly: tr.cardUnitMonths, yearly: tr.cardUnitYears }[freq];
  return (
    <>
      <FieldTrigger icon="repeat" label={tr.cardRepeat} value={recurrenceLabel(value, tr, locale)} placeholder={tr.cardRepeatNone}
        valueColor={value ? c.accent : undefined}
        onPress={disabled ? undefined : () => setOpen(true)} colors={c} />
      <PropertySheet
        visible={open}
        title={tr.cardRepeat}
        onClose={() => setOpen(false)}
        colors={c}
        isDark={isDark}
        footer={<SheetButtons colors={c}
          secondary={value ? { label: tr.cardRepeatOff, onPress: () => { onChange(undefined); setOpen(false); }, destructive: true } : { label: tr.cancel, onPress: () => setOpen(false) }}
          primary={{ label: tr.save, onPress: save }} />}>
        <View style={st.segment}>
          {freqs.map(f => {
            const on = freq === f.key;
            return (
              <TouchableOpacity key={f.key} onPress={() => setFreq(f.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[st.segBtn, { backgroundColor: on ? c.accent : c.dim, borderColor: on ? c.accent : c.border }]}>
                <Text style={{ color: on ? '#fff' : c.text, fontSize: 12, fontWeight: '700' }}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={st.stepRow}>
          <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', flex: 1 }}>{tr.cardRepeatEvery}</Text>
          <TouchableOpacity onPress={() => setInterval_(n => Math.max(1, n - 1))} accessibilityRole="button" accessibilityLabel="−"
            style={[st.stepBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="minus" size={14} color={c.text} />
          </TouchableOpacity>
          <Text style={{ color: c.accent, fontSize: 17, fontWeight: '700', minWidth: 30, textAlign: 'center' }}>{interval}</Text>
          <TouchableOpacity onPress={() => setInterval_(n => Math.min(99, n + 1))} accessibilityRole="button" accessibilityLabel="+"
            style={[st.stepBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="plus" size={14} color={c.text} />
          </TouchableOpacity>
          <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', minWidth: 44 }}>{unit}</Text>
        </View>
        {freq === 'weekly' ? (
          <View style={[st.segment, { marginTop: 4 }]}>
            {tr.weekdays.map((d, i) => {
              const on = days.includes(i);
              return (
                <TouchableOpacity key={i} onPress={() => setDays(p => on ? p.filter(x => x !== i) : [...p, i])}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d}
                  style={[st.dayBtn, { backgroundColor: on ? c.accent : c.dim, borderColor: on ? c.accent : c.border }]}>
                  <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {/* Кінець повторення — на місці, а не третім аркушем поверх двох:
            на телефоні цей аркуш уже стоїть над модальним листом деталі. */}
        <Text style={[st.caption, { color: c.sub }]}>{tr.cardRepeatEnds}</Text>
        <View style={st.segment}>
          {([['never', tr.cardRepeatNever], ['until', tr.cardRepeatUntil]] as const).map(([key, text]) => {
            const on = key === 'never' ? !until : !!until;
            return (
              <TouchableOpacity key={key} accessibilityRole="radio" accessibilityState={{ selected: on }}
                onPress={() => setUntil(key === 'never' ? null : (until ?? dayToIso(addDays(today, 30))))}
                style={[st.segBtn, { backgroundColor: on ? c.accent : c.dim, borderColor: on ? c.accent : c.border }]}>
                <Text style={{ color: on ? '#fff' : c.text, fontSize: 12, fontWeight: '700' }}>
                  {key === 'until' && until ? `${text} · ${formatDay(until, locale)}` : text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {until ? <InlineCalendar value={until} onChange={setUntil} today={today} colors={c} /> : null}
      </PropertySheet>
    </>
  );
}

function InlineCalendar({ value, onChange, today, colors: c }: {
  value: string;
  onChange: (iso: string) => void;
  today: Date;
  colors: CardColors;
}) {
  const { tr } = useI18n();
  const base = new Date(value);
  const [year, setYear] = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  return (
    <View style={[st.calendar, { borderColor: c.border, backgroundColor: c.dim }]}>
      <CalendarGrid
        year={year}
        month={month}
        markedDays={new Set()}
        selectedDate={base.toDateString()}
        todayDate={today}
        weeks={weeks}
        months={tr.months}
        weekdays={tr.weekdays}
        onPrevMonth={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
        onNextMonth={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
        onSelectDay={d => onChange(dayToIso(d))}
        c={c}
      />
    </View>
  );
}

function isoToYmd(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── Нагадування ─────────────────────────────────────────────────────────────

/**
 * Аркуш нагадування — керований: його відкривають і рядок «Нагадування» у
 * «Деталях», і меню підзавдання (там окремого рядка немає).
 */
export function ReminderSheet({ visible, title, reminderAt, onSave, onRemove, onClose, today, colors: c, isDark }: {
  visible: boolean;
  title: string;
  reminderAt: string | undefined;
  onSave: (moment: Date) => void;
  onRemove: () => void;
  onClose: () => void;
  today: Date;
  colors: CardColors;
  isDark: boolean;
}) {
  const { tr } = useI18n();
  const [date, setDate] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [mins, setMins] = useState('');
  useEffect(() => {
    if (!visible) return;
    const d = initialReminderDraft(reminderAt);
    setDate(d.date); setHours(d.hours); setMins(d.mins);
  }, [visible, reminderAt]);
  const presets = [
    { label: tr.dateToday, days: 0 },
    { label: tr.dateTomorrow, days: 1 },
    { label: tr.datePlus2, days: 2 },
    { label: tr.datePlus7, days: 7 },
  ];
  return (
    <PropertySheet
      visible={visible}
      title={title}
      onClose={onClose}
      colors={c}
      isDark={isDark}
      footer={<SheetButtons colors={c}
        secondary={reminderAt ? { label: tr.delete, onPress: () => { onRemove(); onClose(); }, destructive: true } : { label: tr.cancel, onPress: onClose }}
        primary={{ label: tr.setReminder, onPress: () => { onSave(resolveReminderMoment({ date, hours, mins })); onClose(); } }} />}>
      <View style={st.presetRow}>
        {presets.map(p => {
          const day = addDays(today, p.days);
          const on = !!date && isSameDay(new Date(date), day);
          return (
            <TouchableOpacity key={p.label} accessibilityRole="button" accessibilityState={{ selected: on }}
              onPress={() => {
                const next = new Date(day);
                next.setHours(parseInt(hours || '0', 10), parseInt(mins || '0', 10), 0, 0);
                setDate(next.toISOString());
              }}
              style={[cardStyles.chip, { borderColor: on ? '#F59E0B' : c.border, backgroundColor: on ? '#F59E0B' : c.dim }]}>
              <Text style={{ color: on ? '#fff' : c.text, fontSize: 13, fontWeight: '600' }}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <TextInput value={hours} onChangeText={v => setHours(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad"
          placeholder={tr.hoursShort} placeholderTextColor={c.sub} accessibilityLabel={tr.hoursShort}
          style={[st.numInput, { backgroundColor: c.dim, color: c.text, borderColor: c.border }]} />
        <Text style={{ color: c.sub, fontSize: 18, fontWeight: '700' }}>:</Text>
        <TextInput value={mins} onChangeText={v => setMins(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad"
          placeholder={tr.minutesShort} placeholderTextColor={c.sub} accessibilityLabel={tr.minutesShort}
          style={[st.numInput, { backgroundColor: c.dim, color: c.text, borderColor: c.border }]} />
      </View>
    </PropertySheet>
  );
}

export function ReminderField({ value, onSave, onRemove, disabled, today, colors: c, isDark, locale }: {
  value: string | undefined;
  onSave: (moment: Date) => void;
  onRemove: () => void;
  disabled?: boolean;
  today: Date;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const label = value
    ? new Date(value).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <>
      <FieldTrigger icon="bell" label={tr.reminderAtLabel} value={label} placeholder={tr.cardNotSet}
        valueColor={value ? '#F59E0B' : undefined}
        onPress={disabled ? undefined : () => setOpen(true)} colors={c} />
      <ReminderSheet visible={open} title={tr.reminderAtLabel} reminderAt={value} onSave={onSave} onRemove={onRemove}
        onClose={() => setOpen(false)} today={today} colors={c} isDark={isDark} />
    </>
  );
}

// ─── Текст на місці ──────────────────────────────────────────────────────────

/**
 * Багаторядкове поле, що зберігається при втраті фокуса (опис, результат,
 * причина перешкоди). Нічого не пише, якщо текст не змінився.
 */
export function InlineTextArea({ value, onCommit, placeholder, label, editable = true, colors: c, minHeight = 44 }: {
  value: string;
  onCommit: (text: string) => void;
  placeholder: string;
  label: string;
  editable?: boolean;
  minHeight?: number;
  colors: CardColors;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // Поки людина друкує, синк не має перезаписувати набране.
  useEffect(() => { if (!focused) setText(value); }, [value, focused]);
  // Картку можна закрити (✕, свайп), не знімаючи фокуса з поля, — тоді onBlur
  // не настає, і набране зникло б. Незбережений текст пишемо при демонтажі.
  const latest = useRef({ text, value, focused, onCommit });
  latest.current = { text, value, focused, onCommit };
  useEffect(() => () => {
    const l = latest.current;
    if (l.focused && l.text.trim() !== l.value.trim()) l.onCommit(l.text.trim());
  }, []);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (text.trim() !== value.trim()) onCommit(text.trim()); }}
      editable={editable}
      multiline
      placeholder={placeholder}
      placeholderTextColor={c.sub}
      accessibilityLabel={label}
      style={[st.area, {
        color: c.text,
        minHeight,
        borderColor: focused ? c.accent : c.border,
        backgroundColor: focused ? c.dim : 'transparent',
      }]}
    />
  );
}

const st = StyleSheet.create({
  search:    { borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, marginBottom: 10 },
  create:    { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: Atlas.radius.medium, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 13, gap: 9, marginBottom: 7 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  calendar:  { borderRadius: Atlas.radius.large, borderWidth: 1, padding: 12 },
  numInput:  { flex: 1, borderWidth: 1, borderRadius: Atlas.radius.medium, minHeight: 46, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  segment:   { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segBtn:    { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayBtn:    { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  caption:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7, marginTop: 4 },
  stepBtn:   { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  area:      { borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
});
