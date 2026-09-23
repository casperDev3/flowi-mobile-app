/**
 * app/project/[id]/time.tsx — Час простору проєкту.
 *
 * Розділ вмикається `modules.time`. Записи трекера часу (`time_entries`) з
 * `projectId` цього проєкту — той самий запис, що на загальному екрані
 * «Час» (`app/(tabs)/time.tsx`), лише звужений показ і швидке ручне
 * додавання. Активний (той, що ЗАРАЗ триває) таймер лишається на екрані
 * «Час» і в глобальній панелі — тут лише ЗАВЕРШЕНІ сесії.
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { formatDuration } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';
// Форма запису — спільна з екраном «Час» (`utils/timeEntries.ts`): локальна
// копія інтерфейсу вже одного разу розійшлася з ним на полі `shift`.
import type { TimeRecord } from '@/utils/timeEntries';


export default function ProjectTimeScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  // Contract §4.1: глядач бачить записи часу проєкту, але не додає й не видаляє.
  const canEdit = useProjectRole(projectId) !== 'viewer';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const { items: entries, setItems: setEntries, reload: reloadEntries } = useSyncedList<TimeRecord>('time_entries', { enabled: true });
  // useSyncedList перечитує ключ сам лише на ЗМІНУ ззовні — початкове
  // читання (дані вже в сховищі до монтування) екран запускає явно.
  useFocusEffect(useCallback(() => { void reloadEntries(); }, [reloadEntries]));
  const [taskName, setTaskName] = useState('');
  const [minutes, setMinutes] = useState('');

  const own = useMemo(
    () => entries.filter(e => e.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, projectId],
  );
  const totalSeconds = useMemo(() => own.reduce((acc, e) => acc + (e.duration || 0), 0), [own]);

  const addEntry = () => {
    const mins = parseInt(minutes, 10);
    const title = taskName.trim();
    if (!title || !Number.isFinite(mins) || mins <= 0) return;
    // Повний ISO, а не голе 'YYYY-MM-DD' (CLAUDE.md: «в AsyncStorage — ISO
    // рядки») — той самий формат, що й дзеркало таймера, інакше «Години за
    // тиждень» на Огляді (utils/projectOverview.ts) знову бачить два різні
    // формати дати в одній колекції.
    setEntries(prev => [{ id: Date.now().toString(), task: title, duration: mins * 60, date: new Date().toISOString(), projectId }, ...prev]);
    setTaskName(''); setMinutes('');
    haptic.success();
  };

  const removeEntry = (id: string) => {
    Alert.alert(tr.deletePermanently, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => setEntries(prev => prev.filter(e => e.id !== id)) },
    ]);
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
    <ProjectScreenShell project={project} isDark={isDark} title={tr.navTime}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">

        {canEdit && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 8, marginBottom: 16 }}>
            <TextInput
              placeholder={tr.timeManualTask}
              accessibilityLabel={tr.timeManualTask}
              placeholderTextColor={c.sub}
              value={taskName}
              onChangeText={setTaskName}
              style={{ flex: 1, color: c.text, fontSize: 14, paddingVertical: 8, paddingHorizontal: 6 }}
            />
            <TextInput
              placeholder={tr.timeManualMinutes}
              accessibilityLabel={tr.timeManualMinutes}
              placeholderTextColor={c.sub}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              style={{ width: 64, color: c.text, fontSize: 14, paddingVertical: 8, textAlign: 'center' }}
            />
            <TouchableOpacity
              onPress={addEntry}
              disabled={!taskName.trim() || !minutes.trim()}
              accessibilityRole="button"
              accessibilityLabel={tr.add}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
              <IconSymbol name="plus" size={19} color={taskName.trim() && minutes.trim() ? c.accent : c.sub} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>
          {tr.overviewHoursThisWeek}: {formatDuration(totalSeconds, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute })}
        </Text>

        {own.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 30 }}>{tr.timeNoEntries}</Text>
        ) : own.map(entry => (
          <TouchableOpacity
            key={entry.id}
            onLongPress={canEdit ? () => removeEntry(entry.id) : undefined}
            delayLongPress={350}
            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{entry.task}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                {new Date(`${entry.date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>
              {formatDuration(entry.duration, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute })}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ProjectScreenShell>
  );
}
