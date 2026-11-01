/**
 * components/calendar/GoogleCalendarSheet.tsx — налаштування імпорту Google
 * Calendar. Перенесено з app/meetings.tsx без зміни станів:
 *   1. немає Client ID — інструкція й поле вводу;
 *   2. Client ID є, не підключено — «Підключити Google»;
 *   3. підключено — «Синхронізувати зараз» / «Відключити».
 */
import React from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';

import type { CalendarColors } from './palette';
import type { GoogleCalendarState } from './useGoogleCalendar';
import { fontFamily, radius } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

/** Фірмовий синій Google — лише на логотипі інтеграції. */
const GOOGLE_BLUE = '#4285F4';

export function GoogleCalendarSheet({ visible, onClose, gcal, isDark, c }: {
  visible: boolean;
  onClose: () => void;
  gcal: GoogleCalendarState;
  isDark: boolean;
  c: CalendarColors;
}) {
  const sheetSurface = useSheetSurface();
  const { tr } = useI18n();
  const t = dsTokens(isDark);
  const { clientId, clientInput, setClientInput, token, importing, lastSync, importCount } = gcal;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessible={false} style={[st.overlay, { backgroundColor: t.surface.overlay }]} onPress={onClose}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()} style={st.sheetWrapper} accessibilityViewIsModal importantForAccessibility="yes">
          <View style={[st.sheet, sheetSurface, { backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.dim,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="calendar" size={22} color={GOOGLE_BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontFamily: fontFamily.semibold, color: c.text }}>Google Calendar</Text>
                  <Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: c.sub, marginTop: 2 }}>
                    {token ? tr.gcalConnected : clientId ? tr.gcalClientIdSet : tr.gcalSetup}
                  </Text>
                </View>
                {token && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.status.success }} />}
              </View>

              {!clientId && (
                <>
                  <View style={{ backgroundColor: c.dim, borderRadius: radius.nested, padding: 16, marginBottom: 16, gap: 10 }}>
                    {[
                      ['1', tr.gcalStep1],
                      ['2', tr.gcalStep2],
                      ['3', tr.gcalStep3],
                      ['4', tr.gcalStep4],
                    ].map(([n, text]) => (
                      <View key={n} style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.card,
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Text style={{ fontSize: 11, fontFamily: fontFamily.semibold, color: c.text, fontVariant: ['tabular-nums'] }}>{n}</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: c.sub, flex: 1, lineHeight: 19 }}>{text}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontFamily: fontFamily.medium }}>Google OAuth Client ID</Text>
                  <TextInput
                    placeholder="xxxxx.apps.googleusercontent.com"
                    placeholderTextColor={c.muted}
                    value={clientInput}
                    onChangeText={setClientInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Google OAuth Client ID"
                    style={[st.inp, { backgroundColor: c.dim, color: c.text, marginBottom: 12 }]}
                  />

                  <TouchableOpacity
                    onPress={() => { if (clientInput.trim()) void gcal.saveClientId(clientInput); }}
                    style={[st.btn, { backgroundColor: clientInput.trim() ? t.action.primary : t.state.disabledBg, marginBottom: 10 }]}>
                    <IconSymbol name="checkmark" size={16} color={clientInput.trim() ? t.text.onAction : t.state.disabledText} />
                    <Text style={{ color: clientInput.trim() ? t.text.onAction : t.state.disabledText, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.gcalSaveClientId}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={onClose}
                    style={[st.btn, { backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
                    <Text style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                </>
              )}

              {clientId && !token && (
                <>
                  <View style={{ backgroundColor: c.dim, borderRadius: radius.nested, padding: 16, marginBottom: 16 }}>
                    <Text style={{ fontSize: 11, color: c.sub, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5 }}>CLIENT ID</Text>
                    <Text style={{ fontSize: 13, color: c.text, marginTop: 4 }} numberOfLines={1}>
                      {clientId.length > 40 ? clientId.slice(0, 37) + '...' : clientId}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: c.sub, lineHeight: 20, marginBottom: 20 }}>
                    {tr.gcalConnectHint}
                  </Text>
                  <TouchableOpacity onPress={() => { onClose(); void gcal.connect(); }}
                    style={[st.btn, { backgroundColor: t.action.primary, marginBottom: 10 }]}>
                    <IconSymbol name="person.badge.plus" size={16} color={t.text.onAction} />
                    <Text style={{ color: t.text.onAction, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.gcalConnectGoogle}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { void gcal.saveClientId(''); setClientInput(''); }}
                    style={[st.btn, { backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
                    <IconSymbol name="pencil" size={15} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.gcalChangeClientId}</Text>
                  </TouchableOpacity>
                </>
              )}

              {token && (
                <>
                  {lastSync && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
                      paddingVertical: 12, borderRadius: radius.nested, backgroundColor: c.dim, marginBottom: 16 }}>
                      <IconSymbol name="checkmark.circle.fill" size={16} color={t.status.success} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, color: c.text }}>{tr.gcalLastSync}</Text>
                        <Text style={{ fontSize: 12, color: c.sub, marginTop: 1 }}>{lastSync}</Text>
                      </View>
                      {importCount > 0 && (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: t.accent.lime }}>
                          <Text style={{ fontSize: 12, fontFamily: fontFamily.semibold, color: t.text.onAccent, fontVariant: ['tabular-nums'] }}>{tr.gcalNewCount.replace('{n}', String(importCount))}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => { onClose(); void gcal.importNow(); }}
                    disabled={importing}
                    style={[st.btn, { backgroundColor: t.action.primary, marginBottom: 10 }]}>
                    {importing
                      ? <ActivityIndicator color={t.text.onAction} />
                      : <>
                          <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={t.text.onAction} />
                          <Text style={{ color: t.text.onAction, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.gcalSyncNow}</Text>
                        </>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => gcal.disconnect(onClose)}
                    style={[st.btn, { backgroundColor: glassOf(t).surfaceSubtle, marginBottom: 8 }]}>
                    <IconSymbol name="xmark.circle" size={16} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.gcalDisconnect}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { void gcal.saveClientId(''); setClientInput(''); }}
                    style={[st.btn, { backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
                    <IconSymbol name="pencil" size={15} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.gcalChangeClientId}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  sheet: { borderRadius: radius.card, padding: 20, overflow: 'hidden' },
  inp: { borderRadius: radius.control, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, fontFamily: fontFamily.regular },
  btn: { minHeight: 48, paddingVertical: 11, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
});
