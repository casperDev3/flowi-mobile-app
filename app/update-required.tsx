/**
 * app/update-required.tsx — «Оновіть застосунок / Встановіть новий Flowi»
 * (rc1, docs/release-rc1/compat-n1.md).
 *
 * Сюди `AuthGate` (app/_layout.tsx) веде на будь-який `426 client_outdated`
 * (store/api.ts → reportClientOutdated) і на `min_client_version.mobile` з
 * `/api/workspace/`, вищий за цю збірку (store/workspace.ts). Раніше це був
 * рядок помилки на екрані адреси workspace — людина не розуміла, що робити.
 *
 * Посилання на стор — у порядку пріоритету:
 *  1. `storeUrl` з тіла 426 / `store_urls` payload-у workspace (сервер, env
 *     FLOWI_IOS_STORE_URL / FLOWI_ANDROID_STORE_URL) — його можна змінити без
 *     нової збірки;
 *  2. `expo.extra.storeUrls.{ios,android}` з app.json;
 *  3. `EXPO_PUBLIC_FLOWI_{IOS,ANDROID}_STORE_URL` на етапі збірки.
 * Немає жодного — показуємо підказку «Знайдіть Flowi у магазині» без кнопки.
 *
 * Варіант «Встановіть новий Flowi» — коли ця збірка зібрана НЕ під новим ID
 * `app.flowi.mobile` (переїзд на нові акаунти розробника): оновлення в межах
 * старого запису стору не існує, людині треба інший застосунок.
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeshBackground } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily } from '@/constants/theme';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import {
  CLIENT_PLATFORM,
  CLIENT_VERSION,
  getWorkspaceIncompatibility,
  needsAppUpdate,
  subscribeWorkspaceIncompatibility,
  type WorkspaceIncompatibility,
} from '@/store/api-config';
import { useI18n } from '@/store/i18n';
import { refreshWorkspaceCompatibility } from '@/store/workspace';

export const NEW_APP_ID = 'app.flowi.mobile';

type StoreUrls = { ios?: string; android?: string };

/** Чиста функція — щоб тест перевіряв пріоритет джерел без рендера. */
export function resolveStoreUrl(
  incompat: WorkspaceIncompatibility | null,
  platform: 'ios' | 'android',
  extra: StoreUrls | undefined,
  env: StoreUrls,
): string | null {
  const candidates = [incompat?.storeUrl, extra?.[platform], env[platform]];
  for (const url of candidates) {
    if (typeof url === 'string' && /^https:\/\//i.test(url.trim())) return url.trim();
  }
  return null;
}

/** Збірка під старим ID (com.casper3.*) → «встановіть новий застосунок». */
export function isLegacyAppId(appId: string | undefined | null): boolean {
  return !!appId && appId !== NEW_APP_ID;
}

function currentAppId(): string | undefined {
  const cfg = Constants.expoConfig;
  return Platform.OS === 'ios' ? cfg?.ios?.bundleIdentifier : cfg?.android?.package;
}

export default function UpdateRequiredScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const c = getScreenColors('auth', isDark);
  const { tr } = useI18n();
  const router = useRouter();
  const topInset = useTopInset();
  const contentWidth = useContentWidth();

  const [incompat, setIncompat] = useState(() => getWorkspaceIncompatibility());
  const [checking, setChecking] = useState(false);
  const [stillOutdated, setStillOutdated] = useState(false);

  useEffect(() => subscribeWorkspaceIncompatibility(setIncompat), []);

  // Несумісність знято (оновились / адмін опустив мінімум) — назад у застосунок.
  useEffect(() => {
    if (!needsAppUpdate(incompat)) router.replace('/');
  }, [incompat, router]);

  const extra = (Constants.expoConfig?.extra as { storeUrls?: StoreUrls } | undefined)?.storeUrls;
  const storeUrl = resolveStoreUrl(incompat, CLIENT_PLATFORM, extra, {
    ios: process.env.EXPO_PUBLIC_FLOWI_IOS_STORE_URL,
    android: process.env.EXPO_PUBLIC_FLOWI_ANDROID_STORE_URL,
  });
  const newApp = isLegacyAppId(currentAppId());
  const minVersion = incompat?.minVersion ?? '';

  const recheck = async () => {
    setChecking(true);
    setStillOutdated(false);
    try {
      await refreshWorkspaceCompatibility();
    } finally {
      setChecking(false);
      if (needsAppUpdate(getWorkspaceIncompatibility())) setStillOutdated(true);
    }
  };

  const openStore = () => {
    if (storeUrl) void Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg1 }]}>
      {!isDark && <MeshBackground />}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, contentWidth, { width: '100%', maxWidth: 520, backgroundColor: c.cardSolid, borderColor: c.border }]}>
          <View style={[styles.icon, { backgroundColor: c.accentTint }]}>
            <IconSymbol name="arrow.down.circle" size={28} color={c.accent} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>
            {newApp ? tr.updateRequiredTitleNewApp : tr.updateRequiredTitle}
          </Text>
          <Text style={[styles.body, { color: c.sub }]}>
            {newApp
              ? tr.updateRequiredBodyNewApp
              : tr.updateRequiredBody.replace('{current}', CLIENT_VERSION).replace('{v}', minVersion || '—')}
          </Text>

          {storeUrl ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={openStore}
              style={[styles.primary, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.primaryText, { color: c.onAccent }]}>
                {Platform.OS === 'ios' ? tr.updateRequiredOpenAppStore : tr.updateRequiredOpenPlay}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.hint, { color: c.subStrong }]}>{tr.updateRequiredNoStore}</Text>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void recheck()}
            disabled={checking}
            style={[styles.secondary, { borderColor: c.border }]}
          >
            {checking ? (
              <ActivityIndicator color={c.text} />
            ) : (
              <Text style={[styles.secondaryText, { color: c.text }]}>{tr.updateRequiredRetry}</Text>
            )}
          </TouchableOpacity>
          {stillOutdated && <Text style={[styles.hint, { color: c.subStrong }]}>{tr.updateRequiredStillOutdated}</Text>}

          <TouchableOpacity accessibilityRole="link" onPress={() => router.push('/workspace?change=1')} style={styles.link}>
            <Text style={[styles.linkText, { color: c.sub }]}>{tr.updateRequiredChangeWorkspace}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 48 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 14, alignItems: 'stretch' },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 22, fontFamily: fontFamily.bold, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: fontFamily.regular },
  hint: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: fontFamily.regular },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semibold },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontFamily: fontFamily.medium },
  link: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 14, fontFamily: fontFamily.regular, textDecorationLine: 'underline' },
});
