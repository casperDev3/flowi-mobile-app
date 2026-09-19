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
import { AppState } from 'react-native';

import { ensureStorageMigrations } from './migrations';
import { loadData, subscribeToStorage } from './storage';
import { updateSynced } from './synced-storage';
import {
  adHocTimerId,
  findTimerForTask,
  shiftForDate,
  sortTimers,
  taskTimerId,
  type ActiveTimer,
  type Shift,
} from '@/utils/activeTimers';
import {
  buildMeetingTimer,
  closeMeetingSession,
  findTimerForMeeting,
  meetingTimerId,
  type Meeting,
} from '@/utils/meetings';
import { IN_PROGRESS_COLUMN_ID, REVIEW_COLUMN_ID } from '@/utils/taskStatuses';
import type { Task, TaskHistoryEvent, HistoryEventType } from '@/utils/taskUtils';

const TIMERS_KEY = 'active_timers';
const TASKS_KEY = 'tasks';
const MEETINGS_KEY = 'meetings';
const TIME_ENTRIES_KEY = 'time_entries';

/** Запис дзеркала у 'time_entries' — форма, якої чекають time-stats/time-records. */
interface MirroredTimeEntry {
  id: string;
  task: string;
  shift: Shift;
  duration: number;
  date: string;
  /** Проєкт сесії (WORKSPACE_PROJECTS_PLAN §3 «години за тиждень» на Огляді). */
  projectId?: string;
}

/** Мінімум, потрібний сторy для старту: решту полів завдання він не читає. */
export interface TimerTaskInput {
  id: string;
  title: string;
  kanbanColumnId?: string;
  status: 'active' | 'done';
  projectId?: string;
}

/**
 * Мінімум, потрібний для старту таймера наради.
 *
 * Колонки й статусу тут немає й не може бути: наради не живуть на дошці, тож
 * старт нікуди її не пересуває, а стоп нікуди не повертає. Це не спрощення
 * заради стислості — це вся різниця між двома видами таймера.
 */
export interface TimerMeetingInput {
  id: string;
  title: string;
}

export interface TimerContextValue {
  pendingTask: string;
  setPendingTask: (task: string) => void;

  activeTimers: ActiveTimer[];
  /** false, доки сховище не прочитане: до цього «немає таймерів» — брехня. */
  timersReady: boolean;
  startTaskTimer: (task: TimerTaskInput) => Promise<void>;
  startAdHocTimer: (label: string, shift: Shift) => Promise<void>;
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

function makeHistoryEvent(type: HistoryEventType, note?: string): TaskHistoryEvent {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    type,
    note,
  };
}

function elapsedSeconds(startedAt: string, now: number): number {
  // Годинник пристрою може зʼїхати назад (зміна поясу, ручне переведення) —
  // відʼємна тривалість сесії зіпсувала б усю статистику часу.
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** Реєстр, як він лежить у сховищі просто зараз. Биті записи відкидаємо. */
async function readStoredTimers(): Promise<ActiveTimer[]> {
  const stored = await loadData<ActiveTimer[]>(TIMERS_KEY, []);
  const usable = Array.isArray(stored) ? stored.filter(t => t?.id && t.startedAt) : [];
  return sortTimers(usable);
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
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

  /**
   * Read-modify-write реєстру: мутація рахується від СХОВИЩА, не від власного
   * стану.
   *
   * Стан провайдера систематично відстає від сховища, і це не помилка окремого
   * місця, а норма: рушій синхронізації застосовує чужі записи прямо в ключ
   * (saveData повз наш стан), міграція дописує туди перенесений таймер,
   * відновлення бекапу підмінює ключ цілком, «очистити все» його стирає. Якби
   * ми зібрали повний масив зі свого застарілого списку, saveSynced віддифив
   * би його проти сховища, побачив чужий таймер як зниклий — і видалив би його
   * локально та відправив delete на сервер. Тобто старт власного таймера вбивав
   * би таймер, що йде на іншому пристрої.
   */
  const mutateTimers = useCallback(
    async (mutate: (current: ActiveTimer[]) => ActiveTimer[]) => {
      writesInFlight.current += 1;
      try {
        // Читання й запис — одна операція під блокуванням ключа, інакше pull,
        // що ліг між ними, пішов би на сервер як DELETE.
        await updateSynced<ActiveTimer>(TIMERS_KEY, raw => {
          const current = sortTimers(raw.filter(t => t?.id && t.startedAt));
          const mutated = mutate(current);
          const next = sortTimers(mutated);
          timersRef.current = next;
          setActiveTimers(next);
          // mutate повернув той самий масив — робити нічого, але свіжий стан зі
          // сховища ми вже підхопили.
          return mutated === current ? raw : next;
        });
      } catch (e) {
        // Мовчки ковтати не можна: таймер лишиться на екрані, але не переживе
        // перезапуск, і причина має бути видимою.
        if (__DEV__) console.warn('[timers] запис active_timers не вдався:', e);
      } finally {
        writesInFlight.current -= 1;
      }
    },
    [],
  );

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

  const getTimerForTask = useCallback(
    (taskId: string) => findTimerForTask(timersRef.current, taskId),
    [],
  );

  const getTimerForMeeting = useCallback(
    (meetingId: string) => findTimerForMeeting(timersRef.current, meetingId),
    [],
  );

  /**
   * Read-modify-write 'tasks' — наявна конвенція репозиторію (так само роблять
   * archive.tsx, subtasks.tsx, today.tsx). Стор не має власного стану завдань,
   * а екран, з якого прийшов виклик, може бути навіть не змонтованим.
   */
  const patchTask = useCallback(
    async (taskId: string, patch: (task: Task) => Task) => {
      try {
        // Читання, патч і запис — одна операція під блокуванням ключа: pull,
        // що встиг би лягти між loadData і saveSynced, пішов би на сервер як DELETE.
        let found = false;
        await updateSynced<Task>(TASKS_KEY, tasks => {
          const index = tasks.findIndex(t => t.id === taskId);
          if (index < 0) return tasks;
          found = true;
          const next = [...tasks];
          next[index] = patch(tasks[index]);
          return next;
        });
        if (found) setTasksRevision(n => n + 1);
      } catch (e) {
        if (__DEV__) console.warn(`[timers] запис 'tasks' не вдався (${taskId}):`, e);
      }
    },
    [],
  );

  /**
   * Read-modify-write 'meetings' — дзеркало patchTask.
   *
   * Окремий прохід по сховищу, а не спільна функція із завданнями: ключі різні,
   * а спроба узагальнити «патч запису в масиві» дала б параметризовану функцію,
   * яку однаково довелось би читати з обома ключами в голові.
   */
  const patchMeeting = useCallback(
    async (meetingId: string, patch: (meeting: Meeting) => Meeting) => {
      try {
        let found = false;
        await updateSynced<Meeting>(MEETINGS_KEY, meetings => {
          const index = meetings.findIndex(m => m.id === meetingId);
          // Нараду могли видалити, поки таймер ішов. Сесії немає куди класти —
          // але в 'time_entries' вона все одно потрапить, тож час не зникне.
          if (index < 0) return meetings;
          found = true;
          const next = [...meetings];
          next[index] = patch(meetings[index]);
          return next;
        });
        if (found) setMeetingsRevision(n => n + 1);
      } catch (e) {
        if (__DEV__) console.warn(`[timers] запис 'meetings' не вдався (${meetingId}):`, e);
      }
    },
    [],
  );

  /** Дзеркало завершеної сесії для екранів часу — вони читають лише 'time_entries'. */
  const mirrorToTimeEntries = useCallback(
    async (timer: ActiveTimer, duration: number, endedAt: Date) => {
      if (duration <= 0) return;
      try {
        const entry: MirroredTimeEntry = {
          id: `timer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          task: timer.label,
          shift: timer.shift,
          duration,
          date: endedAt.toISOString(),
          projectId: timer.projectId,
        };
        await updateSynced<MirroredTimeEntry>(TIME_ENTRIES_KEY, existing => [entry, ...existing]);
        setTimeEntriesRevision(n => n + 1);
      } catch (e) {
        if (__DEV__) console.warn('[timers] дзеркало у time_entries не вдалося:', e);
      }
    },
    [],
  );

  const startTaskTimer = useCallback(
    async (task: TimerTaskInput) => {
      // Завершене завдання не трекають: сесія на ньому нікуди не веде, а
      // колонку done автоматика чіпати не сміє.
      if (task.status === 'done') return;

      const now = new Date();

      const timer: ActiveTimer = {
        id: taskTimerId(task.id),
        taskId: task.id,
        label: task.title,
        startedAt: now.toISOString(),
        shift: shiftForDate(now),
        projectId: task.projectId,
      };

      let created = false;
      await mutateTimers(current => {
        // Перевірка на СВІЖОМУ списку: таймер на це завдання міг зʼявитися з
        // іншого пристрою. Другий запис створив би дубль, який неможливо
        // зупинити разом.
        if (findTimerForTask(current, task.id)) return current;
        created = true;
        return [...current, timer];
      });
      // Таймер уже йшов — історію та колонку чіпати не за що.
      if (!created) return;

      await patchTask(task.id, t => ({
        ...t,
        // Старт ЗАВЖДИ переводить у «У процесі», з якої б колонки завдання не
        // прийшло. Робота почалась — і на дошці це має бути видно однаково,
        // незалежно від того, чи лежало завдання в «До роботи», чи у власній
        // колонці користувача.
        kanbanColumnId: IN_PROGRESS_COLUMN_ID,
        history: [...(t.history ?? []), makeHistoryEvent('timer_start')],
      }));
    },
    [mutateTimers, patchTask],
  );

  const startAdHocTimer = useCallback(
    async (label: string, shift: Shift) => {
      const now = new Date();
      const timer: ActiveTimer = {
        id: adHocTimerId(),
        label,
        startedAt: now.toISOString(),
        // Зміну для вільного таймера обирає користувач вручну — тому вона
        // приходить пропом, а не рахується з годинника.
        shift,
      };
      await mutateTimers(current => [...current, timer]);
    },
    [mutateTimers],
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
      const timer = buildMeetingTimer(meeting);
      await mutateTimers(current =>
        findTimerForMeeting(current, meeting.id) ? current : [...current, timer],
      );
    },
    [mutateTimers],
  );

  const stopTimer = useCallback(
    async (id: string) => {
      const endedAt = new Date();

      // 1. Прибрати з реєстру — після цього таймер більше ніде не «йде».
      //    Джерело правди про сесію — сховище, а не власний стан: він міг
      //    відстати, і тоді ми або не знайшли б живий таймер, або записали б
      //    сесію, яку вже записав інший пристрій.
      let removed: ActiveTimer | undefined;
      await mutateTimers(current => {
        removed = current.find(t => t.id === id);
        if (!removed) return current;
        return current.filter(t => t.id !== id);
      });
      // Таймера в сховищі немає — його вже зупинили деінде, і сесія там
      // записана. Другий запис дав би дубль у завданні та в 'time_entries'.
      const timer = removed;
      if (!timer) return;

      const duration = elapsedSeconds(timer.startedAt, endedAt.getTime());

      // 2. Завершена сесія переїжджає в timeEntries завдання. endedAt тут є
      //    ЗАВЖДИ: відкритих записів у timeEntries більше не буває.
      if (timer.taskId) {
        await patchTask(timer.taskId, t => ({
          ...t,
          // Зупинка ЗАВЖДИ переводить у «На перевірці»: робота скінчилась, але
          // результат ще не приймали. Пара «старт → у процесі, стоп → на
          // перевірці» мусить працювати однаково з будь-якого місця, тож
          // винятків за колонкою тут немає.
          //
          // Єдиний виняток — завершене завдання. «Готово» САМО зупиняє таймер,
          // і цей запис прилітає сюди вже ПІСЛЯ того, як екран переставив
          // завдання в «Готово»; безумовний перенос скасував би щойно
          // завершену роботу й повернув її на дошку.
          kanbanColumnId: t.status === 'done' ? t.kanbanColumnId : REVIEW_COLUMN_ID,
          timeEntries: [
            ...(t.timeEntries ?? []),
            {
              id: `${timer.id}-${endedAt.getTime().toString(36)}`,
              startedAt: timer.startedAt,
              endedAt: endedAt.toISOString(),
              duration,
            },
          ],
          history: [...(t.history ?? []), makeHistoryEvent('timer_stop')],
        }));
      }

      // 2б. Сесія наради лягає в timeEntries САМОЇ наради — та сама структура,
      //     що в завдання. Колонки дошки в наради немає, тож увесь блок вище
      //     (перенос у «На перевірці», історія) до неї не застосовується: не
      //     через недогляд, а тому, що переносити нема куди.
      if (timer.meetingId) {
        await patchMeeting(timer.meetingId, m =>
          closeMeetingSession(m, timer, endedAt, duration),
        );
      }

      // 3. Дзеркало для екранів часу.
      await mirrorToTimeEntries(timer, duration, endedAt);
    },
    [mutateTimers, mirrorToTimeEntries, patchTask, patchMeeting],
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
