/**
 * components/time/useTimerProjects.ts — проєкт кожного активного таймера для
 * мітки в панелі над табами, картці сайдбара й режимі зосередження.
 *
 * Сама логіка — чиста функція timerProject (utils/activeTimers.ts, однакова з
 * вебом). Хук лише дістає для неї дані зі сховища і перечитує їх, коли в ключ
 * пише хтось інший (синк, екран проєктів): перейменований чи перефарбований
 * проєкт мусить оновитись у мітці без перезапуску.
 *
 * Читається рівно те, що потрібно:
 *   • 'projects' — лише коли таймери взагалі є;
 *   • 'tasks' / 'meetings' — лише для старих таймерів без власного projectId
 *     (стор копіює його при старті, тож зазвичай ці великі ключі не читаються).
 */
import { useCallback, useEffect, useState } from 'react';

import { loadData, subscribeToStorage } from '@/store/storage';
import {
  timerProject,
  type ActiveTimer,
  type TimerProject,
  type TimerProjectOwner,
  type TimerProjectSource,
} from '@/utils/activeTimers';

const EMPTY: never[] = [];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : EMPTY;
}

export function useTimerProjects(timers: readonly ActiveTimer[]): (timer: ActiveTimer) => TimerProject {
  const needProjects = timers.length > 0;
  const needTasks = timers.some(t => t.taskId && !t.projectId);
  const needMeetings = timers.some(t => t.meetingId && !t.projectId);

  const [projects, setProjects] = useState<TimerProjectSource[]>(EMPTY);
  const [tasks, setTasks] = useState<TimerProjectOwner[]>(EMPTY);
  const [meetings, setMeetings] = useState<TimerProjectOwner[]>(EMPTY);

  useEffect(() => {
    const wanted: [string, boolean, (v: TimerProjectOwner[] | TimerProjectSource[]) => void][] = [
      ['projects', needProjects, v => setProjects(v as TimerProjectSource[])],
      ['tasks', needTasks, v => setTasks(v as TimerProjectOwner[])],
      ['meetings', needMeetings, v => setMeetings(v as TimerProjectOwner[])],
    ];
    const active = wanted.filter(([, need]) => need);
    if (!active.length) return;
    let cancelled = false;
    const read = (key: string, set: (v: never[]) => void) => {
      loadData<unknown>(key, [])
        .then(value => { if (!cancelled) set(asArray<never>(value)); })
        .catch(e => { if (__DEV__) console.warn(`[timer-projects] читання ${key} не вдалося:`, e); });
    };
    for (const [key, , set] of active) read(key, set);
    const unsubscribe = subscribeToStorage(changed => {
      const hit = active.find(([key]) => key === changed);
      if (hit) read(hit[0], hit[2]);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [needProjects, needTasks, needMeetings]);

  return useCallback(
    (timer: ActiveTimer) => timerProject(timer, projects, tasks, meetings),
    [projects, tasks, meetings],
  );
}
