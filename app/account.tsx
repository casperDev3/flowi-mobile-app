import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError, OfflineError } from '@/store/api';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { haptic } from '@/utils/haptics';

export default function AccountScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { user, updateProfile, changePassword, deleteAccount } = useAuth();

  const c = {
    ...getScreenColors('auth', isDark),
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    red:    '#EF4444',
    green:  '#10B981',
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
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={c.accent} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={st.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.title, { color: c.text }]}>{tr.accountManage}</Text>

            {/* Email (readonly) */}
            <SectionLabel label={tr.authEmail} color={c.sub} />
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <View style={st.fieldWrap}>
                <Text style={[st.input, { color: c.sub }]} numberOfLines={1}>{user?.email}</Text>
              </View>
            </BlurView>

            {/* Name */}
            <SectionLabel label={tr.accountDisplayName} color={c.sub} />
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountDisplayName.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder={tr.authName}
                  value={name}
                  onChangeText={v => { setName(v); setNameError(''); }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
              </View>
            </BlurView>
            {nameError ? <Text style={[st.error, { color: c.red }]}>{nameError}</Text> : null}
            <TouchableOpacity
              style={[st.btn, { backgroundColor: c.accent, opacity: nameSaving ? 0.7 : 1 }]}
              activeOpacity={0.82}
              onPress={handleSaveName}
              disabled={nameSaving || !name.trim()}
            >
              {nameSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.btnText}>{tr.accountSaveName}</Text>
              )}
            </TouchableOpacity>

            {/* Change password */}
            <SectionLabel label={tr.accountChangePassword} color={c.sub} />
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountOldPassword.toUpperCase()}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={c.sub}
                    placeholder="••••••••"
                    value={oldPwd}
                    onChangeText={v => { setOldPwd(v); setPwdError(''); }}
                    secureTextEntry={!showOld}
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="next"
                  />
                  <TouchableOpacity onPress={() => setShowOld(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showOld ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authNewPassword.toUpperCase()}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={c.sub}
                    placeholder="••••••••"
                    value={newPwd}
                    onChangeText={v => { setNewPwd(v); setPwdError(''); }}
                    secureTextEntry={!showNew}
                    textContentType="newPassword"
                    returnKeyType="next"
                  />
                  <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showNew ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat.toUpperCase()}</Text>
                <View style={st.row}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={c.sub}
                    placeholder="••••••••"
                    value={repeatPwd}
                    onChangeText={v => { setRepeatPwd(v); setPwdError(''); }}
                    secureTextEntry={!showRepeat}
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleChangePassword}
                  />
                  <TouchableOpacity onPress={() => setShowRepeat(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name={showRepeat ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
            {pwdError ? <Text style={[st.error, { color: c.red }]}>{pwdError}</Text> : null}
            <TouchableOpacity
              style={[st.btn, { backgroundColor: c.accent, opacity: pwdSaving ? 0.7 : 1 }]}
              activeOpacity={0.82}
              onPress={handleChangePassword}
              disabled={pwdSaving}
            >
              {pwdSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.btnText}>{tr.accountChangePassword}</Text>
              )}
            </TouchableOpacity>

            {/* Danger zone */}
            <SectionLabel label={tr.accountDangerZone} color={c.red} />
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.red + '40' }]}>
              <TouchableOpacity
                style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                onPress={handleDeleteRequest}
                activeOpacity={0.82}
              >
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.red + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="trash.fill" size={17} color={c.red} />
                </View>
                <Text style={[st.input, { color: c.red, flex: 1 }]}>{tr.accountDeleteAccount}</Text>
                <IconSymbol name="chevron.right" size={16} color={c.red} />
              </TouchableOpacity>

              {showDeletePwd && (
                <View style={[st.fieldWrap, { borderTopColor: c.red + '30', borderTopWidth: 1 }]}>
                  <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.accountDeleteConfirmPwd.toUpperCase()}</Text>
                  <View style={st.row}>
                    <TextInput
                      autoFocus
                      style={[st.input, { color: c.text, flex: 1 }]}
                      placeholderTextColor={c.sub}
                      placeholder="••••••••"
                      value={deletePwd}
                      onChangeText={setDeletePwd}
                      secureTextEntry={!showDeletePwdText}
                      textContentType="password"
                      returnKeyType="done"
                      onSubmitEditing={handleDeleteConfirm}
                    />
                    <TouchableOpacity onPress={() => setShowDeletePwdText(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name={showDeletePwdText ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[st.btn, { backgroundColor: c.red, marginTop: 12, opacity: deleting ? 0.7 : 1 }]}
                    activeOpacity={0.82}
                    onPress={handleDeleteConfirm}
                    disabled={deleting || !deletePwd}
                  >
                    {deleting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={st.btnText}>{tr.accountDeleteAccount}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[st.sectionLabel, { color }]}>{label.toUpperCase()}</Text>
  );
}

const st = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fieldWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    paddingVertical: 2,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
