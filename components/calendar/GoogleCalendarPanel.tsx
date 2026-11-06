/**
 * components/calendar/GoogleCalendarPanel.tsx — вміст налаштувань Google
 * Calendar (серверний OAuth). Спільний для аркуша календаря
 * (GoogleCalendarSheet) і екрана «Інтеграції».
 *
 * Стани:
 *   1. не налаштовано адміністратором — лише пояснення;
 *   2. не підключено / потрібен повторний вхід — «Підключити Google»;
 *   3. підключено — акаунт, стан, остання синхронізація, «Синхронізувати
 *      зараз», «Календарі» (імпорт з кількох, експорт в один), конфлікти,
 *      кошик, «Відключити».
 *
 * Кольори — dsTheme(isDark) (без use-ds/theme-context): панель рендериться в
 * тестах без нативного сховища.
 */
import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { dsTheme } from '@/components/shared/dsTheme';
import { fontFamily, radius } from '@/constants/theme';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import {
  conflictFieldKeys, conflictValue, needsReconnect, sameSelection, setExportCalendar, toggleImportCalendar,
  type GcalConflictField,
} from '@/utils/googleCalendar';
import { integrationCodeMessage } from '@/utils/integrationErrors';
import type { Meeting } from '@/utils/meetings';

import type { GoogleCalendarSync } from './useGoogleCalendarSync';

/** Фірмовий синій Google — лише на логотипі й як запасний колір календаря. */
const GOOGLE_BLUE = '#4285F4';

function stateLabel(tr: Translations, state: string, needsSetup: boolean): string {
  if (needsSetup) return tr.gcalStateDraft;
  switch (state) {
    case 'draft': return tr.gcalStateDraft;
    case 'active': return tr.gcalStateActive;
    case 'retry': return tr.gcalStateRetry;
    case 'attention': return tr.gcalStateAttention;
    case 'disconnected': return tr.gcalStateDisconnected;
    default: return state;
  }
}

function fieldLabel(tr: Translations, f: GcalConflictField): string {
  return {
    title: tr.gcalFieldTitle, time: tr.gcalFieldTime, description: tr.gcalFieldDescription,
    location: tr.gcalFieldLocation, recurrence: tr.gcalFieldRecurrence, cancelled: tr.gcalFieldCancelled,
  }[f];
}

function when(iso: string | null | undefined, locale: string, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function GoogleCalendarPanel({ gcal, isDark, trash = [], onRestoreLocal, showHeader = true }: {
  gcal: GoogleCalendarSync;
  isDark: boolean;
  /** Зустрічі в кошику (deletedAt / integrationCancelled). Без них розділ не показується. */
  trash?: Meeting[];
  /** Відновлення не пов'язаної з Google зустрічі — звичайним записом у 'meetings'. */
  onRestoreLocal?: (meeting: Meeting) => void;
  showHeader?: boolean;
}) {
  const { tr, lang } = useI18n();
  const t = dsTheme(isDark);
  const locale = lang === 'en' ? 'en-GB' : 'uk-UA';
  const { status, busy } = gcal;
  const conn = status?.connection ?? null;
  const reconnect = needsReconnect(status);
  const text = t.text.primary, sub = t.text.secondary;

  const btn = (label: string, onPress: () => void, opts: { primary?: boolean; icon?: string; loading?: boolean; disabled?: boolean } = {}) => {
    const disabled = !!busy || !!opts.disabled;
    const bg = opts.primary ? (disabled ? t.surface.subtle : t.action.primary) : t.surface.subtle;
    const fg = opts.primary ? (disabled ? t.text.muted : t.text.onAction) : text;
    return (
      <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: !!opts.loading }}
        disabled={disabled} onPress={onPress} style={[st.btn, { backgroundColor: bg }]}>
        {opts.loading
          ? <ActivityIndicator size="small" color={fg} />
          : opts.icon ? <IconSymbol name={opts.icon as never} size={16} color={fg} /> : null}
        <Text style={{ color: fg, fontSize: 14, fontFamily: fontFamily.semibold }}>{label}</Text>
      </Pressable>
    );
  };

  const confirmDisconnect = () => Alert.alert(tr.gcalDisconnectTitle, tr.gcalDisconnectBody, [
    { text: tr.cancel, style: 'cancel' },
    { text: tr.gcalDisconnect, style: 'destructive', onPress: () => { void gcal.disconnect(); } },
  ]);

  const words = { yes: tr.gcalYes, no: tr.gcalNo, allDay: tr.gcalAllDay, minutes: tr.gcalMinutes, empty: '—' };

  return (
    <View style={{ gap: 14 }}>
      <View style={st.row}>
        {showHeader && (
          <View style={[st.logo, { backgroundColor: t.surface.subtle }]}>
            <IconSymbol name="calendar" size={22} color={GOOGLE_BLUE} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {showHeader && <Text style={[st.title, { color: text }]}>Google Calendar</Text>}
          <Text numberOfLines={1} style={{ color: sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: showHeader ? 2 : 0 }}>
            {!gcal.loaded ? tr.gcalChecking : conn ? (conn.account || tr.gcalGoogleAccount) : tr.gcalTwoWayHint}
          </Text>
        </View>
        {conn && (
          <View style={[st.pill, { backgroundColor: t.surface.subtle }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor:
              conn.state === 'active' && !conn.needs_setup ? t.status.success : conn.state === 'disconnected' ? t.text.muted : t.status.warning }} />
            <Text style={{ color: text, fontSize: 12, fontFamily: fontFamily.medium }}>{stateLabel(tr, conn.state, conn.needs_setup)}</Text>
          </View>
        )}
      </View>

      {!!gcal.error && <Text accessibilityRole="alert" style={[st.msg, { color: t.status.danger, backgroundColor: t.surface.subtle }]}>{gcal.error}</Text>}
      {!!gcal.notice && <Text accessibilityLiveRegion="polite" style={[st.msg, { color: text, backgroundColor: t.surface.subtle }]}>{gcal.notice}</Text>}

      {status && !status.configured && !conn && (
        <Text style={{ color: sub, fontSize: 14, lineHeight: 20 }}>{tr.gcalNotConfigured}</Text>
      )}

      {status?.configured && reconnect && (
        <>
          <Text style={{ color: sub, fontSize: 14, lineHeight: 20 }}>{tr.gcalConnectHint}</Text>
          {btn(tr.gcalConnectGoogle, () => { void gcal.connect(); }, { primary: true, icon: 'person.badge.plus', loading: busy === 'connect' })}
        </>
      )}

      {conn && (
        <View style={[st.box, { backgroundColor: t.surface.subtle }]}>
          <Line label={tr.gcalLastSync} value={when(conn.last_success, locale, tr.gcalNeverSynced)} color={text} sub={sub} />
          {conn.calendars.length > 0 && <>
            <Line label={tr.gcalImportFrom} value={conn.calendars.map(c => c.label).join(', ')} color={text} sub={sub} />
            <Line label={tr.gcalExportTo} value={conn.calendars.find(c => c.export)?.label ?? tr.gcalNoExport} color={text} sub={sub} />
          </>}
        </View>
      )}

      {!!conn?.error_code && conn.error_code !== 'conflicts_pending' && (
        <View style={st.row}>
          <IconSymbol name="exclamationmark.triangle.fill" size={16} color={t.status.warning} />
          <Text style={{ color: text, fontSize: 13, flex: 1 }}>{integrationCodeMessage(conn.error_code, tr, 'google')}</Text>
        </View>
      )}

      {conn && !reconnect && !gcal.calendars && (
        <View style={{ gap: 10 }}>
          {!conn.needs_setup && btn(tr.gcalSyncNow, () => { void gcal.syncNow(); }, { primary: true, icon: 'arrow.triangle.2.circlepath', loading: busy === 'sync' })}
          {btn(conn.needs_setup ? tr.gcalChooseCalendars : tr.gcalCalendars, () => { void gcal.loadCalendars(); },
            { primary: conn.needs_setup, icon: 'calendar', loading: busy === 'calendars' })}
          {conn.conflicts > 0 && !gcal.conflicts && btn(tr.gcalConflicts.replace('{n}', String(conn.conflicts)), () => { void gcal.loadConflicts(); },
            { icon: 'exclamationmark.triangle.fill', loading: busy === 'conflicts' })}
        </View>
      )}

      {gcal.calendars && (
        <View style={{ gap: 10 }}>
          <Text style={[st.heading, { color: text }]}>{tr.gcalCalendars}</Text>
          <Text style={{ color: sub, fontSize: 13, lineHeight: 18 }}>{tr.gcalCalendarsHint}</Text>
          {gcal.calendars.length === 0 && <Text style={{ color: sub }}>{tr.gcalNoCalendars}</Text>}
          {gcal.calendars.map(c => {
            const imported = gcal.selection.import.includes(c.id);
            const exported = gcal.selection.export === c.id;
            return (
              <View key={c.id} style={[st.box, { backgroundColor: t.surface.subtle, gap: 8 }]}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: imported }} accessibilityLabel={`${tr.gcalImportFrom}: ${c.label}`}
                  onPress={() => gcal.setSelection(toggleImportCalendar(gcal.selection, c.id))} style={st.row}>
                  <IconSymbol name={imported ? 'checkmark.circle.fill' : 'circle'} size={20} color={imported ? t.action.primary : t.text.muted} />
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color || GOOGLE_BLUE }} />
                  <Text numberOfLines={1} style={{ color: text, fontSize: 14, flex: 1, fontFamily: fontFamily.medium }}>{c.label}</Text>
                  {c.primary && <Text style={{ color: sub, fontSize: 11 }}>{tr.gcalPrimary}</Text>}
                </Pressable>
                {c.writable ? (
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: exported }} accessibilityLabel={`${tr.gcalExportHere}: ${c.label}`}
                    onPress={() => gcal.setSelection(setExportCalendar(gcal.selection, c.id, gcal.calendars ?? []))} style={[st.row, { paddingLeft: 28 }]}>
                    <IconSymbol name={exported ? 'record.circle' : 'circle'} size={16} color={exported ? t.action.primary : t.text.muted} />
                    <Text style={{ color: exported ? text : sub, fontSize: 13 }}>{tr.gcalExportHere}</Text>
                  </Pressable>
                ) : <Text style={{ color: sub, fontSize: 12, paddingLeft: 28 }}>{tr.gcalReadOnly}</Text>}
              </View>
            );
          })}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: gcal.selection.export === null }} accessibilityLabel={tr.gcalDontExport}
            onPress={() => gcal.setSelection(setExportCalendar(gcal.selection, null))} style={st.row}>
            <IconSymbol name={gcal.selection.export === null ? 'record.circle' : 'circle'} size={16} color={gcal.selection.export === null ? t.action.primary : t.text.muted} />
            <Text style={{ color: sub, fontSize: 13, flex: 1 }}>{tr.gcalDontExport}</Text>
          </Pressable>
          {btn(tr.gcalSaveSelection, () => { void gcal.saveCalendars(); }, {
            primary: true, icon: 'checkmark', loading: busy === 'save',
            disabled: gcal.selection.import.length === 0 || (sameSelection(gcal.selection, gcal.savedSelection) && !conn?.needs_setup),
          })}
          {btn(tr.cancel, gcal.closeCalendars)}
        </View>
      )}

      {gcal.conflicts && (
        <View style={{ gap: 10 }}>
          <Text style={[st.heading, { color: text }]}>{tr.gcalConflictsTitle}</Text>
          <Text style={{ color: sub, fontSize: 13, lineHeight: 18 }}>{tr.gcalConflictsHint}</Text>
          {gcal.conflicts.length === 0 && <Text style={{ color: sub }}>{tr.gcalNoConflicts}</Text>}
          {gcal.conflicts.map(c => {
            const keys = conflictFieldKeys(c.fields);
            const resolving = busy === `resolve:${c.id}`;
            return (
              <View key={c.id} style={[st.box, { backgroundColor: t.surface.subtle, gap: 8 }]}>
                <Text numberOfLines={2} style={{ color: text, fontSize: 15, fontFamily: fontFamily.semibold }}>{c.title || c.local?.title || tr.gcalUntitled}</Text>
                <Text style={{ color: sub, fontSize: 12 }}>{c.calendar_label} · {keys.map(k => fieldLabel(tr, k)).join(', ')}</Text>
                {([['Flowi', c.local], ['Google', c.remote]] as const).map(([label, side]) => (
                  <View key={label} style={{ gap: 2 }}>
                    <Text style={{ color: text, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
                    {keys.map(k => (
                      <Text key={k} style={{ color: sub, fontSize: 13 }}>{fieldLabel(tr, k)}: <Text style={{ color: text }}>{conflictValue(side, k, words)}</Text></Text>
                    ))}
                  </View>
                ))}
                {btn(tr.gcalKeepFlowi, () => { void gcal.resolve(c, 'local'); }, { loading: resolving })}
                {btn(tr.gcalTakeGoogle, () => { void gcal.resolve(c, 'remote'); }, { loading: resolving })}
              </View>
            );
          })}
          {btn(tr.cancel, gcal.closeConflicts)}
        </View>
      )}

      {trash.length > 0 && !gcal.calendars && !gcal.conflicts && (
        <View style={{ gap: 8 }}>
          <Text style={[st.heading, { color: text }]}>{tr.gcalTrash.replace('{n}', String(trash.length))}</Text>
          <Text style={{ color: sub, fontSize: 13, lineHeight: 18 }}>{tr.gcalTrashHint}</Text>
          {trash.map(m => {
            const linked = m.integration?.provider === 'google' && m.integration.state !== 'disconnected' && !!conn;
            return (
              <View key={m.id} style={[st.row, st.box, { backgroundColor: t.surface.subtle }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: text, fontSize: 14, fontFamily: fontFamily.medium }}>{m.title || tr.gcalUntitled}</Text>
                  <Text style={{ color: sub, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                    {m.date} {m.time} · {m.deletedSource === 'google' ? tr.gcalDeletedInGoogle : m.deletedSource === 'google_relink' ? tr.gcalDeletedDuplicate : tr.gcalDeletedInFlowi}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${tr.gcalRestore}: ${m.title}`} disabled={!!busy}
                  onPress={() => { if (linked) void gcal.restore(m.id); else onRestoreLocal?.(m); }}
                  style={[st.smallBtn, { backgroundColor: t.surface.card }]}>
                  {busy === `restore:${m.id}`
                    ? <ActivityIndicator size="small" color={text} />
                    : <IconSymbol name="arrow.uturn.backward" size={14} color={text} />}
                  <Text style={{ color: text, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.gcalRestore}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {conn && !gcal.calendars && !gcal.conflicts && btn(tr.gcalDisconnect, confirmDisconnect, { icon: 'xmark.circle', loading: busy === 'disconnect' })}
    </View>
  );
}

function Line({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ color: sub, fontSize: 13, width: 130 }}>{label}</Text>
      <Text style={{ color, fontSize: 13, flex: 1, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: fontFamily.semibold },
  heading: { fontSize: 16, fontFamily: fontFamily.semibold },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  msg: { fontSize: 13, lineHeight: 18, padding: 12, borderRadius: radius.nested, overflow: 'hidden' },
  box: { padding: 12, borderRadius: radius.nested, gap: 6 },
  btn: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
