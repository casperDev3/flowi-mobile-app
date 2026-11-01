/**
 * app/project/[id]/activity.tsx — Стрічка активності проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.6).
 *
 * Не окремий розділ проєкту (`constants/projectNav.ts`) — досяжний з Огляду
 * (картка «Активність», останні кілька записів + «Уся активність») і з
 * «Налаштування → Активність», тому й зареєстрований у `_layout.tsx`
 * прихованим табом (`href: null`), як і `members.tsx`.
 *
 * Не синкається (contract §4.6): звичайний REST-список з пагінацією
 * `before`, без локального кешу — застарілий список активності вводив би в
 * оману більше, ніж коротка мить завантаження.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { OfflineError } from '@/store/api';
import { fetchProjectActivity, type ActivityEntry } from '@/store/project-activity';
import { activityIcon, formatActivityMessage, mergeConsecutiveActivity } from '@/utils/projectActivity';
import { useActivityContext } from '@/hooks/use-activity-context';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { fontFamily, radius, type } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';
import { BentoCard } from '@/components/ds';

export default function ProjectActivityScreen() {
  const projectId = useProjectRouteId();
  const activityCtx = useActivityContext(projectId);
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);
  const tk = dsTokens(isDark);

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setOffline(false);
    setError(false);
    try {
      const page = await fetchProjectActivity(projectId);
      setEntries(page.results);
      setNextBefore(page.next_before);
    } catch (e) {
      if (e instanceof OfflineError) setOffline(true);
      else setError(true);
      if (__DEV__) console.warn('[project/activity] завантаження не вдалося:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const loadMore = useCallback(async () => {
    if (!projectId || nextBefore == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchProjectActivity(projectId, { before: nextBefore });
      setEntries(prev => [...prev, ...page.results]);
      setNextBefore(page.next_before);
    } catch (e) {
      if (__DEV__) console.warn('[project/activity] довантаження не вдалося:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, nextBefore, loadingMore]);

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.projectActivityTitle}
      // «Назад» — у проп back: ScreenHeader сам сховає стрілку на планшеті, де
      // оболонка вже малює крихти «Проєкт → …» (ScreenHeaderNav.ts).
      back={{
        onPress: () => router.back(),
        label: tr.back,
        color: c.text,
        style: { backgroundColor: glassOf(tk).surface, borderColor: 'transparent' },
      }}>
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.sub} style={{ marginTop: 40 }} />
        ) : offline ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tk.surface.card, borderRadius: radius.cardCompact, padding: 14, marginTop: 8 }}>
            <IconSymbol name="exclamationmark.circle" size={14} color={c.sub} />
            <Text style={[type.caption, { color: c.sub, marginLeft: 6, flex: 1 }]}>{tr.projectMembersOfflineHint}</Text>
          </View>
        ) : error ? (
          <Text style={[type.body, { color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }]}>{tr.projectActivityError}</Text>
        ) : entries.length === 0 ? (
          <Text style={[type.body, { color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }]}>{tr.projectActivityEmpty}</Text>
        ) : (
          <>
            {/* Omni: стрічка — на одній суцільній картці, події — вертикальна
                шкала з круглими icon-chip, з'єднаними тонкою лінією. */}
            <BentoCard style={{ marginTop: 4, marginBottom: 14 }}>
            {mergeConsecutiveActivity(entries).map((entry, index, list) => (
              <View key={entry.id} style={{ flexDirection: 'row', gap: 12, paddingBottom: index < list.length - 1 ? 16 : 0 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: tk.surface.subtle,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconSymbol name={activityIcon(entry)} size={14} color={c.text} />
                  </View>
                  {index < list.length - 1 ? (
                    <View style={{ flex: 1, width: 1.5, marginTop: 4, marginBottom: -12, backgroundColor: tk.border.hairline }} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: c.text, fontSize: 13, lineHeight: 18 }]}>{formatActivityMessage(entry, tr, activityCtx)}</Text>
                  <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                    {new Date(entry.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {' · '}
                    {new Date(entry.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
            </BentoCard>
            {nextBefore != null ? (
              <TouchableOpacity
                onPress={loadMore}
                disabled={loadingMore}
                style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'center', minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: tk.surface.subtle, marginTop: 4 }}>
                {loadingMore ? (
                  <ActivityIndicator color={c.sub} />
                ) : (
                  <Text style={{ color: tk.action.secondaryText, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.projectActivityLoadMore}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}
