/**
 * app/settings-notifications.tsx — налаштування сповіщень
 * (notifications-module.md §4.4–§4.5, §6.3, §11).
 *
 * Джерело правди — сервер (`GET/PATCH /notifications/preferences/`), а не
 * AsyncStorage: сервер читає матрицю в момент відправки, і вона спільна для
 * всіх пристроїв і вебу. Локально лежить лише кеш для першого кадру; зміна
 * на іншому пристрої приходить WS-сигналом `settings_revision` і
 * перечитується (`api/notifications.ts::handleNotificationsSignal`).
 *
 * Кожен дотик — окремий частковий PATCH (лише змінене поле), тож дві правки
 * з різних пристроїв конфліктують лише на тому самому перемикачі.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { type NotificationChannel, type PreferencesPatch, updatePreferences } from '@/api/notifications';
import { fillTemplate } from '@/components/notifications/labels';
import { PreferencesMatrix } from '@/components/notifications/PreferencesMatrix';
import { QuietHoursCard } from '@/components/notifications/QuietHoursCard';
import { useNotificationPreferences } from '@/components/notifications/use-notification-center';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { useUiModules } from '@/store/ui-preferences';

const ACCENT = '#7C3AED';
const MEETING_LEAD_OPTIONS = [5, 10, 15, 30, 60];

export default function NotificationSettingsScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { disabledModules } = useUiModules();
  const prefs = useNotificationPreferences();
  const doc = prefs.doc;

  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    card:   isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
    accent: ACCENT,
  }), [isDark]);

  const save = useCallback((patch: PreferencesPatch) => {
    updatePreferences(patch).catch(() => {
      Alert.alert(tr.ncSettingsTitle, tr.ncSaveFailed);
    });
  }, [tr]);

  // Email показуємо лише там, де сервер уміє пошту (§13.9): стовпчик, який
  // нічого не надсилає, лише обманює.
  const channels: NotificationChannel[] = useMemo(() => {
    const out: NotificationChannel[] = ['in_app', 'push'];
    if (doc?.available_channels?.email) out.push('email');
    return out;
  }, [doc?.available_channels?.email]);

  const unavailable = !doc && (prefs.status === 'offline' || prefs.status === 'unavailable' || prefs.status === 'error');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <View style={contentWidth}>
        <ScreenHeader
          title={tr.ncSettingsTitle}
          color={c.text}
          // «Назад» і крихти — через спільне правило ScreenHeader (ScreenHeaderNav.ts):
          // на планшеті стрілка поруч із сайдбаром — рудимент, а шлях нагору дають крихти.
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { backgroundColor: c.dim, borderColor: c.border },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.ncSettingsTitle },
          ]}
          crumbColor={c.sub}
          actions={prefs.saving ? <ActivityIndicator color={c.accent} /> : null}
        />
      </View>

      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[st.intro, { color: c.sub }]}>{tr.ncSettingsIntro}</Text>

        {!doc ? (
          unavailable ? (
            <View style={[st.card, st.notice, { borderColor: c.border, backgroundColor: c.card }]}>
              <IconSymbol name={prefs.status === 'offline' ? 'wifi.slash' : 'info.circle'} size={18} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, flex: 1, lineHeight: 18 }}>
                {prefs.status === 'offline' ? tr.ncSettingsOffline : prefs.status === 'unavailable' ? tr.ncUnavailable : tr.ncLoadFailed}
              </Text>
            </View>
          ) : (
            <ActivityIndicator color={c.accent} style={{ marginTop: 32 }} />
          )
        ) : (
          <>
            <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
              <ToggleRow
                icon="bell.badge"
                iconColor="#F59E0B"
                title={tr.ncMaster}
                subtitle={tr.ncMasterSub}
                value={doc.enabled}
                onChange={value => save({ enabled: value })}
                colors={c}
              />
              <View style={[st.divider, { backgroundColor: c.border }]} />
              <ToggleRow
                icon="paperplane.fill"
                iconColor="#0EA5E9"
                title={tr.ncPushMaster}
                subtitle={tr.ncPushMasterSub}
                value={doc.push_enabled}
                disabled={!doc.enabled}
                onChange={value => save({ push_enabled: value })}
                colors={c}
              />
              {channels.includes('email') ? (
                <>
                  <View style={[st.divider, { backgroundColor: c.border }]} />
                  <ToggleRow
                    icon="doc.text"
                    iconColor="#10B981"
                    title={tr.ncEmailMaster}
                    value={doc.email_enabled}
                    disabled={!doc.enabled}
                    onChange={value => save({ email_enabled: value })}
                    colors={c}
                  />
                </>
              ) : null}
            </View>

            <QuietHoursCard
              enabled={doc.quiet_hours.enabled}
              start={doc.quiet_hours.start}
              end={doc.quiet_hours.end}
              timezone={doc.timezone}
              tr={tr}
              colors={c}
              onToggle={value => save({ quiet_hours: { enabled: value } })}
              onChangeTime={(edge, value) => save({ quiet_hours: { [edge]: value } })}
            />

            <Text style={[st.section, { color: c.sub }]}>{tr.ncMatrixTitle.toUpperCase()}</Text>
            <PreferencesMatrix
              doc={doc}
              channels={channels}
              disabledModules={disabledModules}
              tr={tr}
              colors={c}
              onChange={save}
            />

            {!disabledModules.includes('meetings') ? (
              <>
                <Text style={[st.section, { color: c.sub }]}>{tr.ncMeetingLead.toUpperCase()}</Text>
                <View style={st.chips}>
                  {MEETING_LEAD_OPTIONS.map(minutes => {
                    const active = doc.meeting_lead_minutes === minutes;
                    return (
                      <TouchableOpacity
                        key={minutes}
                        onPress={() => save({ meeting_lead_minutes: minutes })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[st.chip, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + '1F' : 'transparent' }]}>
                        <Text style={{ color: active ? c.accent : c.text, fontSize: 13, fontWeight: '700' }}>
                          {fillTemplate(tr.ncMinutesBefore, { n: minutes })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {disabledModules.length ? (
              <Text style={[st.intro, { color: c.sub, marginTop: 8 }]}>{tr.ncHiddenByModules}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface ToggleRowProps {
  icon: 'bell.badge' | 'paperplane.fill' | 'doc.text';
  iconColor: string;
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  colors: { text: string; sub: string; accent: string };
}

function ToggleRow({ icon, iconColor, title, subtitle, value, disabled, onChange, colors: c }: ToggleRowProps) {
  return (
    <View style={[st.toggleRow, disabled && { opacity: 0.5 }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={title}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        trackColor={{ false: 'rgba(128,128,128,0.3)', true: c.accent }}
        thumbColor="#fff"
        ios_backgroundColor="rgba(128,128,128,0.3)"
      />
    </View>
  );
}

const st = StyleSheet.create({
  intro:     { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  card:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  notice:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  iconBox:   { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  divider:   { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  section:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 10, marginBottom: 8, marginLeft: 2 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip:      { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
