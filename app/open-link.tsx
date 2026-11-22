/**
 * app/open-link.tsx — ЄДИНИЙ споживач наміру deep link (rc1, S3-03,
 * docs/release-rc1/deeplinks.md).
 *
 * Сюди веде `app/+native-intent.tsx` (посилання кабінету `/app/**` і форми
 * реєстру сервера), `login.tsx` після входу і `DeepLinkIntentResume`
 * (app/_layout.tsx) після реєстрації. `AuthGate` пускає сюди лише з
 * workspace і сесією — гостя він сам відводить на вхід, а намір лишається в
 * store/deep-link-intent.ts.
 *
 * Що тут вирішується (utils/deepLinks.ts `decideDeepLinkAccess`):
 *  - особиста ціль → відкрити одразу;
 *  - проєкт, де людина НЕ учасник (свіжий `GET /projects/` — лише він; офлайн —
 *    кеш ∪ локальні, `memberProjectIdsFor`) →
 *    `/no-access`, нічого з цілі (назви, задачі) не показується;
 *  - учасник, але зараз в ІНШОМУ просторі проєкту → аркуш «Відкрити в
 *    просторі B?» → відкрити;
 *  - інакше → відкрити.
 * Намір без нічого (застарів / уже спожитий) → «Сьогодні».
 */
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeshBackground } from '@/components/ds';
import { fontFamily } from '@/constants/theme';
import { getScreenColors } from '@/constants/tokens';
import { dsTokens } from '@/hooks/use-ds';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { apiFetch } from '@/store/api';
import { takeDeepLinkIntent, type DeepLinkIntent } from '@/store/deep-link-intent';
import { useI18n } from '@/store/i18n';
import {
  getActiveProjectId,
  getMyProjectIds,
  getWorkspaceProjects,
  setWorkspaceProjects,
  type ProjectSummary,
} from '@/store/project-sync';
import { DEEP_LINK_FALLBACK_ROUTE, decideDeepLinkAccess, memberProjectIdsFor } from '@/utils/deepLinks';

/** Свіжий список проєктів-учасника; не вдалося (офлайн/сервер) — null, тоді рішення за кешем. */
async function fetchMemberProjects(): Promise<ProjectSummary[] | null> {
  try {
    const res = await apiFetch<{ results: ProjectSummary[] }>('/projects/');
    const list = Array.isArray(res.results) ? res.results : [];
    await setWorkspaceProjects(list);
    return list;
  } catch (e) {
    if (__DEV__) console.warn('[open-link] GET /projects/ не вдалося, рішення за кешем:', e);
    return null;
  }
}

export default function OpenLinkScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = getScreenColors('auth', isDark);
  const k = dsTokens(isDark);
  const contentWidth = useContentWidth();
  const { tr } = useI18n();
  const [confirm, setConfirm] = useState<{ intent: DeepLinkIntent; name: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const intent = await takeDeepLinkIntent();
        if (!intent) { router.replace(DEEP_LINK_FALLBACK_ROUTE as Href); return; }
        if (intent.projectId === undefined) { router.replace(intent.route as Href); return; }
        const fresh = await fetchMemberProjects();
        const members = memberProjectIdsFor(fresh ? fresh.map(p => p.id) : null, fresh ? new Set() : await getMyProjectIds());
        const decision = decideDeepLinkAccess(intent, members, getActiveProjectId());
        if (decision.action === 'no-access') { router.replace('/no-access' as Href); return; }
        if (decision.action === 'open') { router.replace(intent.route as Href); return; }
        const summary = (fresh ?? await getWorkspaceProjects()).find(p => p.id === intent.projectId);
        setConfirm({ intent, name: summary?.name || tr.projects });
      } catch (e) {
        // Сховище/мережа кинули щось несподіване — не лишаємо вічний спінер.
        if (__DEV__) console.warn('[open-link] не вдалося відкрити посилання:', e);
        router.replace(DEEP_LINK_FALLBACK_ROUTE as Href);
      }
    })();
  }, [router, tr]);

  const cancel = () => {
    if (router.canGoBack()) router.back();
    else router.replace(DEEP_LINK_FALLBACK_ROUTE as Href);
  };

  return (
    <View style={[st.root, { backgroundColor: c.bg1 }]}>
      {!isDark && <MeshBackground />}
      <View style={[st.center, contentWidth]}>
        {confirm ? (
          <View
            accessibilityViewIsModal
            style={[st.card, { backgroundColor: k.surface.card, borderColor: c.border }]}
          >
            <Text accessibilityRole="header" style={[st.title, { color: c.text, fontFamily: fontFamily.semibold }]}>
              {tr.deepLinkSwitchTitle.replace('{name}', confirm.name)}
            </Text>
            <Text style={[st.body, { color: c.sub }]}>{tr.deepLinkSwitchBody}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.replace(confirm.intent.route as Href)}
              style={[st.primary, { backgroundColor: k.action.primary }]}
            >
              <Text style={[st.primaryText, { color: k.text.onAction, fontFamily: fontFamily.semibold }]}>{tr.deepLinkSwitchConfirm}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={cancel} style={st.link}>
              <Text style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.medium }}>{tr.cancel}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={st.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={c.sub} />
            <Text style={[st.body, { color: c.sub, marginTop: 12 }]}>{tr.deepLinkOpening}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, width: '100%', alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },
  title: { fontSize: 18, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 16, textAlign: 'left' },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  loading: { alignItems: 'center' },
});
