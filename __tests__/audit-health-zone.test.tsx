/**
 * __tests__/audit-health-zone.test.tsx — знахідки зони «Здоровʼя».
 *
 * Кожен блок падав би до правки:
 *  · ERR-10 — перемикач нагадування вмикався ще до планування і не дивився на
 *    результат: у сховищі стояло `{water:true}`, а в ОС — нічого.
 *  · ERR-01 — провалене читання `health_entries_v2` давало порожній стан, а
 *    ефект-дзеркало писало цей порожній масив назад.
 *  · ERR-14 — `querySum` ковтав помилку і віддавав 0, а екран під нулями
 *    писав «Синхронізується з HealthKit».
 *  · NAT-13 / L9 — плитка хабу не відкривалась звичайним тапом і мала зашиту
 *    висоту 112pt під `overflow:'hidden'`.
 *  · NAT-18 — «назад» у Тренуваннях 20×20 з hitSlop 8.
 *  · I18N-07 — звіт для лікаря завжди українською.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

// ── Моки нативних залежностей ────────────────────────────────────────────────

const mockStore = new Map<string, string>();
let mockFailGet = new Set<string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (mockFailGet.has(k)) throw new Error('CursorWindow: Row too big');
    return mockStore.has(k) ? mockStore.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

const mockScheduleDaily = jest.fn<Promise<boolean>, any[]>(async () => true);
const mockScheduleWeekly = jest.fn<Promise<boolean>, any[]>(async () => true);
const mockCancelDaily = jest.fn(async () => {});

jest.mock('@/store/notifications', () => ({
  scheduleDailyReminder: (...a: any[]) => mockScheduleDaily(...a),
  scheduleWeeklyReminder: (...a: any[]) => mockScheduleWeekly(...a),
  cancelDailyReminder: () => mockCancelDaily(),
}));

const mockSaveSynced = jest.fn(async () => {});
const mockSaveSyncedValue = jest.fn(async () => {});
jest.mock('@/store/synced-storage', () => ({
  saveSynced: (...a: any[]) => mockSaveSynced(...(a as [])),
  saveSyncedValue: (...a: any[]) => mockSaveSyncedValue(...(a as [])),
}));

// HealthKit у цих тестах недоступний: гілка HK не має впливати на сховище.
jest.mock('@/store/healthkit', () => ({
  HK_AVAILABLE: false,
  fetchTodayDataResult: jest.fn(async () => ({
    data: {},
    outcome: { ok: false, queries: 0, failures: 0 },
  })),
  getHealthKitAccess: jest.fn(async () => 'unavailable'),
  initHealthKit: jest.fn(async () => false),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: () => {},
  usePathname: () => '/',
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

import React from 'react';
import { TouchableOpacity } from 'react-native';

import { HubTile } from '@/components/health/HubTile';
import { healthKitStatusText } from '@/components/health/HealthNotices';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { clearStorageReadFailure } from '@/store/storage';
import { buildHealthReport, UK_HEALTH_REPORT_LABELS } from '@/utils/preventionUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function flat(style: any): any {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style ?? {};
}

/** Монтує хук у порожньому компоненті й віддає останнє його значення. */
function mountHook() {
  const out: { current: ReturnType<typeof useHealthEntries> | null } = { current: null };
  function Probe() {
    out.current = useHealthEntries();
    return null;
  }
  let tree: any;
  act(() => { tree = create(<Probe />); });
  return { out, unmount: () => act(() => tree.unmount()) };
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  mockStore.clear();
  mockFailGet = new Set();
  jest.clearAllMocks();
  mockScheduleDaily.mockResolvedValue(true);
  mockScheduleWeekly.mockResolvedValue(true);
  clearStorageReadFailure('health_entries_v2');
});

// ── ERR-10 ───────────────────────────────────────────────────────────────────

describe('ERR-10 — перемикач нагадування не вмикається без реального нагадування', () => {
  it('відмова планувальника: перемикач лишається OFF і нічого не пишеться', async () => {
    mockScheduleDaily.mockResolvedValue(false); // дозволу ОС немає / тумблер вимкнено
    const { out, unmount } = mountHook();
    await flush();

    let result: boolean | undefined;
    await act(async () => { result = await out.current!.setReminder('water', true, 'Вода', 'Пий воду'); });

    expect(result).toBe(false);
    // Головне: стан НЕ каже «увімкнено»…
    expect(out.current!.reminders.water).toBe(false);
    // …і в сховище нічого не поїхало (до правки тут був {water:true}).
    expect(mockSaveSyncedValue).not.toHaveBeenCalled();
    unmount();
  });

  it('успіх: спершу планування, потім стан і запис', async () => {
    const { out, unmount } = mountHook();
    await flush();

    await act(async () => { await out.current!.setReminder('water', true, 'Вода', 'Пий воду'); });

    expect(mockScheduleDaily).toHaveBeenCalledTimes(1);
    expect(out.current!.reminders.water).toBe(true);
    expect(mockSaveSyncedValue).toHaveBeenCalledWith('health_reminders', expect.objectContaining({ water: true }));
    unmount();
  });

  it('вимкнення працює завжди — скасування не залежить від дозволу', async () => {
    mockScheduleDaily.mockResolvedValue(false);
    const { out, unmount } = mountHook();
    await flush();

    await act(async () => { await out.current!.setReminder('water', false, 'Вода', 'Пий воду'); });

    expect(mockCancelDaily).toHaveBeenCalled();
    expect(mockSaveSyncedValue).toHaveBeenCalledWith('health_reminders', expect.objectContaining({ water: false }));
    unmount();
  });
});

// ── ERR-01 ───────────────────────────────────────────────────────────────────

describe('ERR-01 — провалене читання записів здоровʼя ≠ «записів немає»', () => {
  it('збій читання: loadFailed, initialized false, автозапису немає', async () => {
    mockStore.set('health_entries_v2', '{{{ не JSON');
    const { out, unmount } = mountHook();
    await flush();

    expect(out.current!.loadFailed).toBe(true);
    expect(out.current!.initialized).toBe(false);
    expect(out.current!.entries).toEqual([]);
    // Саме цей виклик і знищував дані: [] зі стану поверх нечитаних байтів.
    expect(mockSaveSynced).not.toHaveBeenCalled();
    unmount();
  });

  it('«Повторити» після відновлення читання вмикає збереження', async () => {
    mockStore.set('health_entries_v2', '{{{ не JSON');
    const { out, unmount } = mountHook();
    await flush();
    expect(out.current!.loadFailed).toBe(true);

    mockStore.set('health_entries_v2', JSON.stringify([{ id: '1', type: 'water', value: 250, date: new Date().toISOString() }]));
    await act(async () => { await out.current!.retryLoad(); });

    expect(out.current!.loadFailed).toBe(false);
    expect(out.current!.initialized).toBe(true);
    expect(out.current!.entries).toHaveLength(1);
    unmount();
  });

  it('успішне читання: звичайний шлях не змінився', async () => {
    mockStore.set('health_entries_v2', JSON.stringify([]));
    const { out, unmount } = mountHook();
    await flush();
    expect(out.current!.loadFailed).toBe(false);
    expect(out.current!.initialized).toBe(true);
    unmount();
  });
});

// ── ERR-14 ───────────────────────────────────────────────────────────────────

describe('ERR-14 — «немає доступу» відрізняється від «нуль»', () => {
  it('відмовлений доступ пропонує його надати, а не пише «синхронізується»', () => {
    const denied = healthKitStatusText('uk', { available: true, access: 'denied', failed: false });
    expect(denied.action).toBe('grant');
    expect(denied.text).not.toMatch(/Синхронізується/);
  });

  it('збій читання пропонує повтор', () => {
    const failed = healthKitStatusText('uk', { available: true, access: 'granted', failed: true });
    expect(failed.action).toBe('retry');
  });

  it('усе гаразд — підпис про синхронізацію і жодної кнопки', () => {
    const ok = healthKitStatusText('uk', { available: true, access: 'granted', failed: false });
    expect(ok.action).toBeNull();
    expect(ok.text).toMatch(/HealthKit/);
  });

  it('модуль є у збірці, але доступ відмовлено — це НЕ «синхронізується»', () => {
    // Рівно та підміна, на якій тримався дефект: екран перевіряв available.
    const available = true;
    expect(healthKitStatusText('en', { available, access: 'denied', failed: false }).text)
      .not.toEqual(healthKitStatusText('en', { available, access: 'granted', failed: false }).text);
  });
});

// ── NAT-13 / L9 ──────────────────────────────────────────────────────────────

describe('NAT-13 / L9 — плитка розділу Здоровʼя', () => {
  function renderTile(onPress = jest.fn()) {
    let tree: any;
    act(() => {
      tree = create(
        <HubTile title="Звички" icon="star.fill" color="#F59E0B" stat="1/3"
          onPress={onPress} isDark={false} border="#eee" text="#111" sub="#666" />,
      );
    });
    return { tree, onPress };
  }

  it('відкривається звичайним тапом', () => {
    const { tree, onPress } = renderTile();
    const touchables = tree.root.findAllByType(TouchableOpacity);
    expect(touchables.length).toBeGreaterThan(0);
    act(() => { touchables[0].props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('має роль і імʼя для VoiceOver', () => {
    const { tree } = renderTile();
    const btn = tree.root.findAllByType(TouchableOpacity)[0];
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.accessibilityLabel).toContain('Звички');
    act(() => tree.unmount());
  });

  it('висота не зашита: коробка росте під збільшений шрифт', () => {
    const { tree } = renderTile();
    const boxes = tree.root
      .findAll((n: any) => typeof n.type === 'string' || n.type === 'BlurView')
      .map((n: any) => flat(n.props?.style));
    expect(boxes.some((st: any) => st.minHeight === 112)).toBe(true);
    expect(boxes.some((st: any) => st.height === 112)).toBe(false);
    act(() => tree.unmount());
  });
});

// ── NAT-18 / L5 — за вихідним кодом ─────────────────────────────────────────

describe('NAT-18 — «назад» у Тренуваннях дотягує до 44×44', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/workouts.tsx'), 'utf8');

  it('рамка 36×36 плюс hitSlop, а не гола іконка 20pt', () => {
    expect(src).toMatch(/accessibilityLabel=\{tr\.back\}[\s\S]{0,200}?width: 36, height: 36/);
    expect(src).toMatch(/hitSlop=\{\{ top: 10, bottom: 10, left: 4, right: 4 \}\}/);
  });
});

describe('L5 — FAB Здоровʼя рахує панель активних таймерів', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/(tabs)/health.tsx'), 'utf8');

  it('bottom береться з useTabBarInset(), а не з числа 108', () => {
    expect(src).toMatch(/s\.fabContainer, \{ bottom: tabBarInset \+ 20 \}/);
    expect(src).not.toMatch(/bottom: Platform\.OS === 'ios' \? 108 : 88/);
  });
});

// ── I18N-07 ─────────────────────────────────────────────────────────────────

describe('I18N-07 — звіт для лікаря говорить мовою інтерфейсу', () => {
  const data = {
    meds: [], checkups: [], vaccines: [],
    latestWeight: 71, bmi: 22.1, todayPulse: 72,
  };

  it('англійські підписи не лишають кирилиці', () => {
    const text = buildHealthReport({
      ...data,
      locale: 'en-US',
      labels: {
        title: 'HEALTH SUMMARY', weight: 'Weight', bmi: 'BMI', pulse: 'Pulse',
        unitKg: 'kg', unitBpm: 'bpm', meds: 'Meds', adherence: 'adherence',
        checkups: 'Checkups', vaccines: 'Vaccines', dose: 'dose',
        generatedBy: 'Generated in Flowi',
      },
    });
    expect(text).not.toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
    expect(text).toContain('Weight: 71 kg');
    expect(text).toContain('Pulse: 72 bpm');
  });

  it('без labels поведінка не змінилась — українська як була', () => {
    const text = buildHealthReport({ ...data, locale: 'uk-UA' });
    expect(text).toContain(UK_HEALTH_REPORT_LABELS.title);
    expect(text).toContain('Вага: 71 кг');
  });
});

// ── NAT-14 / NAT-03 — за вихідним кодом ─────────────────────────────────────

describe('NAT-14 — екрани-аркуші профілактики заповнюють аркуш', () => {
  const SHEET_SCREENS = [
    'app/health-habits.tsx',
    'app/health-meds.tsx',
    'app/health-vaccines.tsx',
    'app/health-checkups.tsx',
  ];

  it.each(SHEET_SCREENS)('%s — корінь має minHeight від вікна, а не лише flex:1', (file) => {
    // У formSheet корінь RN не отримує визначеної висоти: `flex: 1`
    // схлопувався до висоти вмісту, і нижні дві третини аркуша лишались
    // прозорими — крізь них було видно хаб Здоровʼя з таб-баром.
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/useSheetScreenMinHeight/);
    expect(src).toMatch(/<View style=\{\{ flex: 1, minHeight: sheetScreenMinHeight \}\}>/);
  });
});

describe('NAT-03 — аркуш історії на хабі не склеюється в один елемент', () => {
  it('Pressable-обгортка має accessible={false} і зберігає ізоляцію фону', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/(tabs)/health.tsx'), 'utf8');
    const wrappers = (src.match(/<Pressable(?:[^>]|(?<==)>)*>/g) ?? [])
      .filter((w) => w.includes('stopPropagation'));
    expect(wrappers.length).toBeGreaterThan(0);
    for (const w of wrappers) {
      expect(w).toMatch(/accessible=\{false\}/);
      expect(w).toMatch(/accessibilityViewIsModal/);
    }
  });
});
