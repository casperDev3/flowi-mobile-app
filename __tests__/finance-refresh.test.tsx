/**
 * __tests__/finance-refresh.test.tsx — екран мусить оновитись, поки він
 * ВІДКРИТИЙ.
 *
 * Скарга «фінанси не отримуються всі актуальні операції» лишалась живою навіть
 * після правок стрічки: єдиним шляхом перечитати 'transactions' був
 * useFocusEffect. Користувач тримає вкладку Фінансів відкритою, синхронізація
 * кладе прилетілу витрату прямо в сховище (saveData → notifyStorageChanged) —
 * і стрічка не змінюється НІКОЛИ, доки вкладка не втратить і не поверне фокус.
 *
 * Перевіряємо саме контракт «запис повз екран → перечитування», з двома
 * межами, без яких лікування гірше за хворобу:
 *   • власний запис екрана перечитування НЕ піднімає — інакше збереження
 *     стану ганяло б себе по колу;
 *   • після відмонтування підписник відчеплений.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import fs from 'fs';
import path from 'path';
import React from 'react';

import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { notifyStorageChanged, saveData } from '@/store/storage';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

type TrackWrite = <T>(write: () => Promise<T>) => Promise<T>;

function Probe({
  reload,
  enabled = true,
  onReady,
}: {
  reload: () => void;
  enabled?: boolean;
  onReady?: (track: TrackWrite) => void;
}) {
  const trackWrite = useStorageRefresh(['transactions', 'accounts'], reload, enabled);
  onReady?.(trackWrite);
  return null;
}

describe('useStorageRefresh — перечитування після запису повз екран', () => {
  test('чужий запис у наш ключ піднімає перечитування', () => {
    const reload = jest.fn();
    act(() => { create(<Probe reload={reload} />); });

    act(() => { notifyStorageChanged('transactions'); });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('запис у чужий ключ екран не смикає', () => {
    const reload = jest.fn();
    act(() => { create(<Probe reload={reload} />); });

    act(() => { notifyStorageChanged('tasks'); });

    expect(reload).not.toHaveBeenCalled();
  });

  test('поки екран не завантажився, перечитувати нічого', () => {
    const reload = jest.fn();
    act(() => { create(<Probe reload={reload} enabled={false} />); });

    act(() => { notifyStorageChanged('transactions'); });

    expect(reload).not.toHaveBeenCalled();
  });

  test('власний запис перечитування не піднімає', async () => {
    const reload = jest.fn();
    let track: TrackWrite = (async w => w()) as TrackWrite;
    act(() => { create(<Probe reload={reload} onReady={t => { track = t; }} />); });

    // saveData сам кличе notifyStorageChanged — це наш власний запис, і
    // перечитування відкотило б його назад.
    await act(async () => { await track(() => saveData('transactions', [])); });

    expect(reload).not.toHaveBeenCalled();

    // Після завершення запису екран знову слухає.
    act(() => { notifyStorageChanged('transactions'); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('після відмонтування підписник відчеплений', () => {
    const reload = jest.fn();
    let tree: any;
    act(() => { tree = create(<Probe reload={reload} />); });
    act(() => { tree.unmount(); });

    act(() => { notifyStorageChanged('transactions'); });

    expect(reload).not.toHaveBeenCalled();
  });
});

describe('екран Фінансів', () => {
  test('підписаний на зміни сховища, а не лише на фокус', () => {
    // Змонтувати сам екран у jest нереально (blur, reanimated, router), тож
    // перевіряємо саме те, чого бракувало: шлях оновитись без зміни фокуса.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', '(tabs)', 'explore.tsx'),
      'utf8',
    );
    expect(src).toContain('useStorageRefresh');
  });
});
