import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { ApiError, OfflineError } from '@/store/api';
import { UnsyncedOutboxError, useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { throttleMessage } from '@/store/auth-throttle';
import { useSync } from '@/store/sync-engine';
import { haptic } from '@/utils/haptics';
import { fontFamily } from '@/constants/theme';
import { Avatar, BentoCard, BentoGrid, MeshBackground } from '@/components/ds';

export default function AccountScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { user, updateProfile, changePassword, deleteAccount, switchWorkspace } = useAuth();
  const { pendingCount } = useSync();
  // Керування акаунтом — теж форма: на планшеті тримаємо її в колонці,
  // інакше кнопка збереження відʼїжджає від свого поля на пів екрана вправо.
  const contentWidth = useContentWidth();

  const k = dsTokens(isDark);
  const c = {
    ...getScreenColors('auth', isDark),
    red: k.status.danger,
  };

  // ── Name ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const handleSaveName = async () => {
    setNameError('');
    if (!name.trim()) return;
    setNameSaving(true);
    try {
      await updateProfile(name.trim());
      haptic.success();
      Alert.alert(tr.accountNameSaved, '');
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setNameError(tr.authOfflineError);
      } else if (e instanceof ApiError && e.status === 429) {
        setNameError(throttleMessage(tr, e));
      } else if (e instanceof ApiError && e.status >= 500) {
        setNameError(tr.authServerError);
      } else {
        setNameError(tr.authNetworkError);
      }
    } finally {
      setNameSaving(false);
    }
  };

  // ── Change password ───────────────────────────────────────────────────────
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');

  const handleChangePassword = async () => {
    setPwdError('');
    if (!oldPwd || !newPwd || !repeatPwd) {
      haptic.error();
      setPwdError(tr.authInvalidCreds);
      return;
    }
    if (newPwd !== repeatPwd) {
      haptic.error();
      setPwdError(tr.authPasswordsMismatch);
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(oldPwd, newPwd);
      haptic.success();
      setOldPwd(''); setNewPwd(''); setRepeatPwd('');
      Alert.alert(tr.accountPasswordChanged, '');
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setPwdError(tr.authOfflineError);
      } else if (e instanceof ApiError) {
        if (e.code === 'weak_password') {
          setPwdError(tr.authWeakPassword);
        } else if (e.status === 429) {
          // ERR-03: 429 від throttle — не «невірний пароль».
          setPwdError(throttleMessage(tr, e));
        } else if (e.status === 400 || e.status === 401) {
          setPwdError(tr.authInvalidCreds);
        } else if (e.status >= 500) {
          setPwdError(tr.authServerError);
        } else {
          setPwdError(tr.authNetworkError);
        }
      } else {
        setPwdError(tr.authNetworkError);
      }
    } finally {
      setPwdSaving(false);
    }
  };

  // ── Switch workspace (контракт §2.3) ─────────────────────────────────────
  const [switching, setSwitching] = useState(false);

  const runSwitchWorkspace = async (force: boolean) => {
    setSwitching(true);
    try {
      await switchWorkspace(force);
      router.replace({ pathname: '/workspace', params: { change: '1' } });
    } catch (e) {
      if (e instanceof UnsyncedOutboxError) {
        // Синк не встиг — питаємо явно, а не мовчки стираємо непровштовхнуте.
        Alert.alert(tr.workspaceSwitchSyncFailedTitle, tr.workspaceSwitchSyncFailedMsg, [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.workspaceSwitchProceedAnyway, style: 'destructive', onPress: () => { void runSwitchWorkspace(true); } },
        ]);
        return;
      }
      if (__DEV__) console.warn('[account] switchWorkspace failed:', e);
    } finally {
      setSwitching(false);
    }
  };

  const handleSwitchWorkspace = () => {
    const message = pendingCount > 0
      ? `${tr.workspaceSwitchOutboxWarning}\n\n${tr.workspaceSwitchConfirmMsg}`
      : tr.workspaceSwitchConfirmMsg;
    Alert.alert(tr.workspaceSwitchConfirmTitle, message, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.workspaceSwitchButton,
        style: 'destructive',
        onPress: () => { void runSwitchWorkspace(false); },
      },
    ]);
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deletePwd, setDeletePwd] = useState('');
  const [showDeletePwdText, setShowDeletePwdText] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteRequest = () => {
    Alert.alert(
      tr.accountDeleteConfirmTitle,
      tr.accountDeleteConfirmMsg,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.accountDeleteAccount,
          style: 'destructive',
          onPress: () => setShowDeletePwd(true),
        },
      ],
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deletePwd) {
      haptic.error();
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(deletePwd);
      haptic.success();
      Alert.alert(
        tr.accountDeleteAccount,
        tr.accountDeletedMsg,
        [{ text: 'OK', onPress: () => router.replace('/welcome') }],
      );
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        Alert.alert('', tr.authOfflineError);
      } else if (e instanceof ApiError && e.code === 'owns_team_projects') {
        // Контракт §2.9: власник проєктів з іншими учасниками — соло-проєкти
        // сервер видаляє сам, але командні спершу треба передати комусь.
        Alert.alert('', tr.accountDeleteOwnsProjectsError);
      } else if (e instanceof ApiError && e.code === 'last_admin') {
        Alert.alert('', tr.accountDeleteLastAdminError);
      } else if (e instanceof ApiError && e.status === 429) {
        Alert.alert('', throttleMessage(tr, e));
      } else if (e instanceof ApiError && (e.status === 400 || e.status === 401)) {
        Alert.alert('', tr.authInvalidCreds);
      } else {
        Alert.alert('', tr.authNetworkError);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      {/* Без верхнього краю: інсет зверху дає ScreenHeader через
          useTopInset() (CLAUDE.md) — інакше шапка з'їжджає двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
        {/* Заголовок переїхав із прокрутки в шапку: гола стрілка без назви не
            казала, де ти, а на планшеті ще й вела навмання. Розділу немає в
            сайдбарі, тож там її заступає шлях «Налаштування → Акаунт». */}
        <ScreenHeader
          title={tr.accountManage}
          color={c.text}
          titleStyle={st.title}
          back={{ onPress: () => router.back(), label: tr.back, color: c.text }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.accountManage },
          ]}
          crumbColor={c.sub}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[st.scroll, contentWidth]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Omni: профіль — картка з аватаром; далі bento-картки розділів
                (1 колонка на телефоні, 2 — коли колонка вміщує). */}
            <BentoCard style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {user ? <Avatar person={{ id: user.id, name: user.name || user.email }} size={56} ringColor="transparent" /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.profileName, { color: c.text }]} numberOfLines={1}>{user?.name || user?.email}</Text>
                  {/* Email (readonly) */}
                  <Text accessibilityLabel={`${tr.authEmail}: ${user?.email ?? ''}`} style={[st.profileEmail, { color: c.sub }]} numberOfLines={1}>{user?.email}</Text>
                </View>
              </View>
            </BentoCard>

            <BentoGrid columns={{ compact: 1, medium: 2, expanded: 2 }}>
            {/* Name */}
            <BentoCard title={tr.accountDisplayName} icon="person.fill" accent="info">
            <View style={[st.card, { backgroundColor: k.surface.subtle }]}>
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountDisplayName}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={k.text.muted}
                  placeholder={tr.authName}
                  value={name}
                  onChangeText={v => { setName(v); setNameError(''); }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
              </View>
            </View>
            {nameError ? <Text style={[st.error, { color: c.red }]}>{nameError}</Text> : null}
            <TouchableOpacity
              style={[st.btn, { backgroundColor: nameSaving ? k.action.primaryPressed : k.action.primary }]}
              activeOpacity={0.82}
              onPress={handleSaveName}
              disabled={nameSaving || !name.trim()}
              accessibilityRole="button"
              accessibilityLabel={tr.accountSaveName}
              accessibilityState={{ disabled: nameSaving || !name.trim(), busy: nameSaving }}
            >
              {nameSaving ? (
                <ActivityIndicator color={k.text.onAction} />
              ) : (
                <Text style={[st.btnText, { color: k.text.onAction }]}>{tr.accountSaveName}</Text>
              )}
            </TouchableOpacity>
            </BentoCard>

            {/* Change password */}
            <BentoCard title={tr.accountChangePassword} icon="key.fill" accent="lavender">
            <View style={[st.card, { backgroundColor: k.surface.subtle }]}>
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountOldPassword}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={k.text.muted}
                    placeholder="••••••••"
                    value={oldPwd}
                    onChangeText={v => { setOldPwd(v); setPwdError(''); }}
                    secureTextEntry={!showOld}
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    onPress={() => setShowOld(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showOld ? tr.authHidePassword : tr.authShowPassword}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showOld ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authNewPassword}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={k.text.muted}
                    placeholder="••••••••"
                    value={newPwd}
                    onChangeText={v => { setNewPwd(v); setPwdError(''); }}
                    secureTextEntry={!showNew}
                    textContentType="newPassword"
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNew(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showNew ? tr.authHidePassword : tr.authShowPassword}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showNew ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={k.text.muted}
                    placeholder="••••••••"
                    value={repeatPwd}
                    onChangeText={v => { setRepeatPwd(v); setPwdError(''); }}
                    secureTextEntry={!showRepeat}
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleChangePassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowRepeat(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showRepeat ? tr.authHidePassword : tr.authShowPassword}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showRepeat ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {pwdError ? <Text style={[st.error, { color: c.red }]}>{pwdError}</Text> : null}
            <TouchableOpacity
              style={[st.btn, { backgroundColor: pwdSaving ? k.action.primaryPressed : k.action.primary }]}
              activeOpacity={0.82}
              onPress={handleChangePassword}
              disabled={pwdSaving}
              accessibilityRole="button"
              accessibilityLabel={tr.accountChangePassword}
              accessibilityState={{ disabled: pwdSaving, busy: pwdSaving }}
            >
              {pwdSaving ? (
                <ActivityIndicator color={k.text.onAction} />
              ) : (
                <Text style={[st.btnText, { color: k.text.onAction }]}>{tr.accountChangePassword}</Text>
              )}
            </TouchableOpacity>
            </BentoCard>

            {/* Пристрої та сесії (watch-lockscreen-v1.md §11.1): входи акаунта + Apple Watch. */}
            <BentoCard title={tr.devicesTitle} icon="laptopcomputer" accent="info">
            <View style={[st.card, { backgroundColor: k.surface.subtle }]}>
              <TouchableOpacity
                style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                onPress={() => router.push('/devices' as Href)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={tr.devicesRow}
              >
                <IconSymbol name="laptopcomputer" size={17} color={c.accent} />
                <Text style={[st.input, { color: c.text, flex: 1 }]}>{tr.devicesRow}</Text>
                <IconSymbol name="chevron.right" size={16} color={c.sub} />
              </TouchableOpacity>
            </View>
            </BentoCard>

            {/* Workspace */}
            <BentoCard title={tr.workspaceScreenTitle} icon="building.2.fill" accent="amber">
            <View style={[st.card, { backgroundColor: k.surface.subtle }]}>
              {user?.isAdmin && (
                <TouchableOpacity
                  style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.border }]}
                  onPress={() => router.push('/admin-workspace')}
                  activeOpacity={0.82}
                >
                  <IconSymbol name="person.badge.key.fill" size={16} color={c.accent} />
                  <Text style={[st.input, { color: c.text, flex: 1 }]}>{tr.settingsAdminWorkspace}</Text>
                  <IconSymbol name="chevron.right" size={16} color={c.sub} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 12, opacity: switching ? 0.6 : 1 }]}
                onPress={handleSwitchWorkspace}
                activeOpacity={0.82}
                disabled={switching}
              >
                {switching ? <ActivityIndicator color={c.sub} /> : <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={c.accent} />}
                <Text style={[st.input, { color: c.text, flex: 1 }]}>{tr.workspaceSwitchButton}</Text>
                <IconSymbol name="chevron.right" size={16} color={c.sub} />
              </TouchableOpacity>
            </View>
            </BentoCard>

            {/* Danger zone */}
            <BentoCard title={tr.accountDangerZone} icon="exclamationmark.triangle.fill" accent="coral">
            <View style={[st.card, { backgroundColor: k.surface.subtle }]}>
              <TouchableOpacity
                style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                onPress={handleDeleteRequest}
                activeOpacity={0.82}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.red + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="trash.fill" size={16} color={c.red} />
                </View>
                <Text style={[st.input, { color: c.red, flex: 1 }]}>{tr.accountDeleteAccount}</Text>
                <IconSymbol name="chevron.right" size={16} color={c.red} />
              </TouchableOpacity>

              {showDeletePwd && (
                <View style={[st.fieldWrap, { borderTopColor: c.red + '30', borderTopWidth: 1 }]}>
                  <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountDeleteConfirmPwd}</Text>
                  <View style={st.row}>
                    <TextInput
                      autoFocus
                      style={[st.input, { color: c.text, flex: 1 }]}
                      placeholderTextColor={k.text.muted}
                      placeholder="••••••••"
                      value={deletePwd}
                      onChangeText={setDeletePwd}
                      secureTextEntry={!showDeletePwdText}
                      textContentType="password"
                      returnKeyType="done"
                      onSubmitEditing={handleDeleteConfirm}
                    />
                    <TouchableOpacity
                    onPress={() => setShowDeletePwdText(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showDeletePwdText ? tr.authHidePassword : tr.authShowPassword}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name={showDeletePwdText ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[st.btn, { backgroundColor: c.red, marginTop: 12, opacity: deleting ? 0.7 : 1 }]}
                    activeOpacity={0.82}
                    onPress={handleDeleteConfirm}
                    disabled={deleting || !deletePwd}
                    accessibilityRole="button"
                    accessibilityLabel={tr.accountDeleteAccount}
                    accessibilityState={{ disabled: deleting || !deletePwd, busy: deleting }}
                  >
                    {deleting ? (
                      <ActivityIndicator color={k.text.onAction} />
                    ) : (
                      <Text style={[st.btnText, { color: k.text.onAction }]}>{tr.accountDeleteAccount}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </BentoCard>
            </BentoGrid>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 80,
  },
  // H1 сторінки DS v2 (32/500): ScreenHeader бере його через titleStyle.
  title: {
    fontSize: 32,
    fontFamily: fontFamily.medium,
    letterSpacing: -0.32,
  },
  // Вкладена група полів усередині bento-картки (surface.subtle).
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileName: {
    fontSize: 20,
    fontFamily: fontFamily.semibold,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  fieldWrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    paddingVertical: 4,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  btn: {
    borderRadius: 999,
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
});
