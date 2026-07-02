import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

import * as storage from '@/store/storage';
import { AppModeProvider, isOnlineMode, useAppMode } from '@/store/app-mode';

// Мок сховища — без AsyncStorage. loadData повертає кероване значення.
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(),
  saveData: jest.fn(async () => {}),
}));

const loadData = storage.loadData as unknown as jest.Mock;
const saveData = storage.saveData as unknown as jest.Mock;

// Захоплюємо значення хука для перевірок.
let api!: ReturnType<typeof useAppMode>;
function Probe() {
  api = useAppMode();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      <AppModeProvider>
        <Probe />
      </AppModeProvider>,
    );
  });
}

beforeEach(() => {
  saveData.mockClear();
  loadData.mockReset();
  loadData.mockResolvedValue('online'); // дефолт; окремі тести перевизначають
});

describe('app-mode (offline/online)', () => {
  test('за замовчуванням — онлайн', async () => {
    loadData.mockResolvedValue('online');
    await mount();
    expect(api.ready).toBe(true);
    expect(api.online).toBe(true);
    expect(isOnlineMode()).toBe(true);
  });

  test('збережений офлайн → online=false і isOnlineMode()=false', async () => {
    loadData.mockResolvedValue('offline');
    await mount();
    expect(api.online).toBe(false);
    expect(isOnlineMode()).toBe(false);
  });

  test('setOnline перемикає стан, модульний кеш і зберігає у сховище', async () => {
    loadData.mockResolvedValue('online');
    await mount();
    expect(api.online).toBe(true);

    await act(async () => { api.setOnline(false); });
    expect(api.online).toBe(false);
    expect(isOnlineMode()).toBe(false); // кеш для не-React гейтингу мережі
    expect(saveData).toHaveBeenCalledWith('app_mode', 'offline');

    await act(async () => { api.setOnline(true); });
    expect(api.online).toBe(true);
    expect(isOnlineMode()).toBe(true);
    expect(saveData).toHaveBeenCalledWith('app_mode', 'online');
  });
});
