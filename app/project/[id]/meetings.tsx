/**
 * app/project/[id]/meetings.tsx — Наради простору проєкту.
 *
 * Розділ вмикається `modules.meetings` (Налаштування проєкту). Форма —
 * та сама `MeetingFormSheet`, що на загальному екрані нарад
 * (`app/meetings.tsx`) і в старій деталі проєкту, з `presetProjectId` — нова
 * зустріч одразу належить цьому проєкту.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { MeetingFormSheet, type MeetingFormData } from '@/components/shared/MeetingFormSheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useAuth } from '@/store/auth';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { projectMeetingSections, withMeetingProject, type Meeting } from '@/utils/meetings';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

export default function ProjectMeetingsScreen() {
  const { id: projectId, open: openParam } = useLocalSearchParams<{ id: string; open?: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  // Contract §4.1: глядач лише читає — ані створити, ані редагувати, ані
  // видалити нараду проєкту.
  const role = useProjectRole(projectId);
  const canEdit = role !== 'viewer';
  const { user } = useAuth();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [form, setForm] = useState<{ initial: MeetingFormData | null } | null>(null);

  const loadAll = useCallback(async () => {
    setMeetings(await loadData<Meeting[]>('meetings', []));
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  const trackWrite = useStorageRefresh(['meetings'], loadAll);

  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');
  const sections = useMemo(
    () => (projectId ? projectMeetingSections(meetings, projectId, new Date()) : { upcoming: [], past: [] }),
    [meetings, projectId],
  );

  const openEdit = useCallback((meeting: Meeting) => {
    setForm({
      initial: {
        id: meeting.id, title: meeting.title, date: meeting.date, time: meeting.time,
        durationMinutes: meeting.durationMinutes, location: meeting.location, link: meeting.link,
        notes: meeting.notes, color: meeting.color, recurrence: meeting.recurrence, projectId: meeting.projectId,
      },
    });
  }, []);

  // Push-тап (contract §7 mentioned) або будь-який інший `?open=<id>` deep
  // link — відкриваємо аркуш редагування наради одразу, як лише вона
  // з'явиться у завантаженому списку. На відміну від тапу по рядку в списку,
  // тут БЕЗ гейта `canEdit`: контракт §4.1 дозволяє глядачу читати й
  // коментувати нараду, а не лише учаснику/власнику.
  useEffect(() => {
    if (!openParam || !loaded) return;
    const meeting = meetings.find(m => m.id === openParam);
    if (meeting) openEdit(meeting);
    router.setParams({ open: '' });
    // meetings/openEdit навмисно поза deps: реагуємо лише на прихід параметра
    // після завантаження (як `?open=` на задачах, `(tabs)/index.tsx`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, loaded, router]);

  const save = useCallback(async (data: MeetingFormData) => {
    setForm(null);
    try {
      await trackWrite(async () => {
        const fields = {
          title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
          location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
        };
        const next = await updateSynced<Meeting>('meetings', fresh => (data.id
          ? fresh.map(m => (m.id !== data.id ? m : withMeetingProject({ ...m, ...fields }, data.projectId)))
          : [...fresh, withMeetingProject<Meeting>({ id: Date.now().toString(), ...fields }, data.projectId ?? projectId)]));
        setMeetings(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[project/meetings] запис не вдався:', e);
    }
  }, [trackWrite, projectId]);

  const remove = useCallback(async () => {
    const id = form?.initial?.id;
    setForm(null);
    if (!id) return;
    try {
      await trackWrite(async () => {
        const next = await updateSynced<Meeting>('meetings', fresh => fresh.filter(m => m.id !== id));
        setMeetings(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[project/meetings] видалення не вдалося:', e);
    }
  }, [form, trackWrite]);

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  // Мінор із ревʼю: вимикач `modules.meetings` у Налаштуваннях ховає лише
  // таб/пункт сайдбару (`visibleProjectNavItems`) — користувач, який лишився
  // на розділі саме в момент вимкнення, чи прийшов сюди deep link'ом/
  // `router.push`, і далі бачив і редагував би наради вимкненого розділу.
  if (project && !modules.meetings) {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.navMeetings}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center' }}>{tr.projectModuleDisabled}</Text>
        </View>
      </ProjectScreenShell>
    );
  }

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.navMeetings}
      actions={canEdit ? (
        <TouchableOpacity
          onPress={() => setForm({ initial: null })}
          accessibilityRole="button"
          accessibilityLabel={tr.addMeeting}
          style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="plus" size={17} color={c.accent} />
        </TouchableOpacity>
      ) : undefined}>
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>
        {sections.upcoming.length === 0 && sections.past.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tr.projectMeetingsEmpty}</Text>
        ) : (
          <>
            {sections.upcoming.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8 }}>{tr.projectMeetingsNoUpcoming}</Text>
            ) : sections.upcoming.map(({ meeting, date, time }) => (
              <TouchableOpacity
                key={`${meeting.id}_${date}`}
                onPress={canEdit ? () => openEdit(meeting) : undefined}
                activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8 }}>
                <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{meeting.title}</Text>
                    {meeting.recurrence ? <IconSymbol name="repeat" size={11} color={c.sub} /> : null}
                  </View>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                    {new Date(`${date}T00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}{time ? ` · ${time}` : ''}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>
            ))}
            {sections.past.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowPast(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={tr.projectMeetingsPast.replace('{count}', String(sections.past.length))}
                  accessibilityState={{ expanded: showPast }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}>
                  <IconSymbol name={showPast ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
                    {tr.projectMeetingsPast.replace('{count}', String(sections.past.length))}
                  </Text>
                </TouchableOpacity>
                {showPast && sections.past.map(meeting => (
                  <TouchableOpacity
                    key={meeting.id}
                    onPress={canEdit ? () => openEdit(meeting) : undefined}
                    activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8, opacity: 0.6 }}>
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{meeting.title}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {new Date(`${meeting.date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}{meeting.time ? ` · ${meeting.time}` : ''}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={13} color={c.sub} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <MeetingFormSheet
        visible={!!form}
        initial={form?.initial}
        presetProjectId={project?.id}
        onClose={() => setForm(null)}
        onSave={save}
        onDelete={form?.initial?.id ? remove : undefined}
        isDark={isDark}
        lang={lang}
        tr={tr}
        currentUserId={user?.id ? String(user.id) : null}
        isProjectOwner={role === 'owner'}
      />
    </ProjectScreenShell>
  );
}
