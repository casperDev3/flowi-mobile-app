/**
 * __tests__/storage-refresh-missed.test.tsx — ЧУЖИЙ сигнал, що прилетів у
 * вікно власного запису, не губиться.
 *
 * `finance-refresh.test.tsx` поруч фіксує базовий контракт хука (чужий запис
 * піднімає перечитування, власний — ні). Тут — те, що з'явилось пізніше і чого
 * та перевірка не бачить: поки власний запис у польоті, сигнали ПРИГЛУШЕНІ, і
 * раніше чужий сигнал у цьому вікні просто відкидався разом зі своїм.
 *
 * Дефект з життя: користувач відмічає задачу (власний запис у `tasks`), рівно
 * в цю мить обмін проєкту дописує `sprints`. Сигнал `sprints` падав у те саме
 * вікно — і екран лишався зі старим списком спринтів до наступного фокуса.
 *
 * Два незалежні механізми, і тести нижче розділяють саме їх:
 *   • ЩО вважати своїм — другий аргумент `trackWrite(write, ownKeys)`;
 *   • КОЛИ програвати відкладене — після ОСТАННЬОГО з паралельних записів,
 *     не після першого, інакше перечитування відкотить те, що ще не в сховищі.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import React from 'react';

import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { notifyStorageChanged } from '@/store/storage';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

type TrackWrite = <T>(write: () => Promise<T>, ownKeys?: readonly string[]) => Promise<T>;

const KEYS = ['tasks', 'sprints', 'task_statuses'];

function mount(reload: (key: string) => void) {
  let track: TrackWrite = (async w => w()) as TrackWrite;
  function Probe() {
    track = useStorageRefresh(KEYS, reload);
    return null;
  }
  let tree: any;
  act(() => { tree = create(<Probe />); });
  return { track: ((w, own) => track(w, own)) as TrackWrite, tree };
}

/** Проміс, який тест відпускає вручну — так власний запис можна тримати «в польоті». */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('useStorageRefresh — пропущені сигнали програються після власного запису', () => {
  test('чужий ключ, що прилетів під час запису, перечитується ПІСЛЯ нього', async () => {
    const reload = jest.fn();
    const { track } = mount(reload);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; }, ['tasks']);

    // Обмін проєкту дописав спринти рівно в це вікно.
    act(() => { notifyStorageChanged('sprints'); });
    expect(reload).not.toHaveBeenCalled(); // поки запис не завершився — мовчимо

    await act(async () => { gate.resolve(); await inFlight; });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith('sprints');
  });

  test('ВЛАСНИЙ ключ у тому ж вікні лишається відкинутим — це наш же сигнал', async () => {
    const reload = jest.fn();
    const { track } = mount(reload);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; }, ['tasks']);
    act(() => { notifyStorageChanged('tasks'); });
    await act(async () => { gate.resolve(); await inFlight; });

    expect(reload).not.toHaveBeenCalled();
  });

  test('запис без ownKeys вважає своїми ВСІ прослуховувані ключі', async () => {
    // Поведінка за замовчуванням: екран, що не уточнив, чого торкається його
    // запис, не повинен раптом почати перечитувати себе після кожного збереження.
    const reload = jest.fn();
    const { track } = mount(reload);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; });
    act(() => {
      notifyStorageChanged('tasks');
      notifyStorageChanged('sprints');
      notifyStorageChanged('task_statuses');
    });
    await act(async () => { gate.resolve(); await inFlight; });

    expect(reload).not.toHaveBeenCalled();
  });

  test('кілька різних чужих ключів програються, кожен по разу', async () => {
    const reload = jest.fn();
    const { track } = mount(reload);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; }, ['tasks']);
    act(() => {
      notifyStorageChanged('sprints');
      notifyStorageChanged('sprints'); // дубль того самого ключа — перечитувати двічі нема сенсу
      notifyStorageChanged('task_statuses');
    });
    await act(async () => { gate.resolve(); await inFlight; });

    expect(reload.mock.calls.map(c => c[0]).sort()).toEqual(['sprints', 'task_statuses']);
  });

  test('ключ поза підпискою не відкладається й не програється', async () => {
    const reload = jest.fn();
    const { track } = mount(reload);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; }, ['tasks']);
    act(() => { notifyStorageChanged('transactions'); });
    await act(async () => { gate.resolve(); await inFlight; });

    expect(reload).not.toHaveBeenCalled();
  });

  test('два паралельні записи: відкладене програється після ОСТАННЬОГО', async () => {
    // Якби програвання висіло на завершенні першого, перечитування застало б
    // сховище посеред другого запису й відкотило б його назад на екрані.
    const reload = jest.fn();
    const { track } = mount(reload);
    const first = deferred();
    const second = deferred();

    const a = track(async () => { await first.promise; }, ['tasks']);
    const b = track(async () => { await second.promise; }, ['tasks']);

    act(() => { notifyStorageChanged('sprints'); });

    await act(async () => { first.resolve(); await a; });
    expect(reload).not.toHaveBeenCalled(); // другий ще в польоті

    await act(async () => { second.resolve(); await b; });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith('sprints');
  });

  test('запис, що впав, не лишає чергу замкненою назавжди', async () => {
    const reload = jest.fn();
    const { track } = mount(reload);

    await act(async () => {
      await expect(track(async () => { throw new Error('offline'); }, ['tasks'])).rejects.toThrow('offline');
    });

    // Лічильник записів у польоті мусить повернутись до нуля навіть через
    // виняток — інакше екран глухне до перемонтування.
    act(() => { notifyStorageChanged('sprints'); });
    expect(reload).toHaveBeenCalledWith('sprints');
  });

  test('відкладене перечитування, що впало, не валить сам запис', async () => {
    // Хук сам логує це попередження в dev — тут воно очікуване, тож глушимо,
    // щоб червоний стек у виводі не читався як справжня поломка.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = jest.fn(() => { throw new Error('reload boom'); });
    const { track } = mount(reload as unknown as (key: string) => void);
    const gate = deferred();

    const inFlight = track(async () => { await gate.promise; }, ['tasks']);
    act(() => { notifyStorageChanged('sprints'); });

    await act(async () => {
      gate.resolve();
      await expect(inFlight).resolves.toBeUndefined();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
