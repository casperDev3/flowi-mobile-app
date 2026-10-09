/**
 * components/calendar/GoogleCalendarSheet.tsx — налаштування імпорту Google
 * Calendar. Перенесено з app/meetings.tsx без зміни станів:
 *   1. немає Client ID — інструкція й поле вводу;
 *   2. Client ID є, не підключено — «Підключити Google»;
 *   3. підключено — «Синхронізувати зараз» / «Відключити».
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';

import type { CalendarColors } from './palette';
import type { GoogleCalendarState } from './useGoogleCalendar';

export function GoogleCalendarSheet({ visible, onClose, gcal, isDark, c }: {
  visible: boolean;
  onClose: () => void;
  gcal: GoogleCalendarState;
  isDark: boolean;
  c: CalendarColors;
}) {
  const sheetSurface = useSheetSurface();
  const { tr } = useI18n();
  const { clientId, clientInput, setClientInput, token, importing, lastSync, importCount } = gcal;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessible={false} style={st.overlay} onPress={onClose}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()} style={st.sheetWrapper} accessibilityViewIsModal importantForAccessibility="yes">
          <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
            style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,12,22,0.98)' : 'rgba(240,240,255,0.98)' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <View style={{ width: 44, height: 44, borderRadius: Atlas.radius.medium, backgroundColor: '#4285F4' + '18',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4285F4' + '30' }}>
                  <IconSymbol name="calendar" size={22} color="#4285F4" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Google Calendar</Text>
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>
                    {token ? tr.gcalConnected : clientId ? tr.gcalClientIdSet : tr.gcalSetup}
                  </Text>
                </View>
                {token && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#34A853' }} />}
              </View>

              {!clientId && (
                <>
                  <View style={{ backgroundColor: c.dim, borderRadius: Atlas.radius.large, padding: 14, marginBottom: 16, gap: 10 }}>
                    {[
                      ['1', tr.gcalStep1],
                      ['2', tr.gcalStep2],
                      ['3', tr.gcalStep3],
                      ['4', tr.gcalStep4],
                    ].map(([n, text]) => (
                      <View key={n} style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#4285F4' + '20',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: Atlas.type.headingWeight, color: '#4285F4' }}>{n}</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: c.sub, flex: 1, lineHeight: 19 }}>{text}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Google OAuth Client ID</Text>
                  <TextInput
                    placeholder="xxxxx.apps.googleusercontent.com"
                    placeholderTextColor={c.sub}
                    value={clientInput}
                    onChangeText={setClientInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Google OAuth Client ID"
                    style={[st.inp, { backgroundColor: c.dim, color: c.text, borderColor: c.border, marginBottom: 12 }]}
                  />

                  <TouchableOpacity
                    onPress={() => { if (clientInput.trim()) void gcal.saveClientId(clientInput); }}
                    style={[st.btn, { backgroundColor: clientInput.trim() ? '#4285F4' : c.dim, marginBottom: 10 }]}>
                    <IconSymbol name="checkmark" size={16} color={clientInput.trim() ? '#fff' : c.sub} />
                    <Text style={{ color: clientInput.trim() ? '#fff' : c.sub, fontSize: 15, fontWeight: '700' }}>{tr.gcalSaveClientId}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={onClose}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                </>
              )}

              {clientId && !token && (
                <>
                  <View style={{ backgroundColor: '#4285F4' + '10', borderRadius: Atlas.radius.medium, padding: 12, marginBottom: 16,
                    borderWidth: 1, borderColor: '#4285F4' + '25' }}>
                    <Text style={{ fontSize: 11, color: c.sub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>CLIENT ID</Text>
                    <Text style={{ fontSize: 13, color: c.text, marginTop: 4 }} numberOfLines={1}>
                      {clientId.length > 40 ? clientId.slice(0, 37) + '...' : clientId}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: c.sub, lineHeight: 20, marginBottom: 20 }}>
                    {tr.gcalConnectHint}
                  </Text>
                  <TouchableOpacity onPress={() => { onClose(); void gcal.connect(); }}
                    style={[st.btn, { backgroundColor: '#4285F4', marginBottom: 10 }]}>
                    <IconSymbol name="person.badge.plus" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{tr.gcalConnectGoogle}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { void gcal.saveClientId(''); setClientInput(''); }}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                    <IconSymbol name="pencil" size={15} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>{tr.gcalChangeClientId}</Text>
                  </TouchableOpacity>
                </>
              )}

              {token && (
                <>
                  {lastSync && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
                      paddingVertical: 10, borderRadius: Atlas.radius.medium, backgroundColor: '#34A853' + '10',
                      borderWidth: 1, borderColor: '#34A853' + '30', marginBottom: 16 }}>
                      <IconSymbol name="checkmark.circle.fill" size={16} color="#34A853" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{tr.gcalLastSync}</Text>
                        <Text style={{ fontSize: 12, color: c.sub, marginTop: 1 }}>{lastSync}</Text>
                      </View>
                      {importCount > 0 && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: Atlas.radius.small, backgroundColor: '#34A853' + '20' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#34A853' }}>{tr.gcalNewCount.replace('{n}', String(importCount))}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => { onClose(); void gcal.importNow(); }}
                    disabled={importing}
                    style={[st.btn, { backgroundColor: '#4285F4', marginBottom: 10 }]}>
                    {importing
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{tr.gcalSyncNow}</Text>
                        </>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => gcal.disconnect(onClose)}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border, marginBottom: 8 }]}>
                    <IconSymbol name="xmark.circle" size={16} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>{tr.gcalDisconnect}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { void gcal.saveClientId(''); setClientInput(''); }}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                    <IconSymbol name="pencil" size={15} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>{tr.gcalChangeClientId}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  sheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 16, overflow: 'hidden' },
  inp: { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', borderWidth: 1.5 },
  btn: { minHeight: 44, paddingVertical: 11, borderRadius: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
});
