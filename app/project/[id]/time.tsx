/**
 * app/project/[id]/time.tsx — Час простору проєкту.
 *
 * Розділ вмикається `modules.time`. Записи трекера часу (`time_entries`) цього
 * проєкту — той самий запис, що на загальному екрані «Час»
 * (`app/(tabs)/time.tsx`), лише звужений показ. Активний (той, що ЗАРАЗ
 * триває) таймер лишається на екрані «Час» і в глобальній панелі — тут лише
 * ЗАВЕРШЕНІ сесії.
 *
 * Форма запису — ТА САМА `components/time/TimeEntrySheet.tsx`, що на екрані
 * «Час», з проєктом за замовчуванням (як вебовий `project-time.tsx` бере
 * спільну `entry-form`). Раніше тут був власний рядок «назва + хвилини»:
 * записи з нього не мали ні початку, ні задачі, і правити їх було нічим.
 *
 * Аномалії виділяються так само, як на екрані «Час»: звіт рахується з УСІХ
 * записів (медіана задачі — з усіх її сесій), тож той самий запис виглядає
 * однаково в обох місцях.
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { anomalyReasonText } from '@/components/time/AnomalyPanel';
import { TimeEntrySheet } from '@/components/time/TimeEntrySheet';
import { timeColors } from '@/components/time/TimePalette';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { formatDuration } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';
import { anomalyMap, anomalySeverity, applyDuration, detectAnomalies, trimmedSeconds } from '@/utils/timeAnomalies';
// Форма запису — спільна з екраном «Час» (`utils/timeEntries.ts`): локальна
// копія інтерфейсу вже одного разу розійшлася з ним на полі `shift`.
import { recordProjectId, sortRecords, taskProjectMap, type TimeRecord } from '@/utils/timeEntries';
import type { EditableTask } from '@/utils/timeEntryEdit';

export default function ProjectTimeScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { height, isWide } = useResponsive();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  // Contract §4.1: глядач бачить записи часу проєкту, але не додає й не видаляє.
  const canEdit = useProjectRole(projectId) !== 'viewer';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');
  const sheetColors = useMemo(() => timeColors(isDark), [isDark]);

  const { items: entries, setItems: setEntries, reload: reloadEntries } = useSyncedList<TimeRecord>('time_entries', { enabled: true });
  // useSyncedList перечитує ключ сам лише на ЗМІНУ ззовні — початкове
  // читання (дані вже в сховищі до монтування) екран запускає явно.
  // Задачі — щоб записи без projectId (таймер із вебу чи старої версії)
  // потрапляли в проєкт своєї задачі, і для вибору задачі у формі.
  const { items: tasks, reload: reloadTasks } = useSyncedList<{ id: string; title?: string; projectId?: string }>('tasks', { enabled: true });
  const { items: projects, reload: reloadProjects } = useSyncedList<{ id: string; name: string; color?: string }>('projects', { enabled: true });
  const taskProjects = useMemo(() => taskProjectMap(tasks), [tasks]);
  const taskChoices = useMemo<EditableTask[]>(
    () => tasks
      .filter(t => t?.id && typeof t.title === 'string' && t.title.trim())
      .map(t => ({ id: t.id, title: t.title as string, projectId: t.projectId })),
    [tasks],
  );
  useFocusEffect(useCallback(() => {
    void reloadEntries(); void reloadTasks(); void reloadProjects();
  }, [reloadEntries, reloadTasks, reloadProjects]));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetEntry, setSheetEntry] = useState<TimeRecord | null>(null);

  const own = useMemo(
    () => sortRecords(entries.filter(e => recordProjectId(e, taskProjects) === projectId), 'date-desc'),
    [entries, projectId, taskProjects],
  );
  const totalSeconds = useMemo(() => own.reduce((acc, e) => acc + (e.duration || 0), 0), [own]);
  const rowAnomalies = useMemo(() => anomalyMap(detectAnomalies(entries, taskProjects)), [entries, taskProjects]);

  const units = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtDur = useCallback((seconds: number) => formatDuration(seconds, units), [units]);

  const openEntry = (entry: TimeRecord | null) => {
    if (!canEdit) return;
    haptic.light();
    setSheetEntry(entry);
    setSheetOpen(true);
  };

  const upsertEntry = (entry: TimeRecord) => {
    setEntries(prev => {
      const index = prev.findIndex(e => e.id === entry.id);
      if (index < 0) return [entry, ...prev];
      const next = [...prev];
      next[index] = entry;
      return next;
    });
    haptic.success();
  };

  const trimEntry = (entry: TimeRecord, seconds: number) => {
    haptic.medium();
    const patch = applyDuration(entry, seconds);
    setEntries(prev => prev.map(e => (e.id === entry.id ? { ...e, ...patch } : e)));
  };

  const removeEntry = (id: string) => {
    Alert.alert(tr.deletePermanently, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => setEntries(prev => prev.filter(e => e.id !== id)) },
    ]);
  };

  const formatWhen = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  // Мінор із ревʼю: вимикач `modules.time` у Налаштуваннях ховає лише
  // таб/пункт сайдбару — deep link/`router.push` чи «залишився на екрані під
  // час вимкнення» інакше й далі відкривали б цей розділ.
  if (project && !modules.time) {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.navTime}>
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
      title={tr.navTime}
      actions={canEdit ? (
        <HeaderButton
          onPress={() => openEntry(null)}
          accessibilityLabel={tr.timeAddEntry}
          style={{ backgroundColor: c.accent + '20', borderColor: c.accent }}>
          <IconSymbol name="plus" size={17} color={c.accent} />
        </HeaderButton>
      ) : undefined}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 4 }}>
          {tr.totalLabel}: {fmtDur(totalSeconds)}
        </Text>

        {own.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 30 }}>{tr.timeNoEntries}</Text>
        ) : own.map(entry => {
          const anomaly = rowAnomalies.get(entry.id);
          const severity = anomalySeverity(anomaly?.kinds ?? []);
          const flag = severity === 'red' ? sheetColors.danger : severity === 'amber' ? sheetColors.warn : null;
          const reason = anomaly && severity
            ? anomalyReasonText(entry, anomaly.kinds, anomaly.typicalSeconds, tr, lang, fmtDur)
            : null;
          const trim = severity && canEdit ? trimmedSeconds(entry) : null;
          const title = entry.task || tr.untitled;
          const duration = fmtDur(entry.duration);
          return (
            <TouchableOpacity
              key={entry.id}
              // Тап — правка, як на екрані «Час»; довге натискання — видалення.
              onPress={canEdit ? () => openEntry(entry) : undefined}
              onLongPress={canEdit ? () => removeEntry(entry.id) : undefined}
              delayLongPress={350}
              disabled={!canEdit}
              accessibilityRole={canEdit ? 'button' : undefined}
              accessibilityLabel={`${title}, ${duration}.${reason ? ` ${tr.timeRowAnomalyA11y.replace('{kinds}', reason)}.` : ''}${canEdit ? ` ${tr.edit}` : ''}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: flag ? flag + '88' : c.border,
                backgroundColor: flag ? flag + '12' : 'transparent',
                padding: 12,
                marginBottom: 8,
                overflow: 'hidden',
              }}>
              {flag && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: flag }} />}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {flag && <IconSymbol name="exclamationmark.triangle.fill" size={12} color={flag} style={{ marginRight: 5 }} />}
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>{title}</Text>
                </View>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                  {formatWhen(entry.date)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </Text>
                {reason ? (
                  <Text numberOfLines={2} style={{ color: c.text, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{reason}</Text>
                ) : null}
                {trim !== null && (
                  <TouchableOpacity
                    onPress={() => trimEntry(entry, trim)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tr.anomalyTrimTo.replace('{duration}', fmtDur(trim))}: ${title}`}
                    style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, borderColor: c.border, paddingHorizontal: 9, paddingVertical: 6, marginTop: 7 }}>
                    <IconSymbol name="arrow.down.trend" size={11} color={c.accent} />
                    <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>
                      {tr.anomalyTrimTo.replace('{duration}', fmtDur(trim))}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700', marginLeft: 10 }}>{duration}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TimeEntrySheet
        visible={sheetOpen}
        entry={sheetEntry}
        c={sheetColors}
        isDark={isDark}
        height={height}
        isWide={isWide}
        tr={tr}
        tasks={taskChoices}
        projects={projects}
        taskProjects={taskProjects}
        defaultProjectId={projectId}
        onClose={() => { setSheetOpen(false); setSheetEntry(null); }}
        onSubmit={upsertEntry}
      />
    </ProjectScreenShell>
  );
}
