import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

// ─── Exported types ────────────────────────────────────────────────────────────

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  daysOfWeek?: number[]; // 0=Mon … 6=Sun (for weekly)
  until?: string;        // YYYY-MM-DD
}

export interface MeetingFormData {
  id?: string;
  title: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  durationMinutes: number;
  location?: string;
  link?: string;
  notes?: string;
  color: string;
  recurrence?: RecurrenceRule;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MEETING_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const DUR_PRESETS = [15, 30, 45, 60, 90, 120];
const WD_SHORT_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const WD_SHORT_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Internal CalendarGrid ────────────────────────────────────────────────────

interface CalGridProps {
  year: number; month: number; markedDays: Set<string>; selectedDate: string | null;
  onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDay: (d: Date) => void;
  accent: string; border: string; sub: string; text: string;
  lang: string;
}

function CalGrid({ year, month, markedDays, selectedDate, onPrevMonth, onNextMonth, onSelectDay, accent, border, sub, text, lang }: CalGridProps) {
  const todayStr = toDateStr(new Date());
  const fd = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < fd; i++) cells.push(null);
  for (let i = 1; i <= dim; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const months = lang === 'uk' ? MONTHS_UK : MONTHS_EN;
  const wdShort = lang === 'uk' ? WD_SHORT_UK : WD_SHORT_EN;

  return (
    <View style={{ borderRadius: 14, borderWidth: 1, padding: 12, borderColor: border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={onPrevMonth} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="chevron.left" size={18} color={sub} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: text, fontSize: 15, fontWeight: '700' }}>
          {months[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="chevron.right" size={18} color={sub} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {wdShort.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1 }} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSel = selectedDate === dateStr;
            const hasMark = markedDays.has(dateStr);
            return (
              <TouchableOpacity key={di} onPress={() => onSelectDay(new Date(dateStr + 'T00:00'))}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? accent : 'transparent',
                  borderWidth: !isSel && isToday ? 1.5 : 0, borderColor: accent }}>
                  <Text style={{ color: isSel ? '#fff' : isToday ? accent : text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                </View>
                {hasMark && !isSel && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accent, marginTop: 1 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── MeetingFormSheet ─────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  initial?: MeetingFormData | null;
  presetDate?: string;
  onClose: () => void;
  onSave: (m: MeetingFormData) => void;
  onDelete?: () => void;
  isDark: boolean;
  lang: string;
  tr: any;
  markedDays?: Set<string>;
}

export function MeetingFormSheet({
  visible, initial, presetDate, onClose, onSave, onDelete,
  isDark, lang, tr, markedDays = new Set(),
}: Props) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isUk = lang === 'uk';

  const c = {
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    dim:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    text:   isDark ? '#F2F0FF' : '#1A1830',
    sub:    isDark ? 'rgba(210,205,255,0.45)' : 'rgba(80,70,140,0.55)',
    sheet:  isDark ? 'rgba(18,18,32,0.96)' : 'rgba(245,244,255,0.97)',
  };

  // ── Form state ──────────────────────────────────────────────────────────────
  const [fTitle, setFTitle] = useState('');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fDuration, setFDuration] = useState(60);
  const [fDurationText, setFDurationText] = useState('60');
  const [fLocation, setFLocation] = useState('');
  const [fLink, setFLink] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fColor, setFColor] = useState(MEETING_COLORS[0]);
  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // ── Recurrence state ────────────────────────────────────────────────────────
  const [fRepeat, setFRepeat] = useState(false);
  const [fRepeatFreq, setFRepeatFreq] = useState<RecurrenceFreq>('weekly');
  const [fRepeatInterval, setFRepeatInterval] = useState(1);
  const [fRepeatDays, setFRepeatDays] = useState<number[]>([]);
  const [fRepeatEndType, setFRepeatEndType] = useState<'never' | 'until'>('never');
  const [fRepeatUntil, setFRepeatUntil] = useState('');
  const [showRepeatUntilCal, setShowRepeatUntilCal] = useState(false);
  const [repeatUntilCalYear, setRepeatUntilCalYear] = useState(today.getFullYear());
  const [repeatUntilCalMonth, setRepeatUntilCalMonth] = useState(today.getMonth());

  // Reset form whenever the sheet opens or `initial` changes
  useEffect(() => {
    if (!visible) return;
    const m = initial;
    if (m) {
      setFTitle(m.title); setFDate(m.date); setFTime(m.time);
      setFDuration(m.durationMinutes); setFDurationText(String(m.durationMinutes));
      setFLocation(m.location ?? ''); setFLink(m.link ?? '');
      setFNotes(m.notes ?? ''); setFColor(m.color); setShowCal(false);
      const d = new Date(m.date + 'T00:00');
      setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
      const rule = m.recurrence;
      setFRepeat(!!rule);
      setFRepeatFreq(rule?.freq ?? 'weekly');
      setFRepeatInterval(rule?.interval ?? 1);
      setFRepeatDays(rule?.daysOfWeek ?? []);
      setFRepeatEndType(rule?.until ? 'until' : 'never');
      setFRepeatUntil(rule?.until ?? '');
      setShowRepeatUntilCal(false);
      const untilD = rule?.until ? new Date(rule.until + 'T00:00') : today;
      setRepeatUntilCalYear(untilD.getFullYear()); setRepeatUntilCalMonth(untilD.getMonth());
    } else {
      const defaultDate = presetDate ?? toDateStr(today);
      setFTitle(''); setFDate(defaultDate); setFTime('');
      setFDuration(60); setFDurationText('60');
      setFLocation(''); setFLink(''); setFNotes('');
      setFColor(MEETING_COLORS[0]); setShowCal(false);
      const d = presetDate ? new Date(presetDate + 'T00:00') : today;
      setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
      setFRepeat(false); setFRepeatFreq('weekly'); setFRepeatInterval(1); setFRepeatDays([]);
      setFRepeatEndType('never'); setFRepeatUntil(''); setShowRepeatUntilCal(false);
      setRepeatUntilCalYear(today.getFullYear()); setRepeatUntilCalMonth(today.getMonth());
    }
  }, [visible, initial, presetDate]);

  const handleSave = () => {
    if (!fTitle.trim() || !fDate) return;
    const recurrence: RecurrenceRule | undefined = fRepeat ? {
      freq: fRepeatFreq,
      interval: fRepeatInterval > 0 ? fRepeatInterval : 1,
      daysOfWeek: fRepeatFreq === 'weekly' && fRepeatDays.length > 0 ? fRepeatDays : undefined,
      until: fRepeatEndType === 'until' && fRepeatUntil ? fRepeatUntil : undefined,
    } : undefined;
    onSave({
      id: initial?.id,
      title: fTitle.trim(), date: fDate, time: fTime,
      durationMinutes: fDuration,
      location: fLocation.trim() || undefined,
      link: fLink.trim() || undefined,
      notes: fNotes.trim() || undefined,
      color: fColor, recurrence,
    });
  };

  const FREQ_LABELS: Record<RecurrenceFreq, string> = isUk
    ? { daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця', yearly: 'Щороку' }
    : { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

  const intervalUnit = (n: number): string => {
    if (!isUk) return fRepeatFreq === 'daily' ? 'd.' : fRepeatFreq === 'weekly' ? 'wk.' : fRepeatFreq === 'monthly' ? 'mo.' : 'yr.';
    if (fRepeatFreq === 'daily')   return n === 1 ? 'день' : 'дн.';
    if (fRepeatFreq === 'weekly')  return n === 1 ? 'тиждень' : 'тиж.';
    if (fRepeatFreq === 'monthly') return n === 1 ? 'місяць' : 'міс.';
    return 'рік';
  };

  const wdShort = isUk ? WD_SHORT_UK : WD_SHORT_EN;
  const canSave = fTitle.trim().length > 0 && fDate.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable onPress={e => e.stopPropagation()} style={s.wrapper}>
            <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>

                {/* Handle + close */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flex: 1 }} />
                  <View style={{ width: 32, height: 3.5, borderRadius: 2, backgroundColor: c.border }} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={16} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Preview strip */}
                <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: fColor + '12',
                  borderLeftWidth: 3.5, borderLeftColor: fColor, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12, gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                    {MEETING_COLORS.map(col => (
                      <TouchableOpacity key={col} onPress={() => setFColor(col)}
                        style={{ width: col === fColor ? 20 : 14, height: col === fColor ? 20 : 14, borderRadius: 10, backgroundColor: col,
                          borderWidth: col === fColor ? 2 : 0, borderColor: '#fff',
                          shadowColor: col, shadowOpacity: col === fColor ? 0.55 : 0, shadowRadius: 4, elevation: col === fColor ? 3 : 0 }} />
                    ))}
                  </View>
                  <View style={{ width: 1, height: 20, backgroundColor: fColor + '30' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: fTitle.trim() ? c.text : c.sub, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                      {fTitle.trim() || (isUk ? 'Назва зустрічі' : 'Meeting title')}
                    </Text>
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                      {[
                        fDate ? new Date(fDate + 'T00:00').toLocaleDateString(isUk ? 'uk-UA' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }) : null,
                        fTime || null,
                        fDuration >= 60 ? `${Math.floor(fDuration / 60)}г${fDuration % 60 ? `${fDuration % 60}хв` : ''}` : `${fDuration}хв`,
                        fLocation || null,
                        fRepeat ? '↻' : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Title */}
                <TextInput
                  placeholder={isUk ? 'Назва зустрічі...' : 'Meeting title...'}
                  placeholderTextColor={c.sub}
                  value={fTitle} onChangeText={setFTitle} autoFocus
                  style={[s.inp, { color: c.text, backgroundColor: c.dim, borderColor: fTitle.trim() ? fColor + '65' : c.border, marginBottom: 7 }]}
                />

                {/* Date + Time */}
                <View style={{ flexDirection: 'row', gap: 7, marginBottom: 7 }}>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowCal(v => !v); }} style={{ flex: 1 }}>
                    <View style={[s.pill, { borderColor: fDate ? fColor + '55' : c.border, backgroundColor: fDate ? fColor + '10' : c.dim }]}>
                      <IconSymbol name="calendar" size={13} color={fDate ? fColor : c.sub} />
                      <Text style={{ color: fDate ? fColor : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1 }} numberOfLines={1}>
                        {fDate ? new Date(fDate + 'T00:00').toLocaleDateString(isUk ? 'uk-UA' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }) : (isUk ? 'Дата' : 'Date')}
                      </Text>
                      <IconSymbol name={showCal ? 'chevron.up' : 'chevron.down'} size={11} color={c.sub} />
                    </View>
                  </TouchableOpacity>
                  <View style={[s.pill, { width: 82, borderColor: c.border, backgroundColor: c.dim }]}>
                    <IconSymbol name="clock" size={13} color={fTime ? fColor : c.sub} />
                    <TextInput
                      placeholder="09:00" placeholderTextColor={c.sub} value={fTime}
                      onChangeText={v => {
                        const clean = v.replace(/[^0-9:]/g, '').slice(0, 5);
                        const digits = clean.replace(/:/g, '');
                        if (!clean.includes(':') && digits.length >= 3) {
                          setFTime(digits.slice(0, 2) + ':' + digits.slice(2, 4));
                        } else setFTime(clean);
                      }}
                      keyboardType="numbers-and-punctuation" maxLength={5}
                      style={{ color: fTime ? fColor : c.sub, fontSize: 13, fontWeight: '700', marginLeft: 5, flex: 1, padding: 0 }}
                    />
                  </View>
                </View>

                {showCal && (
                  <View style={{ marginBottom: 8 }}>
                    <CalGrid
                      year={calYear} month={calMonth} markedDays={markedDays}
                      selectedDate={fDate}
                      onPrevMonth={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                      onNextMonth={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                      onSelectDay={d => { setFDate(toDateStr(d)); setShowCal(false); }}
                      accent={fColor} border={c.border} sub={c.sub} text={c.text} lang={lang}
                    />
                  </View>
                )}

                {/* Duration */}
                <View style={{ marginBottom: 7 }}>
                  <View style={{ flexDirection: 'row', gap: 5, marginBottom: 5 }}>
                    {DUR_PRESETS.map(d => {
                      const on = fDuration === d;
                      return (
                        <TouchableOpacity key={d} onPress={() => { setFDuration(d); setFDurationText(String(d)); }} style={{ flex: 1 }}>
                          <View style={{ paddingVertical: 8, alignItems: 'center', borderRadius: 10,
                            backgroundColor: on ? fColor : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>
                              {d >= 60 ? `${d / 60}г` : `${d}хв`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={[s.pill, { borderColor: !DUR_PRESETS.includes(fDuration) ? fColor + '55' : c.border, backgroundColor: !DUR_PRESETS.includes(fDuration) ? fColor + '10' : c.dim }]}>
                    <IconSymbol name="timer" size={13} color={!DUR_PRESETS.includes(fDuration) ? fColor : c.sub} />
                    <TextInput
                      placeholder={isUk ? 'Своя тривалість' : 'Custom'} placeholderTextColor={c.sub}
                      value={fDurationText}
                      onChangeText={v => {
                        const clean = v.replace(/[^0-9]/g, '');
                        setFDurationText(clean);
                        const n = parseInt(clean, 10);
                        if (!isNaN(n) && n > 0) setFDuration(n);
                      }}
                      keyboardType="number-pad"
                      style={{ color: !DUR_PRESETS.includes(fDuration) ? fColor : c.text, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1, padding: 0 }}
                    />
                    <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{isUk ? 'хв' : 'min'}</Text>
                  </View>
                </View>

                {/* Details: location / link / notes */}
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.dim, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                    <IconSymbol name="mappin" size={13} color={fLocation ? fColor : c.sub} />
                    <TextInput placeholder={isUk ? 'Місце…' : 'Location…'} placeholderTextColor={c.sub} value={fLocation} onChangeText={setFLocation}
                      style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1, padding: 0 }} />
                    {!!fLocation && <TouchableOpacity onPress={() => setFLocation('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><IconSymbol name="xmark.circle.fill" size={14} color={c.sub} /></TouchableOpacity>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.dim, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                    <IconSymbol name="link" size={13} color={fLink ? fColor : c.sub} />
                    <TextInput placeholder="Zoom / Meet…" placeholderTextColor={c.sub} value={fLink} onChangeText={setFLink}
                      keyboardType="url" autoCapitalize="none"
                      style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1, padding: 0 }} />
                    {!!fLink && <TouchableOpacity onPress={() => setFLink('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><IconSymbol name="xmark.circle.fill" size={14} color={c.sub} /></TouchableOpacity>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.dim }}>
                    <IconSymbol name="note.text" size={13} color={fNotes ? fColor : c.sub} style={{ marginTop: 1 }} />
                    <TextInput placeholder={isUk ? 'Нотатки…' : 'Notes…'} placeholderTextColor={c.sub} value={fNotes} onChangeText={setFNotes}
                      multiline textAlignVertical="top"
                      style={{ color: c.text, fontSize: 13, marginLeft: 8, flex: 1, padding: 0, maxHeight: 60 }} />
                  </View>
                </View>

                {/* Recurrence toggle */}
                <TouchableOpacity onPress={() => setFRepeat(v => !v)}
                  style={[s.pill, { borderColor: fRepeat ? fColor + '55' : c.border, backgroundColor: fRepeat ? fColor + '10' : c.dim, marginBottom: 10 }]}>
                  <IconSymbol name="repeat" size={13} color={fRepeat ? fColor : c.sub} />
                  <Text style={{ color: fRepeat ? fColor : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                    {isUk ? 'Повторювати' : 'Repeat'}
                  </Text>
                  <View style={{ width: 36, height: 22, borderRadius: 11, backgroundColor: fRepeat ? fColor : c.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: fRepeat ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>

                {fRepeat && (
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: fColor + '40', backgroundColor: fColor + '08', padding: 12, marginBottom: 10 }}>

                    {/* Frequency chips */}
                    <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10 }}>
                      {(Object.keys(FREQ_LABELS) as RecurrenceFreq[]).map(f => {
                        const on = fRepeatFreq === f;
                        return (
                          <TouchableOpacity key={f} onPress={() => { setFRepeatFreq(f); if (f !== 'weekly') setFRepeatDays([]); }}
                            style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                              backgroundColor: on ? fColor : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{FREQ_LABELS[f]}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Interval stepper */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{isUk ? 'Кожні' : 'Every'}</Text>
                      <TouchableOpacity onPress={() => setFRepeatInterval(i => Math.max(1, i - 1))}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: fColor, fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{fRepeatInterval}</Text>
                      <TouchableOpacity onPress={() => setFRepeatInterval(i => Math.min(99, i + 1))}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>+</Text>
                      </TouchableOpacity>
                      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{intervalUnit(fRepeatInterval)}</Text>
                    </View>

                    {/* Days of week (weekly only) */}
                    {fRepeatFreq === 'weekly' && (
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                        {wdShort.map((d, i) => {
                          const on = fRepeatDays.includes(i);
                          return (
                            <TouchableOpacity key={i}
                              onPress={() => setFRepeatDays(prev => on ? prev.filter(x => x !== i) : [...prev, i])}
                              style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8,
                                backgroundColor: on ? fColor : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                              <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{d}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* End type */}
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      {(['never', 'until'] as const).map(type => {
                        const labels = { never: isUk ? 'Ніколи' : 'Never', until: isUk ? 'До дати' : 'Until' };
                        const on = fRepeatEndType === type;
                        return (
                          <TouchableOpacity key={type} onPress={() => setFRepeatEndType(type)}
                            style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                              backgroundColor: on ? fColor : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{labels[type]}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {fRepeatEndType === 'until' && (
                      <View style={{ marginTop: 8 }}>
                        <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowRepeatUntilCal(v => !v); }}
                          style={[s.pill, { borderColor: fRepeatUntil ? fColor + '55' : c.border, backgroundColor: fRepeatUntil ? fColor + '10' : c.dim }]}>
                          <IconSymbol name="calendar" size={13} color={fRepeatUntil ? fColor : c.sub} />
                          <Text style={{ color: fRepeatUntil ? fColor : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1 }}>
                            {fRepeatUntil
                              ? new Date(fRepeatUntil + 'T00:00').toLocaleDateString(isUk ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                              : (isUk ? 'Оберіть дату' : 'Select date')}
                          </Text>
                          <IconSymbol name={showRepeatUntilCal ? 'chevron.up' : 'chevron.down'} size={11} color={c.sub} />
                        </TouchableOpacity>
                        {showRepeatUntilCal && (
                          <View style={{ marginTop: 8 }}>
                            <CalGrid
                              year={repeatUntilCalYear} month={repeatUntilCalMonth} markedDays={new Set()}
                              selectedDate={fRepeatUntil}
                              onPrevMonth={() => { if (repeatUntilCalMonth === 0) { setRepeatUntilCalMonth(11); setRepeatUntilCalYear(y => y - 1); } else setRepeatUntilCalMonth(m => m - 1); }}
                              onNextMonth={() => { if (repeatUntilCalMonth === 11) { setRepeatUntilCalMonth(0); setRepeatUntilCalYear(y => y + 1); } else setRepeatUntilCalMonth(m => m + 1); }}
                              onSelectDay={d => { setFRepeatUntil(toDateStr(d)); setShowRepeatUntilCal(false); }}
                              accent={fColor} border={c.border} sub={c.sub} text={c.text} lang={lang}
                            />
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Buttons */}
                <View style={{ flexDirection: 'row', gap: 7 }}>
                  {onDelete && (
                    <TouchableOpacity onPress={onDelete}
                      style={[s.btn, { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', paddingHorizontal: 13 }]}>
                      <IconSymbol name="trash" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontWeight: '600', fontSize: 13 }}>{isUk ? 'Скасувати' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} disabled={!canSave}
                    style={[s.btn, { flex: 2, backgroundColor: canSave ? fColor : c.dim }]}>
                    <IconSymbol name="calendar.badge.checkmark" size={14} color={canSave ? '#fff' : c.sub} />
                    <Text style={{ color: canSave ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                      {initial?.id ? (isUk ? 'Зберегти' : 'Save') : (isUk ? 'Додати' : 'Add')}
                    </Text>
                  </TouchableOpacity>
                </View>

              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  wrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:   { borderRadius: 22, borderWidth: 1, padding: 16, overflow: 'hidden', maxHeight: '92%' },
  inp:     { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', borderWidth: 1.5 },
  pill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  btn:     { paddingVertical: 11, borderRadius: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
