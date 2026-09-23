/**
 * app/project/[id]/sprints.tsx — Спринти простору проєкту.
 *
 * Розділ вмикається `modules.sprints`. Уся арифметика (порядок, прогрес,
 * куди переносити незакінчене) — з `utils/sprintUtils.ts`, тим самим
 * дзеркалом веб-логіки, що й раніше в інлайн-деталі `app/projects.tsx`.
 *
 * Дати спринта (необовʼязкові, обидві або жодної), burndown відкритого
 * датованого спринта й таблиця велосіті — за docs/specs/projects-analytics.md
 * §8.4; формули — utils/projectStatsMetrics.ts, екран лише малює.
 *
 * Призначення завдання конкретному спринту (поле «Спринт») лишається на
 * повному редакторі завдання (екран «Завдання») — тут керування самими
 * спринтами (створення/перейменування/закриття) і швидке додавання нового
 * завдання просто в цей спринт.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { SprintBurndown } from '@/components/projects/SprintBurndown';
import { SprintVelocity } from '@/components/projects/SprintVelocity';
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
  assignTaskToSprint, createSprint, isSprintClosed, isSprintDated, moveOpenSprintTasks, overlappingSprints,
  parseSprintDatesInput, renameSprint, setSprintClosed, setSprintDates, sortSprints, sprintDateInput,
  sprintMoveTargets, sprintProgress, sprintTasks, sprintsForProject,
  type Sprint, type SprintDatesError,
} from '@/utils/sprintUtils';
import { isSprintOverdue, sprintBurndown, velocityWindow } from '@/utils/projectStatsMetrics';

/** Протермінований спринт — бурштиновий: червоний зайнятий простроченими задачами. */
const SPRINT_OVERDUE_COLOR = '#F59E0B';
const TABLET_MIN_WIDTH = 600;

export default function ProjectSprintsScreen() {
  // `?sprint=<id>` — тап по сповіщенню sprint.started / sprint.closed.
  const { id: projectId, sprint: sprintParam } = useLocalSearchParams<{ id: string; sprint?: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { width } = useWindowDimensions();
  // Burndown розгорнутий за замовчуванням на планшеті, згорнутий на телефоні.
  const burndownDefaultOpen = width >= TABLET_MIN_WIDTH;
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
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [draftError, setDraftError] = useState<SprintDatesError | null>(null);
  const [burndownOpen, setBurndownOpen] = useState<Record<string, boolean>>({});
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [addToId, setAddToId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');

  const projectSprints = useMemo(
    () => (projectId ? sprintsForProject(allSprints, projectId) : []),
    [allSprints, projectId],
  );

  // `?sprint=<id>`: розгортаємо картку спринту й прокручуємо до неї, щойно
  // вона з'явилась у списку та отримала позицію. Параметр скидаємо, щоб
  // повернення на екран не стрибало вдруге.
  const scrollRef = useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const rowY = useRef<Record<string, number>>({});
  const [focusSprintId, setFocusSprintId] = useState<string | null>(null);
  useEffect(() => {
    if (!sprintParam) return;
    const id = String(sprintParam);
    if (!projectSprints.some(sp => sp.id === id)) return;
    setExpanded(prev => ({ ...prev, [id]: true }));
    setFocusSprintId(id);
    router.setParams({ sprint: '' });
  }, [sprintParam, projectSprints, router]);
  // Картка вже мала позицію (відкритий спринт не змінює розміру) — onLayout
  // вдруге не прийде, тож прокручуємо за вже відомою позицією.
  useEffect(() => {
    if (!focusSprintId) return;
    const y = rowY.current[focusSprintId];
    if (y === undefined) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      setFocusSprintId(null);
    }, 50);
    return () => clearTimeout(t);
  }, [focusSprintId]);
  const onRowLayout = useCallback((id: string, y: number) => {
    rowY.current[id] = y;
    if (focusSprintId === id) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      setFocusSprintId(null);
    }
  }, [focusSprintId]);

  // «Зараз» стабільне в межах хвилини: burndown і «протерміновано» не
  // перераховуються на кожен рендер (специфікація §9.2 п.5).
  const minute = Math.floor(Date.now() / 60_000);
  const now = useMemo(() => new Date(minute * 60_000), [minute]);

  const velocity = useMemo(
    () => (projectId ? velocityWindow(projectSprints, tasks, { projectId }) : null),
    [projectSprints, tasks, projectId],
  );
  const hasClosed = projectSprints.some(isSprintClosed);

  const resetDraft = () => {
    setDraft(null); setDraftName(''); setDraftStart(''); setDraftEnd(''); setDraftError(null);
  };
  const openCreate = () => {
    setDraft({ sprint: null }); setDraftName(''); setDraftStart(''); setDraftEnd(''); setDraftError(null);
  };
  const openRename = (sprint: Sprint) => {
    setDraft({ sprint });
    setDraftName(sprint.name);
    // Поля форми — ЛОКАЛЬНА доба ISO-дати, а не slice(0, 10): той дав би добу за UTC.
    setDraftStart(isSprintDated(sprint) ? sprintDateInput(sprint.startDate) : '');
    setDraftEnd(isSprintDated(sprint) ? sprintDateInput(sprint.endDate) : '');
    setDraftError(null);
  };

  const parsedDraftDates = parseSprintDatesInput(draftStart, draftEnd);
  // Перетин НЕ блокує збереження — лише попереджає (§3.1).
  const draftOverlap = draft && projectId && parsedDraftDates.ok && parsedDraftDates.dates
    ? overlappingSprints(projectSprints, projectId, parsedDraftDates.dates, draft.sprint?.id)
    : [];

  const saveDraft = () => {
    const name = draftName.trim();
    if (!name || !draft) return;
    const parsed = parseSprintDatesInput(draftStart, draftEnd);
    if (!parsed.ok) {
      setDraftError(parsed.error);
      haptic.error();
      return;
    }
    // Правка йде ПОВЕРХ наявного запису ({ ...sprint, … }), а не перезбирає
    // обʼєкт із полів форми: інакше невідомі цьому клієнту поля зникли б.
    if (draft.sprint) {
      const id = draft.sprint.id;
      setSprints(prev => prev.map(s => (s.id === id ? setSprintDates(renameSprint(s, name), parsed.dates) : s)));
    } else if (projectId) {
      setSprints(prev => [...prev, setSprintDates(createSprint(projectId, name), parsed.dates)]);
    }
    resetDraft();
    haptic.success();
  };

  const dateErrorText = (error: SprintDatesError) =>
    error === 'partial' ? tr.sprintDatesPartial : error === 'order' ? tr.sprintDatesOrder : tr.sprintDatesInvalid;

  const shortDate = (iso: string | undefined) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';

  const inputStyle = { borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 8, color: c.text } as const;

  /** Спільна форма: назва + дати «з»/«по» + помилка/попередження. */
  const renderDraftForm = (submitLabel: string) => (
    <>
      <TextInput
        autoFocus
        value={draftName}
        onChangeText={setDraftName}
        onSubmitEditing={saveDraft}
        placeholder={tr.sprintNamePlaceholder}
        accessibilityLabel={tr.sprintNamePlaceholder}
        placeholderTextColor={c.sub}
        style={inputStyle}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={draftStart}
          onChangeText={text => { setDraftStart(text); setDraftError(null); }}
          placeholder={tr.sprintStartDate}
          accessibilityLabel={tr.sprintStartDate}
          placeholderTextColor={c.sub}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          style={[inputStyle, { flex: 1, fontSize: 13 }]}
        />
        <TextInput
          value={draftEnd}
          onChangeText={text => { setDraftEnd(text); setDraftError(null); }}
          placeholder={tr.sprintEndDate}
          accessibilityLabel={tr.sprintEndDate}
          placeholderTextColor={c.sub}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          style={[inputStyle, { flex: 1, fontSize: 13 }]}
        />
      </View>
      {draftError ? (
        <Text accessibilityRole="alert" style={{ color: '#EF4444', fontSize: 12 }}>{dateErrorText(draftError)}</Text>
      ) : draftOverlap.length ? (
        <Text style={{ color: SPRINT_OVERDUE_COLOR, fontSize: 12 }}>
          {tr.sprintDatesOverlap.replace('{names}', draftOverlap.map(s => s.name).join(', '))}
        </Text>
      ) : (
        <Text style={{ color: c.sub, fontSize: 11 }}>{tr.sprintDatesHint}</Text>
      )}
      <TouchableOpacity onPress={saveDraft} style={{ backgroundColor: c.accent, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{submitLabel}</Text>
      </TouchableOpacity>
    </>
  );

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
    const dated = isSprintDated(sprint);
    const overdue = isSprintOverdue(sprint, now);
    const showBurndown = !closed && dated && (burndownOpen[sprint.id] ?? burndownDefaultOpen);
    // Рахується ЛИШЕ для розгорнутого спринта (§9.2 п.6).
    const burndown = showBurndown ? sprintBurndown(sprint, tasks, now) : null;
    return (
      <View
        key={sprint.id}
        onLayout={e => onRowLayout(sprint.id, e.nativeEvent.layout.y)}
        style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 10 }}>
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

        {/* Підпис дат: «12 вер – 26 вер» або «без дат»; протермінований —
            бурштинова мітка. Спринт лишається відкритим: автозакриття немає. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 20 }}>
          <Text style={{ color: c.sub, fontSize: 11 }}>
            {dated ? `${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}` : tr.sprintUndated}
          </Text>
          {overdue ? (
            <View style={{ borderRadius: 6, borderWidth: 1, borderColor: SPRINT_OVERDUE_COLOR, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: SPRINT_OVERDUE_COLOR, fontSize: 10, fontWeight: '700' }}>{tr.sprintOverdue}</Text>
            </View>
          ) : null}
          {!closed && dated ? (
            <TouchableOpacity
              onPress={() => setBurndownOpen(prev => ({ ...prev, [sprint.id]: !showBurndown }))}
              accessibilityRole="button"
              accessibilityLabel={showBurndown ? tr.burndownHide : tr.burndownShow}
              accessibilityState={{ expanded: showBurndown }}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconSymbol name={showBurndown ? 'chevron.up' : 'chevron.down'} size={10} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{tr.burndownTitle}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {burndown ? (
          <SprintBurndown burndown={burndown} color={project?.color ?? c.accent} palette={{ text: c.text, sub: c.sub, border: c.border }} />
        ) : null}

        {draft?.sprint?.id === sprint.id && (
          <View style={{ marginTop: 10, gap: 8 }}>
            {renderDraftForm(tr.save)}
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
            {!closed && !dated ? (
              // Відкритий недатований — явним рядком, чому немає burndown (§3.3).
              <Text style={{ color: c.sub, fontSize: 11, opacity: 0.8 }}>{tr.sprintNotDated}</Text>
            ) : null}
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
                    accessibilityLabel={tr.sprintAddTaskIn.replace('{name}', sprint.name)}
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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">
        {draft && !draft.sprint && (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.accent, backgroundColor: c.dim, padding: 12, marginBottom: 12, gap: 8 }}>
            {renderDraftForm(tr.create)}
          </View>
        )}
        {projectSprints.length === 0 && !draft ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 30 }}>{tr.sprintNoSprintsHint}</Text>
        ) : sortSprints(projectSprints).map(renderSprintRow)}

        {/* Велосіті — внизу, під закритими спринтами (§8.4). */}
        {velocity && hasClosed ? (
          <SprintVelocity velocity={velocity} locale={locale} palette={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }} />
        ) : null}
      </ScrollView>
    </ProjectScreenShell>
  );
}
