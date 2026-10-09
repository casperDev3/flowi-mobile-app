import { Atlas } from '@/constants/atlas';
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
 * Призначення завдання конкретному спринту (поле «Спринт») лишається в
 * картці завдання — тут керування самими спринтами (створення/
 * перейменування/закриття/архів) і швидке додавання нового завдання просто
 * в цей спринт. Тап по задачі відкриває ПОВНУ картку тут же, аркушем
 * (ProjectTaskSheet), — без переходу в «Завдання» чи в особисте.
 *
 * Список: усі спринти ЗГОРНУТІ за замовчуванням (розгорнуте запамʼятовується
 * до кінця сесії), сортування (новіші/старіші за початком, назва,
 * статус+прогрес) і фільтр за станом (заплановані/активні/завершені).
 * Архівні (`archivedAt`) приховані, доки не ввімкнути «Показати архівні».
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectTaskSheet } from '@/components/projects/ProjectTaskSheet';
import { ActionButton, ActionChip, IconAction } from '@/components/shared/ActionBar';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { TasksHeaderMenu, TasksMenuButton, type TasksMenuItem } from '@/components/tasks/TasksHeaderMenu';
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
  assignTaskToSprint, createSprint, filterSortSprints, isSprintArchived, isSprintClosed, isSprintDated,
  moveOpenSprintTasks, overlappingSprints, parseSprintDatesInput, renameSprint, setSprintArchived, setSprintClosed,
  setSprintDates, sprintDateInput, sprintMoveTargets, sprintProgress, sprintStatus, sprintTasks, sprintsForProject,
  type Sprint, type SprintDatesError, type SprintSort, type SprintStatusFilter,
} from '@/utils/sprintUtils';
import { isSprintOverdue, sprintBurndown, velocityWindow } from '@/utils/projectStatsMetrics';

/** Протермінований спринт — бурштиновий: червоний зайнятий простроченими задачами. */
const SPRINT_OVERDUE_COLOR = '#F59E0B';
const TABLET_MIN_WIDTH = 600;

/**
 * Вигляд списку на сесію: розгорнуті спринти, сортування, фільтр. Модульна
 * мапа, а не стан екрана — таб проєкту перемонтовується при поверненні, і
 * людина не мусить знову розгортати той самий спринт. Між запусками
 * застосунку не зберігається: за замовчуванням усе згорнуто.
 */
interface SprintListView {
  expanded: Record<string, boolean>;
  sort: SprintSort;
  status: SprintStatusFilter;
  showArchived: boolean;
}
const DEFAULT_VIEW: SprintListView = { expanded: {}, sort: 'start-desc', status: 'all', showArchived: false };
const sessionViews = new Map<string, SprintListView>();
/** Для тестів: скинути запамʼятований вигляд. */
export function resetSprintListViews() { sessionViews.clear(); }

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
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);

  const { items: allSprints, setItems: setSprints, reload: reloadSprints } = useSyncedList<Sprint>('sprints', { enabled: true });
  const [tasks, setTasks] = useState<Task[]>([]);
  const loadTasks = useCallback(async () => setTasks(await loadData<Task[]>('tasks', [])), []);
  // useSyncedList сам перечитує ключ на ЗМІНУ ззовні, але не на першому
  // монтуванні (тут дані вже лежать у сховищі, і жодної «зміни» не
  // станеться) — початкове читання екран запускає сам, як і решта користувачів хука.
  useFocusEffect(useCallback(() => { void loadTasks(); void reloadSprints(); }, [loadTasks, reloadSprints]));
  const trackTaskWrite = useStorageRefresh(['tasks'], loadTasks);

  const [view, setView] = useState<SprintListView>(() => sessionViews.get(String(projectId)) ?? DEFAULT_VIEW);
  useEffect(() => { if (projectId) sessionViews.set(String(projectId), view); }, [projectId, view]);
  const { expanded, sort, status: statusFilter, showArchived } = view;
  const setExpanded = useCallback((patch: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    setView(prev => ({ ...prev, expanded: patch(prev.expanded) }));
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
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
    // Архівний спринт зі сповіщення має бути видно: вмикаємо показ архіву.
    const target = projectSprints.find(sp => sp.id === id);
    setView(prev => ({
      ...prev,
      expanded: { ...prev.expanded, [id]: true },
      status: 'all',
      showArchived: prev.showArchived || (!!target && isSprintArchived(target)),
    }));
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
  const archivedCount = projectSprints.filter(isSprintArchived).length;
  const visibleSprints = useMemo(
    () => filterSortSprints(projectSprints, tasks, { sort, status: statusFilter, showArchived, now }),
    [projectSprints, tasks, sort, statusFilter, showArchived, now],
  );
  /** Лічильники чипів — серед неархівних (або всіх, коли архів показано). */
  const statusCounts = useMemo(() => {
    const pool = showArchived ? projectSprints : projectSprints.filter(sp => !isSprintArchived(sp));
    const counts = { all: pool.length, planned: 0, active: 0, completed: 0 };
    for (const sp of pool) counts[sprintStatus(sp, now)] += 1;
    return counts;
  }, [projectSprints, showArchived, now]);
  const filtersActive = statusFilter !== 'all' || showArchived || sort !== 'start-desc';

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

  const inputStyle = { borderRadius: Atlas.radius.medium, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 8, color: c.text } as const;

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
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <ActionButton label={tr.cancel} tone="neutral" onPress={resetDraft} colors={c} />
        <ActionButton label={submitLabel} tone="primary" onPress={saveDraft} colors={c} />
      </View>
    </>
  );

  const toggleArchived = (sprint: Sprint) => {
    const archived = isSprintArchived(sprint);
    setSprints(prev => prev.map(s => (s.id === sprint.id ? setSprintArchived(s, !archived) : s)));
    haptic.light();
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

  // Картка задачі — ТУТ, аркушем поверх спринтів (R1): ані в «Завдання»
  // проєкту, ані тим паче в особисте людина більше не перекидається.
  const openTask = (task: Task) => setOpenTaskId(task.id);

  const renderSprintRow = (sprint: Sprint) => {
    const closed = isSprintClosed(sprint);
    const archived = isSprintArchived(sprint);
    // Усі спринти згорнуті за замовчуванням — і відкриті теж.
    const open = expanded[sprint.id] ?? false;
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
        style={{ borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 10 }}>
        {/* Звичайний View, а не TouchableOpacity: пенал/закриття — окремі
            дотикові цілі, і вкладені TouchableOpacity в RN ненадійно
            передають дотик у дочірні — рядок і кнопки мають бути сиблінгами. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setExpanded(prev => ({ ...prev, [sprint.id]: !open }))}
            accessibilityRole="button"
            accessibilityLabel={sprint.name}
            accessibilityState={{ expanded: open }}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
            <IconSymbol name={closed ? 'checkmark.circle' : 'flag'} size={14} color={closed ? c.sub : (project?.color ?? c.accent)} />
            <Text numberOfLines={1} style={{ flex: 1, color: closed ? c.sub : c.text, fontSize: 14, fontWeight: '700' }}>{sprint.name}</Text>
            <Text style={{ color: c.sub, fontSize: 11 }}>{progress.done}/{progress.total}</Text>
          </TouchableOpacity>
          {/* Дії рядка — однакові 44×44 IconAction (без hitSlop-латок). */}
          {canEdit && !archived && (
            <IconAction icon="pencil" label={tr.sprintRename} onPress={() => openRename(sprint)} colors={c} />
          )}
          {canEdit && !archived && (
            <IconAction
              icon={closed ? 'arrow.uturn.backward' : 'flag.fill'}
              label={closed ? tr.sprintReopen : tr.sprintClose}
              active={closing?.id === sprint.id ? true : undefined}
              onPress={() => (closed ? reopen(sprint) : setClosing(prev => (prev?.id === sprint.id ? null : sprint)))}
              colors={c}
            />
          )}
          {canEdit && closed && (
            <IconAction
              icon={archived ? 'arrow.uturn.backward' : 'archivebox'}
              label={archived ? tr.sprintUnarchive : tr.sprintArchive}
              onPress={() => toggleArchived(sprint)}
              colors={c}
            />
          )}
        </View>

        {/* Підпис дат: «12 вер – 26 вер» або «без дат»; протермінований —
            бурштинова мітка. Спринт лишається відкритим: автозакриття немає. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 20 }}>
          <Text style={{ color: c.sub, fontSize: 11 }}>
            {dated ? `${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}` : tr.sprintUndated}
          </Text>
          {archived ? (
            <View style={{ borderRadius: Atlas.radius.small, borderWidth: 1, borderColor: c.border, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700' }}>{tr.sprintArchivedBadge}</Text>
            </View>
          ) : sprintStatus(sprint, now) === 'planned' ? (
            <View style={{ borderRadius: Atlas.radius.small, borderWidth: 1, borderColor: c.accent + '66', paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.accent, fontSize: 10, fontWeight: '700' }}>{tr.sprintStatusPlanned}</Text>
            </View>
          ) : null}
          {overdue ? (
            <View style={{ borderRadius: Atlas.radius.small, borderWidth: 1, borderColor: SPRINT_OVERDUE_COLOR, paddingHorizontal: 6, paddingVertical: 1 }}>
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

        {progress.total > 0 ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: c.border, marginTop: 8, marginLeft: 20, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: 4, backgroundColor: closed ? c.sub : (project?.color ?? c.accent) }} />
          </View>
        ) : null}

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
              <TouchableOpacity key={target.id} onPress={() => closeSprint(sprint, target)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                <IconSymbol name="flag" size={13} color={c.accent} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{target.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => closeSprint(sprint, null)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
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
              <TouchableOpacity
                key={task.id}
                onPress={() => openTask(task)}
                accessibilityRole="button"
                accessibilityLabel={task.title}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
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
                    style={{ flex: 1, borderRadius: Atlas.radius.medium, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 7, color: c.text, fontSize: 13 }}
                  />
                  <IconAction icon="plus" label={tr.sprintAddTaskA11y} color={c.accent} onPress={() => addTask(sprint)} colors={c} />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setAddToId(sprint.id); setAddTitle(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.sprintAddTaskA11y}: ${sprint.name}`}
                  accessibilityState={{ expanded: false }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 44 }}>
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

  const statusLabel = (key: SprintStatusFilter) =>
    key === 'all' ? tr.sprintStatusAll
      : key === 'planned' ? tr.sprintStatusPlanned
        : key === 'active' ? tr.sprintStatusActive
          : tr.sprintStatusCompleted;

  const sortItem = (key: SprintSort, label: string, separatorBefore = false): TasksMenuItem => ({
    key: `sort-${key}`,
    icon: 'arrow.up.arrow.down',
    label,
    checked: sort === key,
    separatorBefore,
    onPress: () => setView(prev => ({ ...prev, sort: key })),
  });
  const menuItems: TasksMenuItem[] = [
    sortItem('start-desc', tr.sprintSortStartDesc),
    sortItem('start-asc', tr.sprintSortStartAsc),
    sortItem('name', tr.sprintSortName),
    sortItem('progress', tr.sprintSortProgress),
    {
      key: 'archived', icon: 'archivebox', label: tr.sprintShowArchived, checked: showArchived, separatorBefore: true,
      badge: archivedCount || undefined,
      onPress: () => setView(prev => ({ ...prev, showArchived: !prev.showArchived })),
    },
    {
      key: 'expand-all', icon: 'chevron.down', label: tr.sprintExpandAll, separatorBefore: true,
      onPress: () => setExpanded(() => Object.fromEntries(visibleSprints.map(sp => [sp.id, true]))),
    },
    { key: 'collapse-all', icon: 'chevron.right', label: tr.sprintCollapseAll, onPress: () => setExpanded(() => ({})) },
  ];

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
      actions={(
        <>
          {canEdit ? (
            <HeaderButton
              onPress={openCreate}
              accessibilityLabel={tr.sprintNew}
              style={{ backgroundColor: c.dim, borderColor: c.border }}>
              <IconSymbol name="plus" size={17} color={c.accent} />
            </HeaderButton>
          ) : null}
          <TasksMenuButton onPress={() => setMenuOpen(true)} label={tr.sprintListMenu} active={filtersActive} colors={c} />
        </>
      )}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">
        {draft && !draft.sprint && (
          <View style={{ borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: c.accent, backgroundColor: c.dim, padding: 12, marginBottom: 12, gap: 8 }}>
            {renderDraftForm(tr.create)}
          </View>
        )}
        {projectSprints.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={tr.sprintStatusFilterA11y}
            style={{ marginBottom: 12, flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {STATUS_FILTERS.map(key => (
              <ActionChip
                key={key}
                label={statusLabel(key)}
                count={statusCounts[key]}
                selected={statusFilter === key}
                onPress={() => setView(prev => ({ ...prev, status: key }))}
                colors={c}
              />
            ))}
            {archivedCount > 0 ? (
              <ActionChip
                icon="archivebox"
                label={tr.sprintShowArchived}
                count={archivedCount}
                selected={showArchived}
                onPress={() => setView(prev => ({ ...prev, showArchived: !prev.showArchived }))}
                colors={c}
              />
            ) : null}
          </ScrollView>
        ) : null}
        {projectSprints.length === 0 && !draft ? (
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 30 }}>{tr.sprintNoSprintsHint}</Text>
        ) : visibleSprints.length === 0 && projectSprints.length > 0 ? (
          <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>{tr.sprintNoMatch}</Text>
            <ActionButton
              label={tr.sprintResetFilters}
              tone="neutral"
              onPress={() => setView(prev => ({ ...prev, status: 'all', showArchived: false }))}
              colors={c}
            />
          </View>
        ) : visibleSprints.map(renderSprintRow)}

        {/* Велосіті — внизу, під закритими спринтами (§8.4). */}
        {velocity && hasClosed ? (
          <SprintVelocity velocity={velocity} locale={locale} palette={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }} />
        ) : null}
      </ScrollView>
      <TasksHeaderMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} colors={c} isDark={isDark} />
      {projectId ? (
        <ProjectTaskSheet projectId={String(projectId)} taskId={openTaskId} onClose={() => setOpenTaskId(null)} isDark={isDark} />
      ) : null}
    </ProjectScreenShell>
  );
}

const STATUS_FILTERS: readonly SprintStatusFilter[] = ['all', 'active', 'planned', 'completed'];
