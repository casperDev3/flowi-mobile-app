/**
 * app/project/[id]/sprints.tsx — Спринти простору проєкту.
 *
 * Розділ вмикається `modules.sprints`. Уся арифметика (порядок, прогрес,
 * куди переносити незакінчене) — з `utils/sprintUtils.ts`, тим самим
 * дзеркалом веб-логіки, що й раніше в інлайн-деталі `app/projects.tsx`.
 *
 * Призначення завдання конкретному спринту (поле «Спринт») лишається на
 * повному редакторі завдання (екран «Завдання») — тут керування самими
 * спринтами (створення/перейменування/закриття) і швидке додавання нового
 * завдання просто в цей спринт.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { haptic } from '@/utils/haptics';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';
import { priorityFields, DEFAULT_PRIORITY_LEVEL, type Task } from '@/utils/taskUtils';
import {
  assignTaskToSprint, createSprint, isSprintClosed, moveOpenSprintTasks, renameSprint,
  setSprintClosed, sortSprints, sprintMoveTargets, sprintProgress, sprintTasks, sprintsForProject,
  type Sprint,
} from '@/utils/sprintUtils';

export default function ProjectSprintsScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr } = useI18n();
  const { project } = useProject(projectId);
  // Contract §4.1: спринти — командний CRUD (owner/member), глядач лише читає.
  const canEdit = useProjectRole(projectId) !== 'viewer';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const { items: allSprints, setItems: setSprints, reload: reloadSprints } = useSyncedList<Sprint>('sprints', { enabled: true });
  const [tasks, setTasks] = useState<Task[]>([]);
  const loadTasks = useCallback(async () => setTasks(await loadData<Task[]>('tasks', [])), []);
  // useSyncedList сам перечитує ключ на ЗМІНУ ззовні, але не на першому
  // монтуванні (тут дані вже лежать у сховищі, і жодної «зміни» не
  // станеться) — початкове читання екран запускає сам, як і решта користувачів хука.
  useFocusEffect(useCallback(() => { void loadTasks(); void reloadSprints(); }, [loadTasks, reloadSprints]));
  const trackTaskWrite = useStorageRefresh(['tasks'], loadTasks);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<{ sprint: Sprint | null } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [addToId, setAddToId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');

  const projectSprints = useMemo(
    () => (projectId ? sprintsForProject(allSprints, projectId) : []),
    [allSprints, projectId],
  );

  const openCreate = () => { setDraft({ sprint: null }); setDraftName(''); };
  const openRename = (sprint: Sprint) => { setDraft({ sprint }); setDraftName(sprint.name); };

  const saveDraft = () => {
    const name = draftName.trim();
    if (!name || !draft) return;
    if (draft.sprint) {
      setSprints(prev => prev.map(s => (s.id === draft.sprint!.id ? renameSprint(s, name) : s)));
    } else if (projectId) {
      setSprints(prev => [...prev, createSprint(projectId, name)]);
    }
    setDraft(null); setDraftName('');
    haptic.success();
  };

  const reopen = (sprint: Sprint) => {
    setSprints(prev => prev.map(s => (s.id === sprint.id ? setSprintClosed(s, false) : s)));
    haptic.light();
  };

  const closeSprint = useCallback(async (sprint: Sprint, target: Sprint | null) => {
    try {
      await trackTaskWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => moveOpenSprintTasks(fresh, sprint.id, target));
        setTasks(updated);
      });
      setSprints(prev => prev.map(s => (s.id === sprint.id ? setSprintClosed(s, true) : s)));
      setClosing(null);
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/sprints] закриття не вдалося:', e);
    }
  }, [trackTaskWrite, setSprints]);

  const addTask = useCallback(async (sprint: Sprint) => {
    const title = addTitle.trim();
    if (!title) return;
    try {
      await trackTaskWrite(async () => {
        const base: Task = {
          id: Date.now().toString(),
          title,
          status: 'active',
          ...priorityFields(DEFAULT_PRIORITY_LEVEL),
          createdAt: new Date().toISOString(),
          subtasks: [],
        };
        const updated = await updateSynced<Task>('tasks', fresh => [assignTaskToSprint(base, sprint), ...fresh]);
        setTasks(updated);
      });
      setAddTitle(''); setAddToId(null);
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/sprints] додавання не вдалося:', e);
    }
  }, [addTitle, trackTaskWrite]);

  const openTask = (task: Task) => router.push({ pathname: '/(tabs)', params: { open: task.id } } as never);

  const renderSprintRow = (sprint: Sprint) => {
    const closed = isSprintClosed(sprint);
    const open = expanded[sprint.id] ?? !closed;
    const own = sprintTasks(tasks, sprint.id);
    const progress = sprintProgress(tasks, sprint.id);
    return (
      <View key={sprint.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 10 }}>
        {/* Звичайний View, а не TouchableOpacity: пенал/закриття — окремі
            дотикові цілі, і вкладені TouchableOpacity в RN ненадійно
            передають дотик у дочірні — рядок і кнопки мають бути сиблінгами. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setExpanded(prev => ({ ...prev, [sprint.id]: !open }))}
            accessibilityRole="button"
            accessibilityLabel={sprint.name}
            accessibilityState={{ expanded: open }}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
            <IconSymbol name={closed ? 'checkmark.circle' : 'flag'} size={14} color={closed ? c.sub : (project?.color ?? c.accent)} />
            <Text numberOfLines={1} style={{ flex: 1, color: closed ? c.sub : c.text, fontSize: 14, fontWeight: '700' }}>{sprint.name}</Text>
            <Text style={{ color: c.sub, fontSize: 11 }}>{progress.done}/{progress.total}</Text>
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity
              onPress={() => openRename(sprint)}
              accessibilityRole="button"
              accessibilityLabel={tr.sprintRename}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
              <IconSymbol name="pencil" size={14} color={c.sub} />
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              onPress={() => (closed ? reopen(sprint) : setClosing(prev => (prev?.id === sprint.id ? null : sprint)))}
              accessibilityRole="button"
              accessibilityLabel={closed ? tr.sprintReopen : tr.sprintClose}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
              <IconSymbol name={closed ? 'arrow.uturn.backward' : 'flag.fill'} size={14} color={c.sub} />
            </TouchableOpacity>
          )}
        </View>

        {draft?.sprint?.id === sprint.id && (
          <View style={{ marginTop: 10, gap: 8 }}>
            <TextInput
              autoFocus
              value={draftName}
              onChangeText={setDraftName}
              onSubmitEditing={saveDraft}
              placeholder={tr.sprintNamePlaceholder}
              placeholderTextColor={c.sub}
              style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 8, color: c.text }}
            />
            <TouchableOpacity onPress={saveDraft} style={{ backgroundColor: c.accent, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
            </TouchableOpacity>
          </View>
        )}

        {closing?.id === sprint.id && (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: c.sub, fontSize: 12 }}>{tr.sprintMoveHint}</Text>
            {sprintMoveTargets(projectSprints, sprint).map(target => (
              <TouchableOpacity key={target.id} onPress={() => closeSprint(sprint, target)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <IconSymbol name="flag" size={13} color={c.accent} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{target.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => closeSprint(sprint, null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <IconSymbol name="tray" size={13} color={c.sub} />
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{tr.sprintMoveToBacklog}</Text>
            </TouchableOpacity>
          </View>
        )}

        {open && (
          <View style={{ marginTop: 10, gap: 6 }}>
            {own.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 12, opacity: 0.7 }}>{tr.sprintEmpty}</Text>
            ) : own.map(task => (
              <TouchableOpacity key={task.id} onPress={() => openTask(task)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: task.status === 'done' ? '#10B981' : c.sub }} />
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</Text>
              </TouchableOpacity>
            ))}
            {!closed && canEdit && (
              addToId === sprint.id ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <TextInput
                    autoFocus
                    value={addTitle}
                    onChangeText={setAddTitle}
                    onSubmitEditing={() => addTask(sprint)}
                    placeholder={tr.sprintAddTaskIn.replace('{name}', sprint.name)}
                    placeholderTextColor={c.sub}
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 7, color: c.text, fontSize: 13 }}
                  />
                  <TouchableOpacity onPress={() => addTask(sprint)} accessibilityRole="button" accessibilityLabel={tr.sprintAddTaskA11y}>
                    <IconSymbol name="plus" size={17} color={c.accent} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setAddToId(sprint.id); setAddTitle(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.sprintAddTaskA11y}: ${sprint.name}`}
                  accessibilityState={{ expanded: false }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <IconSymbol name="plus" size={13} color={c.accent} />
                  <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{tr.projectAddTask}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    );
  };

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  // Мінор із ревʼю: вимикач `modules.sprints` у Налаштуваннях ховає лише
  // таб/пункт сайдбару — deep link/`router.push` чи «залишився на екрані під
  // час вимкнення» інакше й далі відкривали б цей розділ.
  if (project && !modules.sprints) {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.sprints}>
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
      title={tr.sprints}
      actions={canEdit ? (
        <TouchableOpacity
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel={tr.sprintNew}
          style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="plus" size={17} color={c.accent} />
        </TouchableOpacity>
      ) : undefined}>
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>
        {draft && !draft.sprint && (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.accent, backgroundColor: c.dim, padding: 12, marginBottom: 12, gap: 8 }}>
            <TextInput
              autoFocus
              value={draftName}
              onChangeText={setDraftName}
              onSubmitEditing={saveDraft}
              placeholder={tr.sprintNamePlaceholder}
              placeholderTextColor={c.sub}
              style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 8, color: c.text }}
            />
            <TouchableOpacity onPress={saveDraft} style={{ backgroundColor: c.accent, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.create}</Text>
            </TouchableOpacity>
          </View>
        )}
        {projectSprints.length === 0 && !draft ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 30 }}>{tr.sprintNoSprintsHint}</Text>
        ) : sortSprints(projectSprints).map(renderSprintRow)}
      </ScrollView>
    </ProjectScreenShell>
  );
}
