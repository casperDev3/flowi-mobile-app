/**
 * store/ui-preferences.ts — які модулі інтерфейсу користувач вимкнув.
 *
 * Синхронізований singleton 'ui_preferences' (серверний контракт
 * core/sync_contract.py, SYNC_SINGLETON_KEYS у store/sync-contract.ts):
 * налаштування НА АКАУНТ, а не на пристрій. Саме тому воно тут, а не поруч
 * зі згорнутістю груп сайдбара (NavSidebar, локальний 'nav_collapsed_groups'):
 * згорнутість — вибір під конкретну діагональ екрана, а «цього модуля в мене
 * немає» — вибір про продукт, і його очікують побачити на всіх пристроях.
 *
 * Зберігається список ВИМКНЕНИХ, а не увімкнених. Різниця видна на наступному
 * релізі: модуль, якого ця збірка ще не знає, у списку вимкнених не значиться,
 * тобто новий розділ з'являється увімкненим, а не прихованим. Зворотний
 * варіант вимагав би дописувати кожен новий модуль у налаштування кожного
 * користувача — інакше він у них просто не з'явився б.
 *
 * Вимкнення НІЧОГО НЕ ВИДАЛЯЄ: дані модуля лишаються і на сервері, і в
 * локальному сховищі, синк їх і далі тягне. Ховається лише ВХІД — пункт
 * сайдбара, плитка дашборда, подія сповіщення. Увімкнув назад — усе на місці.
 *
 * Невідомі поля об'єкта зберігаються (parseUiPreferences копіює raw як базу):
 * новіший клієнт може писати сюди свої налаштування інтерфейсу, і старіша
 * збірка не має їх стирати першим же перемикачем.
 *
 * Сам перелік модулів живе в constants/nav.ts поруч із маніфестом сайдбара —
 * тут ідентифікатор лишається звичайним рядком навмисно: сховище не мусить
 * знати, які модулі бувають, щоб коректно зберегти чужий.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadData, subscribeToStorage } from './storage';
import { saveSyncedValue } from './synced-storage';

/** Ключ у сховищі й назва колекції в контракті — одне й те саме. */
export const UI_PREFERENCES_KEY = 'ui_preferences';

export interface StoredUiPreferences {
  version: number;
  /** Ідентифікатори вимкнених модулів. Невідомі цій збірці — теж лишаються. */
  disabledModules: string[];
  updatedAt?: string;
  /** Поля новіших клієнтів: читаємо як є, пишемо назад незмінними. */
  [key: string]: unknown;
}

export const UI_PREFERENCES_VERSION = 1;

export const emptyUiPreferences: StoredUiPreferences = Object.freeze({
  version: UI_PREFERENCES_VERSION,
  disabledModules: [],
}) as StoredUiPreferences;

/**
 * Привести збережене до придатного вигляду, НЕ втративши чужих полів.
 *
 * Будь-яке сміття в `disabledModules` (не масив, числа, дублі) трактується як
 * «нічого не вимкнено»: зіпсований запис має лишити застосунок повним, а не
 * сховати половину розділів.
 */
export function parseUiPreferences(raw: unknown): StoredUiPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyUiPreferences;
  const source = raw as Record<string, unknown>;
  const list = Array.isArray(source.disabledModules) ? source.disabledModules : [];
  const disabledModules = [
    ...new Set(list.filter((item): item is string => typeof item === 'string' && item.length > 0)),
  ];
  const version = typeof source.version === 'number' ? source.version : UI_PREFERENCES_VERSION;
  return { ...source, version, disabledModules };
}

/** Чи увімкнений модуль. Невідомий ідентифікатор — увімкнений (див. шапку). */
export function isModuleEnabled(disabled: readonly string[], moduleId: string | undefined): boolean {
  if (!moduleId) return true;
  return !disabled.includes(moduleId);
}

/**
 * Чи увімкнені ВСІ перелічені модулі.
 *
 * Потрібне там, де одна річ належить кільком модулям одразу: нагадування про
 * ліки — це і «Здоров'я», і «Профілактика» (на вебі вони окремі перемикачі, на
 * мобільному профілактика — вкладка хаба здоров'я). Вимкнення будь-якого з
 * них має ту саму дію, тож правило «показуємо, лише коли увімкнені всі» живе
 * тут, а не переписується ланцюжком `&&` у кожному викликачі.
 *
 * Порожній список — «нічого не вимагає», тобто завжди увімкнено: так системні
 * секції (без модуля) проходять через ту саму перевірку без окремої гілки.
 */
export function areModulesEnabled(
  disabled: readonly string[],
  modules: readonly string[],
): boolean {
  return modules.every(moduleId => isModuleEnabled(disabled, moduleId));
}

/**
 * Новий стан налаштувань після перемикання одного модуля.
 *
 * Чиста функція від ПОТОЧНОГО збереженого стану: викликач зобов'язаний узяти
 * його зі сховища, а не з рендера, інакше перемикач затре вибір, що приїхав
 * синком секунду тому.
 */
export function withModuleEnabled(
  current: StoredUiPreferences,
  moduleId: string,
  enabled: boolean,
  now: Date = new Date(),
): StoredUiPreferences {
  const disabled = current.disabledModules.filter(id => id !== moduleId);
  if (!enabled) disabled.push(moduleId);
  return {
    ...current,
    version: UI_PREFERENCES_VERSION,
    disabledModules: disabled,
    updatedAt: now.toISOString(),
  };
}

/**
 * Прочитати вимкнені модулі поза React — для дашборда, планувальника
 * сповіщень і будь-чого, що не рендерить компонент.
 */
export async function loadDisabledModules(): Promise<string[]> {
  const prefs = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
  cache = prefs;
  return prefs.disabledModules;
}

/**
 * Останнє прочитане значення на процес.
 *
 * Потрібне заради ПЕРШОГО кадру: без нього сайдбар малює повний перелік і
 * прибирає вимкнені пункти вже наступним кадром — тобто блимає тим, чого
 * користувач просив не показувати. З кешем блимання лишається рівно один раз
 * за запуск застосунку, до першого читання AsyncStorage.
 */
let cache: StoredUiPreferences | null = null;

export interface UiModulesState {
  disabledModules: string[];
  /** false, доки сховище ще не прочитане хоч раз за запуск. */
  ready: boolean;
  setModuleEnabled: (moduleId: string, enabled: boolean) => void;
}

export function useUiModules(): UiModulesState {
  const [prefs, setPrefs] = useState<StoredUiPreferences>(() => cache ?? emptyUiPreferences);
  const [ready, setReady] = useState(cache !== null);
  // Черга записів: два швидкі перемикачі поспіль мусять читати сховище
  // послідовно, інакше другий стартує зі стану ДО першого і скасує його.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const read = async () => {
      try {
        const next = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
        cache = next;
        if (!alive.current) return;
        setPrefs(next);
        setReady(true);
      } catch (e) {
        if (__DEV__) console.warn('[ui-preferences] не прочитались:', e);
      }
    };
    void read();
    // Ключ пишуть і повз цей хук: pull синхронізації з іншого пристрою,
    // екран налаштувань модулів, «очистити всі дані».
    const off = subscribeToStorage(key => {
      if (key === UI_PREFERENCES_KEY) void read();
    });
    return () => {
      alive.current = false;
      off();
    };
  }, []);

  const setModuleEnabled = useCallback((moduleId: string, enabled: boolean) => {
    // Оптимістично: перемикач мусить відреагувати в тому ж кадрі, що й дотик.
    setPrefs(prev => withModuleEnabled(prev, moduleId, enabled));
    queue.current = queue.current
      .then(async () => {
        const current = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
        const next = withModuleEnabled(current, moduleId, enabled);
        cache = next;
        await saveSyncedValue(UI_PREFERENCES_KEY, next);
      })
      .catch(e => {
        if (__DEV__) console.warn('[ui-preferences] не збереглись:', e);
      });
  }, []);

  return { disabledModules: prefs.disabledModules, ready, setModuleEnabled };
}
