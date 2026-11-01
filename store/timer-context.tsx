/**
 * store/timer-context.tsx — єдиний стор активних таймерів.
 *
 * Раніше тут жили два рядки контексту для передачі назви завдання на вкладку
 * Time, а самі таймери були розкидані по екранах: екран завдань тримав
 * відкритий запис у task.timeEntries, екран часу — локальний useState, що не
 * переживав перезапуск. Через це «зупинити» можна було лише там, де запустив,
 * і два таймери нічого не знали один про одного.
 *
 * Тепер стор володіє трьома ефектами зупинки (реєстр → завдання → дзеркало в
 * time_entries) — саме тому, що поведінка мусить бути однаковою з будь-якого
 * екрана: з деталі завдання, з вкладки часу, з fullscreen-сітки.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import { useI18n } from './i18n';

import { ensureStorageMigrations } from './migrations';
import { loadData, subscribeToStorage } from './storage';
import {
  TIMERS_KEY,
  startAdHocTimerOp,
  startMeetingTimerOp,
  startTaskTimerOp,
  stopTimerOp,
  subscribeExternalTimerChanges,
  type TimerMeetingInput,
  type TimerOpHooks,
  type TimerTaskInput,
} from './timer-ops';
import {
  findTimerForTask,
  sortTimers,
  taskTimerId,
  type ActiveTimer,
} from '@/utils/activeTimers';
import {
  findTimerForMeeting,
  meetingTimerId,
} from '@/utils/meetings';

// Типи входу старту живуть у store/timer-ops.ts (спільні з діями пристроїв);
// тут — реекспорт для наявних імпортів.
export type { TimerMeetingInput, TimerTaskInput } from './timer-ops';

export interface TimerContextValue {
  pendingTask: string;
  setPendingTask: (task: string) => void;

  activeTimers: ActiveTimer[];
  /** false, доки сховище не прочитане: до цього «немає таймерів» — брехня. */
  timersReady: boolean;
  startTaskTimer: (task: TimerTaskInput) => Promise<void>;
  startAdHocTimer: (label: string) => Promise<void>;
  /** Нарада трекається так само, як завдання, — але без дошки, див. stopTimer. */
  startMeetingTimer: (meeting: TimerMeetingInput) => Promise<void>;
  stopTimer: (id: string) => Promise<void>;
  stopTimerForTask: (taskId: string) => Promise<void>;
  stopTimerForMeeting: (meetingId: string) => Promise<void>;
  getTimerForTask: (taskId: string) => ActiveTimer | undefined;
  getTimerForMeeting: (meetingId: string) => ActiveTimer | undefined;
  /**
   * Інкрементується після кожного запису стору в 'tasks'. Екрани тримають
   * завдання у власному стані й не побачили б чужий запис у сховище —
   * ця лічилка каже їм перечитати.
   */
  tasksRevision: number;
  /** Те саме для 'meetings': стоп таймера дописує сесію повз стан екрана. */
  meetingsRevision: number;
  /**
   * Те саме для 'time_entries'. Потрібна відтоді, як режим зосередження
   * відкривається з кореневої кнопки: зупинка таймера там відбувається повз
   * вкладку «Час», і без сигналу вона показувала б список «до зупинки» —
   * що виглядає як загублена сесія, хоч сесія записана.
   */
  timeEntriesRevision: number;
}

const TimerContext = createContext<TimerContextValue>({
  pendingTask: '',
  setPendingTask: () => {},
  activeTimers: [],
  timersReady: false,
  startTaskTimer: async () => {},
  startAdHocTimer: async () => {},
  startMeetingTimer: async () => {},
  stopTimer: async () => {},
  stopTimerForTask: async () => {},
  stopTimerForMeeting: async () => {},
  getTimerForTask: () => undefined,
  getTimerForMeeting: () => undefined,
  tasksRevision: 0,
  meetingsRevision: 0,
  timeEntriesRevision: 0,
});

/** Реєстр, як він лежить у сховищі просто зараз. Биті записи відкидаємо. */
async function readStoredTimers(): Promise<ActiveTimer[]> {
  const stored = await loadData<ActiveTimer[]>(TIMERS_KEY, []);
  const usable = Array.isArray(stored) ? stored.filter(t => t?.id && t.startedAt) : [];
  return sortTimers(usable);
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { tr } = useI18n();
  const [pendingTask, setPendingTask] = useState('');
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [timersReady, setTimersReady] = useState(false);
  const [tasksRevision, setTasksRevision] = useState(0);
  const [meetingsRevision, setMeetingsRevision] = useState(0);
  const [timeEntriesRevision, setTimeEntriesRevision] = useState(0);

  // Мутації йдуть із колбеків і не можуть чекати на новий рендер, щоб побачити
  // результат попередньої — тому актуальний масив живе ще й у ref.
  const timersRef = useRef<ActiveTimer[]>([]);
  const initialized = useRef(false);
  /** Скільки записів у польоті. Поки їх >0, перечитувати сховище не можна. */
  const writesInFlight = useRef(0);

  const readTimers = useCallback(async () => {
    const usable = await readStoredTimers();
    timersRef.current = usable;
    setActiveTimers(usable);
  }, []);

  useEffect(() => {
    // Спершу міграції: одна з них переносить відкриту сесію із task.timeEntries
    // у цей самий ключ. Прочитати раніше — означало б показати «таймерів немає»
    // на весь сеанс після оновлення застосунку.
    void ensureStorageMigrations()
      .catch(() => {
        // Причину вже залогував SyncGate — читаємо те, що є.
      })
      .then(readTimers)
      .catch(e => {
        if (__DEV__) console.warn('[timers] loadData(active_timers) failed:', e);
      })
      .finally(() => {
        initialized.current = true;
        setTimersReady(true);
      });
  }, [readTimers]);

  // Ключ пишуть і повз нас: pull синхронізації, відновлення бекапу, очищення
  // даних. Без цього підписника стан у передньому плані розходився б зі
  // сховищем — рядок таймера, якого вже немає, або відсутній рядок таймера,
  // запущеного з іншого пристрою.
  useEffect(() => {
    const unsubscribe = subscribeToStorage(key => {
      if (key !== TIMERS_KEY || !initialized.current) return;
      // Власний запис у польоті ще не долетів до сховища — перечитування
      // відкотило б його назад.
      if (writesInFlight.current > 0) return;
      void readTimers().catch(e => {
        if (__DEV__) console.warn('[timers] refresh failed:', e);
      });
    });
    return unsubscribe;
  }, [readTimers]);

  // Дії пристроїв (годинник, Live Activity, Android-нотифікація) пишуть у ті
  // самі ключі через store/timer-ops.ts повз провайдер — перечитуємо реєстр і
  // піднімаємо ревізії, як після власного старту/стопу.
  useEffect(() => subscribeExternalTimerChanges(change => {
    if (change.tasks) setTasksRevision(n => n + 1);
    if (change.meetings) setMeetingsRevision(n => n + 1);
    if (change.timeEntries) setTimeEntriesRevision(n => n + 1);
    if (change.timers && initialized.current && writesInFlight.current === 0) {
      void readTimers().catch(e => {
        if (__DEV__) console.warn('[timers] refresh failed:', e);
      });
    }
  }), [readTimers]);

  // Синк застосовує чужі зміни прямо в сховище, повз наш стан: інший пристрій
  // міг запустити або зупинити таймер, поки застосунок був у фоні. Повернення
  // з фону — найдешевший момент перечитати, не заводячи поллінг.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || !initialized.current) return;
      // Власний запис у польоті ще не долетів до сховища — перечитування
      // відкотило б його назад.
      if (writesInFlight.current > 0) return;
      void readTimers().catch(e => {
        if (__DEV__) console.warn('[timers] refresh failed:', e);
      });
    });
    return () => sub.remove();
  }, [readTimers]);

  // The callback identity must follow React state: consumers/compiler may
  // memoize lookups. A stable getter over a ref hides start/stop changes.
  const getTimerForTask = useCallback(
    (taskId: string) => findTimerForTask(activeTimers, taskId),
    [activeTimers],
  );

  const getTimerForMeeting = useCallback(
    (meetingId: string) => findTimerForMeeting(activeTimers, meetingId),
    [activeTimers],
  );

  /**
   * Хуки операцій (store/timer-ops.ts): стан провайдера, ревізії для екранів,
   * Alert про відсутню колонку робочого процесу. Помилки сховища логуються й
   * ковтаються покроково — таймер лишається на екрані, але не переживе
   * перезапуск, і причина має бути видимою.
   */
  const hooks = useMemo<TimerOpHooks>(() => ({
    onTimers: next => {
      timersRef.current = next;
      setActiveTimers(next);
    },
    onTimersWriteStart: () => { writesInFlight.current += 1; },
    onTimersWriteEnd: () => { writesInFlight.current -= 1; },
    onTasksChanged: () => setTasksRevision(n => n + 1),
    onMeetingsChanged: () => setMeetingsRevision(n => n + 1),
    onTimeEntriesChanged: () => setTimeEntriesRevision(n => n + 1),
    // Workflow changes are owner-only on the server. Never create a local
    // column that a member cannot synchronize, or silently select Todo.
    onWorkflowMissing: () => Alert.alert(tr.timerWorkflowMissingTitle, tr.timerWorkflowMissingMessage),
    onWriteError: (scope, e, id) => {
      if (!__DEV__) return;
      if (scope === 'active_timers') console.warn('[timers] запис active_timers не вдався:', e);
      else if (scope === 'time_entries') console.warn('[timers] дзеркало у time_entries не вдалося:', e);
      else console.warn(`[timers] запис '${scope}' не вдався (${id}):`, e);
    },
  }), [tr.timerWorkflowMissingTitle, tr.timerWorkflowMissingMessage]);

  const startTaskTimer = useCallback(
    async (task: TimerTaskInput) => {
      await startTaskTimerOp(task, {}, hooks);
    },
    [hooks],
  );

  const startAdHocTimer = useCallback(
    async (label: string) => {
      await startAdHocTimerOp(label, {}, hooks);
    },
    [hooks],
  );

  /**
   * Старт таймера наради.
   *
   * Від startTaskTimer відрізняється рівно тим, чого в наради немає: ні
   * перевірки «завершене не трекають», ні переносу в «У процесі», ні запису в
   * історію. Лишається сам реєстр — і перевірка на свіжому списку, бо ту саму
   * нараду могли запустити з іншого пристрою.
   */
  const startMeetingTimer = useCallback(
    async (meeting: TimerMeetingInput) => {
      await startMeetingTimerOp(meeting, {}, hooks);
    },
    [hooks],
  );

  /** Реєстр → завдання/нарада → дзеркало в time_entries (store/timer-ops.ts). */
  const stopTimer = useCallback(
    async (id: string) => {
      await stopTimerOp(id, {}, hooks);
    },
    [hooks],
  );

  const stopTimerForTask = useCallback(
    async (taskId: string) => {
      // На власному списку не зупиняємось: він міг відстати від сховища, і
      // тоді зупинка «не знайшла б» таймер, який насправді йде. id таймера
      // завдання похідний (taskTimerId), тож звірку робить сам stopTimer уже
      // на свіжих даних; пошук у ref лишається запасним шляхом.
      const known = findTimerForTask(timersRef.current, taskId);
      await stopTimer(known?.id ?? taskTimerId(taskId));
    },
    [stopTimer],
  );

  const stopTimerForMeeting = useCallback(
    async (meetingId: string) => {
      // Як і в завдань: похідний id дає запасний шлях, коли власний список
      // відстав від сховища (таймер запустили з іншого пристрою).
      const known = findTimerForMeeting(timersRef.current, meetingId);
      await stopTimer(known?.id ?? meetingTimerId(meetingId));
    },
    [stopTimer],
  );

  const value = useMemo<TimerContextValue>(
    () => ({
      pendingTask,
      setPendingTask,
      activeTimers,
      timersReady,
      startTaskTimer,
      startAdHocTimer,
      startMeetingTimer,
      stopTimer,
      stopTimerForTask,
      stopTimerForMeeting,
      getTimerForTask,
      getTimerForMeeting,
      tasksRevision,
      meetingsRevision,
      timeEntriesRevision,
    }),
    [
      pendingTask,
      activeTimers,
      timersReady,
      startTaskTimer,
      startAdHocTimer,
      startMeetingTimer,
      stopTimer,
      stopTimerForTask,
      stopTimerForMeeting,
      getTimerForTask,
      getTimerForMeeting,
      tasksRevision,
      meetingsRevision,
      timeEntriesRevision,
    ],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export const useTimerContext = () => useContext(TimerContext);
/**
 * Аліас для коду поверхонь поза екранами (store/android-surfaces.ts тощо —
 * watch-lockscreen-v1.md §10 називає хук саме так).
 */
export const useTimer = useTimerContext;
