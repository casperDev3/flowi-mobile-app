/**
 * app/project/[id]/calendar.tsx — «Календар» проєкту.
 *
 * Він же тепер і «Наради» проєкту (рішення власника: календар замінює
 * наради). Старий маршрут `/project/[id]/meetings` перенаправляє сюди з
 * `?open=<id>` / `?create=1&date=`, тож форма наради живе тут.
 *
 * Ті самі сітки, що й загальний календар (components/calendar): Місяць /
 * Тиждень / День. На одній сітці — зустрічі проєкту (з повторами), дедлайни
 * його завдань і спринти смугами КОЛЬОРУ ПРОЄКТУ (тут — і закриті: це
 * історія проєкту). «3 місяці» й «Рік» прибрано: на телефоні вони були
 * нечитабельною мозаїкою, а огляд на довгий строк дає Таймлайн.
 *
 * «+» у шапці (лише для тих, хто може редагувати) питає — Зустріч чи
 * Завдання; завдання створюється тут же аркушем (CalendarTaskCreate).
 * Тап по задачі (і «Відкрити повністю» після створення) відкриває ПОВНУ
 * картку тут же, аркушем (ProjectTaskSheet), — календар лишається під ним.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CalendarTaskCreate } from '@/components/calendar/CalendarTaskCreate';
import { CalendarToolbar } from '@/components/calendar/CalendarToolbar';
import {
  activeSprints, bucketMeetings, bucketTasks, dateKey, deadlineIsoForKey, defaultCalendarView, keyToDate,
  monthMatrix, periodTitle, shiftAnchor, sprintsOnDay, viewRange,
  type CalendarProject, type CalendarView, type SprintBar,
} from '@/components/calendar/calendarModel';
import { CreateChooser } from '@/components/calendar/CreateChooser';
import { DayAgenda } from '@/components/calendar/DayAgenda';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { calendarColors, type CalendarColors } from '@/components/calendar/palette';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectTaskSheet } from '@/components/projects/ProjectTaskSheet';
import { useProjectRecords } from '@/components/projects/useProjectRecords';
import { MeetingFormSheet, type MeetingFormData } from '@/components/shared/MeetingFormSheet';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useTodayKey } from '@/hooks/use-today-key';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { updateSynced } from '@/store/synced-storage';
import { expandMeetings, withMeetingProject, type Meeting } from '@/utils/meetings';
import type { Sprint } from '@/utils/sprintUtils';
import { isTaskDoneByType, type TaskStatusColumn } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

interface CreateTarget { day: string; time?: string }

const DEFAULT_COLOR = '#7C3AED';

export default function ProjectCalendar() {
  const { id: routeId, open: openParam, create, date } = useLocalSearchParams<{ id: string; open?: string; create?: string; date?: string }>();
  const id = (useProjectRouteId() ?? routeId) as string;
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { user } = useAuth();
  const myUserId = user?.id !== undefined && user?.id !== null ? String(user.id) : null;
  const router = useRouter();
  const { project } = useProject(id);
  const role = useProjectRole(id);
  const canEdit = role !== 'viewer';
  const { isWide } = useResponsive();
  const todayKey = useTodayKey();
  const isDark = useColorScheme() === 'dark';
  const projectColor = project?.color ?? DEFAULT_COLOR;

  // Палітра сітки — від оболонки проєкту (фон, текст, рамки), акцент і
  // смуги спринтів — колір проєкту.
  const c = useMemo<CalendarColors>(() => {
    const shell = projectShellColors(isDark, projectColor, project?.appearance);
    return {
      ...calendarColors(isDark),
      bg1: shell.bg1, bg2: shell.bg2, text: shell.text, sub: shell.sub, border: shell.border, dim: shell.dim,
      accent: projectColor,
    };
  }, [isDark, projectColor, project?.appearance]);

  // ─── Дані ─────────────────────────────────────────────────────────────────
  const allTasks = useProjectRecords<Task>('tasks');
  const allMeetings = useProjectRecords<Meeting>('meetings');
  const allSprints = useProjectRecords<Sprint>('sprints');
  const statuses = useProjectRecords<TaskStatusColumn>('task_statuses');

  const calProject = useMemo<CalendarProject>(
    () => ({ id: String(id ?? ''), name: project?.name ?? '', color: projectColor }),
    [id, project?.name, projectColor],
  );
  const projectMap = useMemo(() => new Map([[calProject.id, calProject] as const]), [calProject]);
  const projectList = useMemo(() => [calProject], [calProject]);

  const projectMeetings = useMemo(() => allMeetings.filter(m => m.projectId === id), [allMeetings, id]);
  const expanded = useMemo(() => {
    const now = new Date();
    return expandMeetings(
      projectMeetings,
      new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
      new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()),
    );
  }, [projectMeetings]);
  const meetingsByDay = useMemo(() => bucketMeetings(expanded, null), [expanded]);
  const markedDays = useMemo(() => new Set(Object.keys(meetingsByDay)), [meetingsByDay]);

  const isDone = useCallback((t: Task) => isTaskDoneByType(t, statuses), [statuses]);
  const tasksByDay = useMemo(() => bucketTasks(allTasks, {
    filter: calProject.id, showDone: true, onlyMine: false, myUserId, isDone,
    projects: projectMap, personalColor: projectColor,
  }), [allTasks, calProject.id, myUserId, isDone, projectMap, projectColor]);

  const sprintBars = useMemo(
    () => activeSprints(allSprints, projectMap, calProject.id, { includeClosed: true }).bars,
    [allSprints, projectMap, calProject.id],
  );

  // ─── Вид ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<CalendarView>(() => defaultCalendarView(isWide));
  const [anchor, setAnchor] = useState(todayKey);
  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const anchorDate = keyToDate(anchor);
  const monthRows = useMemo(
    () => monthMatrix(anchorDate.getFullYear(), anchorDate.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor],
  );
  const title = useMemo(() => periodTitle(view, anchor, tr), [view, anchor, tr]);
  const dayTitle = useCallback((day: string) => {
    if (day === todayKey) return tr.today;
    const d = keyToDate(day);
    return `${tr.weekdaysFull[(d.getDay() + 6) % 7]}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}`;
  }, [todayKey, tr]);

  // ─── Наради ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState<{ initial: MeetingFormData | null } | null>(null);
  const openMeeting = useCallback((meeting: Meeting) => setForm({ initial: {
    id: meeting.id, title: meeting.title, date: meeting.date, time: meeting.time, durationMinutes: meeting.durationMinutes,
    location: meeting.location, link: meeting.link, notes: meeting.notes, color: meeting.color,
    recurrence: meeting.recurrence, projectId: meeting.projectId,
  } }), []);
  const newMeeting = useCallback((day?: string, time?: string) => setForm({ initial: {
    title: '', date: day || dateKey(new Date()), time: time ?? '09:00', durationMinutes: 30,
    color: projectColor, projectId: id,
  } }), [projectColor, id]);

  // ?open=<id> (push, старі посилання на «Наради» проєкту) — щойно нарада є в
  // завантаженому списку. Глядач теж може відкрити (читати/коментувати).
  useEffect(() => {
    if (!openParam) return;
    const m = allMeetings.find(x => x.id === openParam);
    if (!m) return;
    setAnchor(m.date);
    openMeeting(m);
    router.setParams({ open: '' });
  }, [openParam, allMeetings, openMeeting, router]);
  useEffect(() => {
    if (create !== '1') return;
    if (canEdit) newMeeting(date || undefined);
    router.setParams({ create: '', date: '' });
  }, [create, date, canEdit, newMeeting, router]);

  const saveMeeting = useCallback(async (data: MeetingFormData) => {
    setForm(null);
    setAnchor(data.date);
    const fields = {
      title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes, location: data.location,
      link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
    };
    try {
      await updateSynced<Meeting>('meetings', fresh => data.id
        ? fresh.map(m => m.id !== data.id ? m : withMeetingProject({ ...m, ...fields }, data.projectId))
        : [...fresh, withMeetingProject<Meeting>({ id: Date.now().toString(), ...fields }, data.projectId ?? id)]);
    } catch (e) {
      if (__DEV__) console.warn('[project/calendar] запис наради не вдався:', e);
    }
  }, [id]);

  const removeMeeting = useCallback(async () => {
    const mid = form?.initial?.id;
    setForm(null);
    if (!mid) return;
    try {
      await updateSynced<Meeting>('meetings', fresh => fresh.filter(m => m.id !== mid));
    } catch (e) {
      if (__DEV__) console.warn('[project/calendar] видалення наради не вдалося:', e);
    }
  }, [form]);

  const onMeetingPress = useCallback((m: Meeting) => {
    const orig = projectMeetings.find(x => x.id === (m._origId ?? m.id));
    if (orig) openMeeting(orig);
  }, [projectMeetings, openMeeting]);

  // ─── Створення ────────────────────────────────────────────────────────────
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [taskDay, setTaskDay] = useState<string | null>(null);
  // Модалка вибору закривається ДО відкриття наступного аркуша (NEW-02).
  const chooseMeeting = useCallback(() => {
    const target = createTarget;
    setCreateTarget(null);
    if (target) setTimeout(() => newMeeting(target.day, target.time), 300);
  }, [createTarget, newMeeting]);
  const chooseTask = useCallback(() => {
    const target = createTarget;
    setCreateTarget(null);
    if (target) setTimeout(() => setTaskDay(target.day), 300);
  }, [createTarget]);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const createTask = useCallback(async (task: Task, openFull: boolean) => {
    setTaskDay(null);
    try {
      await updateSynced<Task>('tasks', list => [task, ...list.filter(t => t.id !== task.id)]);
      // Аркуш створення ще закривається — повна картка після паузи (NEW-02).
      if (openFull) setTimeout(() => setOpenTaskId(task.id), 350);
    } catch (e) {
      if (__DEV__) console.warn('[project/calendar] створення завдання не вдалося:', e);
    }
  }, []);

  const openTask = useCallback((task: Task) => setOpenTaskId(task.id), []);
  // Смуга спринта — у «Спринти» з ?sprint=: саме цей спринт розгорнеться.
  const openSprint = useCallback((bar: SprintBar) => {
    router.push({ pathname: '/project/[id]/sprints', params: { id: String(id), sprint: bar.sprint.id } } as never);
  }, [router, id]);
  const onSlotPress = useCallback((day: string, hour: number) => {
    setAnchor(day);
    if (canEdit) setCreateTarget({ day, time: `${String(hour).padStart(2, '0')}:00` });
  }, [canEdit]);

  // ─── Розмітка ─────────────────────────────────────────────────────────────
  const agenda = (
    <DayAgenda
      day={anchor}
      title={dayTitle(anchor)}
      tasks={tasksByDay[anchor] ?? []}
      meetings={meetingsByDay[anchor] ?? []}
      sprints={sprintsOnDay(sprintBars, anchor)}
      c={c}
      isDark={isDark}
      tr={tr}
      meetingProject={() => null}
      onTaskPress={openTask}
      onMeetingPress={onMeetingPress}
      onSprintPress={openSprint}
    />
  );

  const bottomPad = 120;
  let content: React.ReactNode;
  if (view === 'month') {
    content = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
        <MonthGrid
          rows={monthRows}
          month={anchorDate.getMonth()}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          onSelectDay={setAnchor}
          mode={isWide ? 'labels' : 'dots'}
          c={c}
          tr={tr}
        />
        <View style={{ marginTop: 18 }}>{agenda}</View>
      </ScrollView>
    );
  } else if (view === 'week' && !isWide) {
    content = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
        <WeekStrip
          days={range.days}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          onSelect={setAnchor}
          c={c}
          tr={tr}
        />
        <View style={{ marginTop: 16 }}>{agenda}</View>
      </ScrollView>
    );
  } else {
    content = (
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <TimeGrid
          days={range.days}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          onSelectDay={day => { setAnchor(day); if (view === 'week') setView('day'); }}
          onMeetingPress={onMeetingPress}
          onTaskPress={openTask}
          onSlotPress={onSlotPress}
          onSprintPress={openSprint}
          c={c}
          tr={tr}
        />
      </View>
    );
  }

  const isCurrentPeriod = todayKey >= range.start && todayKey <= range.end
    && (view !== 'month' || keyToDate(todayKey).getMonth() === anchorDate.getMonth());

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.calendar}
      actions={
        <>
          <HeaderButton
            onPress={() => setAnchor(todayKey)}
            accessibilityLabel={tr.today}
            style={{ borderColor: isCurrentPeriod ? c.accent + '50' : c.border, backgroundColor: isCurrentPeriod ? c.accent + '14' : c.dim }}>
            <IconSymbol name="calendar" size={16} color={isCurrentPeriod ? c.accent : c.sub} />
          </HeaderButton>
          {canEdit ? (
            <HeaderButton
              onPress={() => setCreateTarget({ day: anchor })}
              accessibilityLabel={tr.calProjectAdd}
              style={{ borderColor: c.accent + '50', backgroundColor: c.accent + '14' }}>
              <IconSymbol name="plus" size={18} color={c.accent} />
            </HeaderButton>
          ) : null}
        </>
      }>
      <View style={{ flex: 1 }}>
        <CalendarToolbar
          view={view}
          onViewChange={setView}
          title={title}
          onPrev={() => setAnchor(a => shiftAnchor(view, a, -1))}
          onNext={() => setAnchor(a => shiftAnchor(view, a, 1))}
          projects={projectList}
          filter={calProject.id}
          onFilterChange={() => {}}
          showDone
          onToggleDone={() => {}}
          onlyMine={false}
          onToggleOnlyMine={() => {}}
          canFilterMine={false}
          showFilters={false}
          wide={isWide}
          c={c}
          tr={tr}
        />
        {content}
      </View>

      <CreateChooser
        visible={!!createTarget}
        subtitle={createTarget ? `${dayTitle(createTarget.day)}${createTarget.time ? ` · ${createTarget.time}` : ''}` : ''}
        onClose={() => setCreateTarget(null)}
        onMeeting={chooseMeeting}
        onTask={chooseTask}
        isDark={isDark}
        wide={isWide}
        c={c}
        tr={tr}
      />

      <CalendarTaskCreate
        visible={!!taskDay}
        deadline={taskDay ? deadlineIsoForKey(taskDay) : null}
        projectId={calProject.id}
        projects={projectList}
        sprints={allSprints}
        statuses={statuses}
        userId={myUserId}
        onCreate={(task, openFull) => { void createTask(task, openFull); }}
        onClose={() => setTaskDay(null)}
        isDark={isDark}
        locale={locale}
        c={c}
      />

      <MeetingFormSheet
        visible={!!form}
        initial={form?.initial}
        presetProjectId={project?.id}
        onClose={() => setForm(null)}
        onSave={saveMeeting}
        onDelete={form?.initial?.id && canEdit ? removeMeeting : undefined}
        isDark={isDark}
        lang={lang}
        tr={tr}
        markedDays={markedDays}
        currentUserId={myUserId}
        isProjectOwner={role === 'owner'}
      />

      <ProjectTaskSheet projectId={id} taskId={openTaskId} onClose={() => setOpenTaskId(null)} isDark={isDark} />
    </ProjectScreenShell>
  );
}
