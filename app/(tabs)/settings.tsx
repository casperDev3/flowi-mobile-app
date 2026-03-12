import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeOption, useTheme } from '@/store/theme-context';

type LangOption = 'uk' | 'en';

export default function SettingsScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [lang, setLang] = useState<LangOption>('uk');
  const [notifications, setNotifications] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [financeAlerts, setFinanceAlerts] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    red:    '#EF4444',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
    green:  '#10B981',
  };

  const THEME_LABELS: Record<ThemeOption, string> = { system: 'Системна', light: 'Світла', dark: 'Темна' };
  const LANG_LABELS: Record<LangOption, string> = { uk: 'Українська', en: 'English' };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 104 : 84 }}
          showsVerticalScrollIndicator={false}>

          <View style={{ marginTop: 10, marginBottom: 28 }}>
            <Text style={[st.pageTitle, { color: c.text }]}>Налаштування</Text>
          </View>

          {/* Support — first */}
          <SectionLabel label="Підтримка" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <SettingRow
              icon="heart.fill"
              iconColor="#EF4444"
              label="Задонатити"
              value="PayPal · Donatello"
              onPress={() => router.push('/donate')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <SettingRow
              icon="person.fill"
              iconColor="#7C3AED"
              label="Розробник"
              value="Igor Lialiuk"
              onPress={() => router.push('/developer')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* Розробка */}
          <SectionLabel label="Розробка" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <SettingRow
              icon="ladybug.fill"
              iconColor="#EF4444"
              label="Список багів"
              value="Помилки"
              onPress={() => router.push('/bugs')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <SettingRow
              icon="lightbulb.fill"
              iconColor="#8B5CF6"
              label="Ідеї"
              value="Функції"
              onPress={() => router.push('/ideas')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* Appearance */}
          <SectionLabel label="Зовнішній вигляд" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <SettingRow
              icon="paintbrush"
              iconColor="#8B5CF6"
              label="Тема"
              value={THEME_LABELS[theme]}
              onPress={() => setShowThemeModal(true)}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <SettingRow
              icon="globe"
              iconColor="#0EA5E9"
              label="Мова"
              value={LANG_LABELS[lang]}
              onPress={() => setShowLangModal(true)}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* Notifications */}
          <SectionLabel label="Сповіщення" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <ToggleRow
              icon="bell"
              iconColor="#F59E0B"
              label="Push-сповіщення"
              value={notifications}
              onChange={setNotifications}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <ToggleRow
              icon="checklist"
              iconColor="#7C3AED"
              label="Нагадування по завданнях"
              value={taskReminders}
              onChange={setTaskReminders}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <ToggleRow
              icon="banknote"
              iconColor="#10B981"
              label="Фінансові сповіщення"
              value={financeAlerts}
              onChange={setFinanceAlerts}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* Data */}
          <SectionLabel label="Дані" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <SettingRow
              icon="externaldrive"
              iconColor="#6366F1"
              label="Управління даними"
              value={undefined}
              onPress={() => router.push('/data')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* About */}
          <SectionLabel label="Про додаток" color={c.sub} />
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
            <InfoRow
              icon="info"
              iconColor={c.sub}
              label="Версія"
              value="0.0.1"
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <SettingRow
              icon="heart.fill"
              iconColor="#EF4444"
              label="Оцінити додаток"
              onPress={() => Alert.alert('У розробці', 'Ця функція ще в розробці.')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last={false}
            />
            <SettingRow
              icon="paperplane.fill"
              iconColor="#0EA5E9"
              label="Надіслати відгук"
              onPress={() => Alert.alert('У розробці', 'Ця функція ще в розробці.')}
              text={c.text}
              sub={c.sub}
              border={c.border}
              last
            />
          </BlurView>

          {/* App footer */}
          <View style={[st.footerCard, { opacity: 0.45 }]}>
            <Image
              source={require('@/assets/logo_app.png')}
              style={st.footerLogo}
              resizeMode="contain"
            />
            <Text style={[st.footerName, { color: c.text }]}>Flowi</Text>
            <View style={[st.footerBadge, { backgroundColor: c.accent + '18' }]}>
              <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>v0.0.1</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 8 }}>© 2026</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ─── Theme Modal ─── */}
      <Modal visible={showThemeModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowThemeModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowThemeModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowThemeModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>Тема</Text>
                {(['system', 'light', 'dark'] as ThemeOption[]).map((t, i, arr) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { setTheme(t); setShowThemeModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <IconSymbol
                      name={t === 'system' ? 'circle.lefthalf.filled' : t === 'light' ? 'sun.max' : 'moon'}
                      size={20}
                      color={theme === t ? c.accent : c.sub}
                    />
                    <Text style={[st.optionLabel, { color: theme === t ? c.accent : c.text }]}>{THEME_LABELS[t]}</Text>
                    {theme === t && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Language Modal ─── */}
      <Modal visible={showLangModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowLangModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowLangModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowLangModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>Мова</Text>
                {(['uk', 'en'] as LangOption[]).map((l, i, arr) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => { setLang(l); setShowLangModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>{l === 'uk' ? '🇺🇦' : '🇬🇧'}</Text>
                    <Text style={[st.optionLabel, { color: lang === l ? c.accent : c.text }]}>{LANG_LABELS[l]}</Text>
                    {lang === l && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return <Text style={[st.sectionLabel, { color }]}>{label.toUpperCase()}</Text>;
}

function SettingRow({ icon, iconColor, label, value, onPress, text, sub, border, last }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon as IconSymbolName} size={17} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {value && <Text style={[st.rowValue, { color: sub }]}>{value}</Text>}
        <IconSymbol name="chevron.right" size={16} color={sub} />
      </View>
    </TouchableOpacity>
  );
}

function ToggleRow({ icon, iconColor, label, value, onChange, text, sub, border, last }: any) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon as IconSymbolName} size={17} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#7C3AED' }}
        thumbColor="#fff"
        ios_backgroundColor="rgba(128,128,128,0.3)"
      />
    </View>
  );
}

function InfoRow({ icon, iconColor, label, value, text, sub, border, last }: any) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '18' }]}>
        <IconSymbol name={icon as IconSymbolName} size={17} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <Text style={[st.rowValue, { color: sub }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle:   { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:        { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  dangerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconBox:     { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { fontSize: 14, fontWeight: '500' },
  rowValue:    { fontSize: 13, fontWeight: '500' },
  dangerLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#EF4444' },
  appBadge:    { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  footerCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, marginBottom: 8 },
  footerLogo:  { width: 26, height: 26, borderRadius: 7 },
  footerName:  { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  footerBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  bugBanner:   { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, padding: 14, overflow: 'hidden' },
  bugBannerIcon:{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bugChevron:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: '90%' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
