/**
 * store/live-activity.ts — Live Activity таймера на екрані блокування й у
 * Dynamic Island (docs/specs/watch-lockscreen-v1.md §7.4).
 *
 * Рівно ОДНА активність: найсвіжіший таймер, що йде (`startedAt` max), і
 * «+N» — скільки ще. Вигляд малює віджет-розширення
 * (targets/widget/TimerLiveActivity.swift); кнопка «Стоп» там — інтент, що
 * кладе `timer_stop` у чергу App Group, а store/device-actions.ts застосовує
 * його тим самим шляхом, що й «Стоп» у застосунку.
 *
 * Лише iOS ≥ 17 і лише коли користувач не вимкнув Live Activities: розширення,
 * яке їх малює, і так має deploymentTarget 17.0. Запуск — тільки поки
 * застосунок активний (правило ActivityKit; натив сам перевіряє), оновлення й
 * завершення — будь-коли.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import * as IosBridge from '@/modules/flowi-ios-bridge';
import type { LiveActivityState } from '@/modules/flowi-ios-bridge';
import type { ActiveTimer } from '@/utils/activeTimers';
import { projectNameMap } from '@/utils/watchSnapshot';

import { parsePendingQueue } from './device-actions';
import { useI18n } from './i18n';
import { loadData, subscribeToStorage } from './storage';
import { useTimerContext } from './timer-context';

export const LIVE_ACTIVITY_DEFAULT_COLOR = '#6366F1';

type ProjectInfo = Map<string, { name: string; color: string | null }>;

/** Таймери, для яких у черзі вже лежить «Стоп» — їхню активність не воскрешаємо. */
export function pendingStopIds(queueJson: string): Set<string> {
  const ids = new Set<string>();
  for (const item of parsePendingQueue(queueJson)) {
    if (!item || typeof item !== 'object') continue;
    const action = item as { type?: unknown; payload?: { timerId?: unknown } };
    if (action.type === 'timer_stop' && typeof action.payload?.timerId === 'string') ids.add(action.payload.timerId);
  }
  return ids;
}

/** Стан активності з реєстру таймерів, або null — активності бути не повинно. */
export function liveActivityStateFor(
  timers: readonly ActiveTimer[],
  options: {
    lang: 'uk' | 'en';
    projects: ProjectInfo;
    tasks?: readonly { id?: unknown; projectId?: unknown }[];
    meetings?: readonly { id?: unknown; projectId?: unknown }[];
    excluded?: ReadonlySet<string>;
  },
): LiveActivityState | null {
  const running = timers.filter(t =>
    t && typeof t.id === 'string' && !options.excluded?.has(t.id)
    && Number.isFinite(Date.parse(t.startedAt)));
  if (!running.length) return null;
  const newest = running.reduce((best, t) =>
    Date.parse(t.startedAt) > Date.parse(best.startedAt) ? t : best);
  const projectId = newest.projectId
    ?? (newest.taskId ? options.tasks?.find(t => t.id === newest.taskId)?.projectId : undefined)
    ?? (newest.meetingId ? options.meetings?.find(m => m.id === newest.meetingId)?.projectId : undefined);
  const project = typeof projectId === 'string' ? options.projects.get(projectId) : undefined;
  return {
    timerId: newest.id,
    label: (newest.label ?? '').trim().slice(0, 80),
    startedAtMs: Date.parse(newest.startedAt),
    projectName: project?.name ?? null,
    colorHex: project?.color ?? LIVE_ACTIVITY_DEFAULT_COLOR,
    otherCount: running.length - 1,
    lang: options.lang,
  };
}

const PROJECT_KEYS: readonly string[] = ['workspace_projects', 'projects'];
const LOOKUP_KEYS: readonly string[] = ['tasks', 'meetings'];

type ProjectRef = { id: string; projectId: string };
interface Lookups { tasks: ProjectRef[]; meetings: ProjectRef[] }
const NO_LOOKUPS: Lookups = { tasks: [], meetings: [] };

/**
 * Таймери старих версій без `projectId` — проєкт шукаємо в задачі/нараді.
 * Ключ змінюється лише тоді, коли змінюється сам набір таких таймерів.
 */
export function projectLookupKey(timers: readonly ActiveTimer[]): string {
  return timers
    .filter(t => t && !t.projectId && (t.taskId || t.meetingId))
    .map(t => `${t.taskId ?? ''}|${t.meetingId ?? ''}`)
    .sort()
    .join(',');
}

function refsFor(source: unknown, ids: ReadonlySet<string>): ProjectRef[] {
  if (!Array.isArray(source) || !ids.size) return [];
  const out: ProjectRef[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const { id, projectId } = item as { id?: unknown; projectId?: unknown };
    if (typeof id === 'string' && ids.has(id) && typeof projectId === 'string' && projectId) out.push({ id, projectId });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Монтується один раз (components/shared/DeviceSurfaces.tsx). Поза iOS — no-op.
 *
 * Перф (H2): кеш проєктів перечитується лише на зміну ключів проєктів;
 * задачі/наради — лише коли таймер, що йде, не має `projectId`. Стан
 * оновлюється тільки тоді, коли похідне значення справді змінилось, — тож
 * звичайні записи задач/нарад не перемальовують корінь застосунку.
 */
export function useTimerLiveActivity(): void {
  const { activeTimers, timersReady } = useTimerContext();
  const { lang } = useI18n();
  const [projects, setProjects] = useState<ProjectInfo>(() => new Map());
  const [lookups, setLookups] = useState<Lookups>(NO_LOOKUPS);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const lastSignature = useRef<string | null>(null);
  const projectsSignature = useRef('[]');
  const lookupsSignature = useRef(JSON.stringify(NO_LOOKUPS));
  const lookupKey = useMemo(() => (Platform.OS === 'ios' ? projectLookupKey(activeTimers) : ''), [activeTimers]);

  // Назва й колір проєкту — з кешу проєктів.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    const load = () => {
      void Promise.all([
        loadData<unknown>('workspace_projects', []),
        loadData<unknown>('projects', []),
      ]).then(([summaries, list]) => {
        if (!mounted) return;
        const next = projectNameMap(summaries, list);
        const signature = JSON.stringify([...next.entries()]);
        if (signature === projectsSignature.current) return;
        projectsSignature.current = signature;
        setProjects(next);
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeToStorage(key => { if (PROJECT_KEYS.includes(key)) load(); });
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => { mounted = false; unsubscribe(); sub.remove(); };
  }, []);

  // Задачі/наради — лише для таймерів старих версій без projectId.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const apply = (next: Lookups) => {
      const signature = JSON.stringify(next);
      if (signature === lookupsSignature.current) return;
      lookupsSignature.current = signature;
      setLookups(next);
    };
    if (!lookupKey) {
      apply(NO_LOOKUPS);
      return;
    }
    const pairs = lookupKey.split(',').map(pair => pair.split('|'));
    const taskIds = new Set(pairs.map(([taskId]) => taskId).filter(Boolean));
    const meetingIds = new Set(pairs.map(([, meetingId]) => meetingId).filter(Boolean));
    let mounted = true;
    const load = () => {
      void Promise.all([
        taskIds.size ? loadData<unknown>('tasks', []) : Promise.resolve([]),
        meetingIds.size ? loadData<unknown>('meetings', []) : Promise.resolve([]),
      ]).then(([tasks, meetings]) => {
        if (mounted) apply({ tasks: refsFor(tasks, taskIds), meetings: refsFor(meetings, meetingIds) });
      }).catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeToStorage(key => { if (LOOKUP_KEYS.includes(key)) load(); });
    return () => { mounted = false; unsubscribe(); };
  }, [lookupKey]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !timersReady) return;
    if (!IosBridge.liveActivitiesEnabled()) {
      if (lastSignature.current !== null) {
        IosBridge.liveActivitySync(null);
        lastSignature.current = null;
      }
      return;
    }
    // Черга «Стоп» читається саме тут, у момент синхронізації (і на кожне
    // повернення в застосунок): «Стоп», натиснутий у фоні, не має воскресити
    // активність таймера, якого черга ще не встигла зупинити.
    const state = liveActivityStateFor(activeTimers, {
      lang,
      projects,
      tasks: lookups.tasks,
      meetings: lookups.meetings,
      excluded: pendingStopIds(IosBridge.readPendingActions()),
    });
    // Повернення в застосунок — єдиний момент, коли можна (пере)запустити
    // активність, яку система чи людина прибрала; тому підпис скидаємо.
    const signature = JSON.stringify([state, appActive]);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    IosBridge.liveActivitySync(state);
  }, [activeTimers, lang, projects, lookups, appActive, timersReady]);
}
