/**
 * __tests__/subscriptions-screen.test.tsx — екран підписок на підробленому сховищі.
 *
 * Перевіряємо безпеку даних, а не верстку:
 *  - «Продовжено» зсуває дату й дописує історію, НЕ чіпаючи транзакцій;
 *  - запис — read-modify-write: підписка, що прийшла синком повз екран, не
 *    видаляється, а невідомі поля запису (від іншого клієнта) лишаються;
 *  - архів / відновлення міняють лише archivedAt;
 *  - деталь проєкту показує секцію «Підписки» з місячною сумою.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: mockPush, setParams: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));
jest.mock('@/store/notifications', () => ({
  rescheduleSubscriptionRemindersFromStorage: jest.fn(async () => {}),
}));
jest.mock('@/components/shared/SheetModal', () => ({
  SheetModal: ({ visible, children }: { visible: boolean; children: any }) => (visible ? children : null),
}));

import React from 'react';
import { Alert } from 'react-native';

import ProjectBudgetScreen from '@/app/project/[id]/budget';
import SubscriptionsScreen from '@/app/subscriptions';
import { UpcomingPaymentsCard } from '@/components/finance/UpcomingPaymentsCard';
import { BUILTIN_CURRENCIES } from '@/utils/financeUtils';
import { allTranslations } from '@/store/translations';
import { dateKeyOf, addDaysKey, upcomingPayments } from '@/utils/subscriptions';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const TODAY = dateKeyOf(new Date());
const NOW = '2026-09-01T10:00:00.000Z';

const NETFLIX = {
  id: 'sub-a', name: 'Netflix', amount: 10, currency: 'USD', period: { every: 1, unit: 'month' },
  nextPaymentDate: addDaysKey(TODAY, -2), reminderDaysBefore: 1, icon: 'tv.fill', color: '#EF4444',
  history: [], createdAt: NOW, updatedAt: NOW, fromNewerClient: { keep: true },
};
const SPOTIFY = {
  id: 'sub-b', name: 'Spotify', amount: 5, currency: 'USD', period: { every: 1, unit: 'month' },
  nextPaymentDate: addDaysKey(TODAY, 10), reminderDaysBefore: 1, icon: 'music.note', color: '#10B981',
  history: [], createdAt: NOW, updatedAt: NOW,
};
const TX = [{ id: 'tx1', type: 'expense', category: 'Їжа', amount: 100, note: '', date: NOW, accountId: 'a1' }];

function seed(data: Record<string, unknown>) {
  mockStore.clear();
  for (const [k, v] of Object.entries(data)) mockStore.set(k, JSON.stringify(v));
}
const read = <T,>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null');
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function allText(tree: any): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out.join('|');
}

function pressByLabel(tree: any, label: string) {
  const nodes = tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  if (nodes.length === 0) throw new Error(`немає кнопки «${label}»`);
  return act(async () => { nodes[0].props.onPress(); });
}

let mounted: any = null;
async function mount() {
  let tree: any;
  await act(async () => { tree = create(<SubscriptionsScreen />); });
  mounted = tree;
  await flush();
  return tree;
}

afterEach(async () => {
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
  mockParams = {};
  mockPush.mockReset();
  jest.restoreAllMocks();
});

test('прострочена підписка позначена, підсумки — за валютою', async () => {
  seed({ subscriptions: [NETFLIX, SPOTIFY] });
  const tree = await mount();
  const text = allText(tree);
  expect(text).toContain('Netflix');
  expect(text).toContain(tr.subOverdue);
  expect(text).toContain(tr.subPerMonth);
});

test('«Продовжено»: новий цикл і історія; транзакції й чужі записи не зачеплені', async () => {
  seed({ subscriptions: [NETFLIX], transactions: TX });
  const tree = await mount();

  // Синк повз екран дописав ще одну підписку — стан екрана про неї не знає.
  mockStore.set('subscriptions', JSON.stringify([NETFLIX, SPOTIFY]));

  await pressByLabel(tree, `${tr.subRenew}: Netflix`);
  const input = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.subRenewAmount && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('12,5'); });
  await pressByLabel(tree, tr.subRenewConfirm);
  await flush();

  const stored = read<any[]>('subscriptions');
  expect(stored.map(s => s.id).sort()).toEqual(['sub-a', 'sub-b']);
  const netflix = stored.find(s => s.id === 'sub-a');
  expect(netflix.history).toHaveLength(1);
  expect(netflix.history[0]).toMatchObject({ date: NETFLIX.nextPaymentDate, amount: 12.5, currency: 'USD' });
  expect(netflix.amount).toBe(12.5);
  expect(netflix.nextPaymentDate > NETFLIX.nextPaymentDate).toBe(true);
  expect(netflix.fromNewerClient).toEqual({ keep: true });
  // Жодних фінансових операцій.
  expect(read('transactions')).toEqual(TX);
  // Outbox містить лише зміну sub-a (нова sub-b прийшла синком і вже в сховищі).
  const outbox = read<any[]>('sync_outbox') ?? [];
  expect(outbox.filter(o => o.collection === 'subscriptions' && o.deleted)).toEqual([]);
  expect(outbox.some(o => o.collection === 'subscriptions' && o.local_id === 'sub-a' && !o.deleted)).toBe(true);
});

test('архів і відновлення міняють лише archivedAt', async () => {
  seed({ subscriptions: [SPOTIFY] });
  const tree = await mount();
  await pressByLabel(tree, 'Spotify');
  await pressByLabel(tree, tr.subArchiveAction);
  await flush();
  let stored = read<any[]>('subscriptions');
  expect(typeof stored[0].archivedAt).toBe('string');
  expect(stored[0].nextPaymentDate).toBe(SPOTIFY.nextPaymentDate);

  await pressByLabel(tree, tr.restore);
  await flush();
  stored = read<any[]>('subscriptions');
  expect('archivedAt' in stored[0]).toBe(false);
  expect(stored[0].history).toEqual([]);
});

test('створення з форми додає запис, не видаляючи наявні', async () => {
  seed({ subscriptions: [SPOTIFY] });
  const tree = await mount();
  await pressByLabel(tree, tr.subNew);
  await flush();
  const nameInput = tree.root.findAll((n: any) => n.props?.placeholder === tr.subNamePlaceholder && typeof n.props.onChangeText === 'function')[0];
  const amountInput = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.subAmountPerCycle && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { nameInput.props.onChangeText('iCloud'); });
  await act(async () => { amountInput.props.onChangeText('2.99'); });
  await pressByLabel(tree, tr.save);
  await flush();

  const stored = read<any[]>('subscriptions');
  expect(stored).toHaveLength(2);
  const created = stored.find(s => s.name === 'iCloud');
  expect(created).toMatchObject({ amount: 2.99, period: { every: 1, unit: 'month' }, reminderDaysBefore: 1, history: [] });
  expect(created.id).toMatch(/^sub-/);
});

test('правка: синк під час відкритої форми не відкочується, невідома історія лишається', async () => {
  seed({ subscriptions: [SPOTIFY] });
  const tree = await mount();
  await pressByLabel(tree, 'Spotify');
  await pressByLabel(tree, tr.edit);
  // телефон: деталь закривається, форма відкривається через 300 мс
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });

  // Тим часом на вебі натиснули «Продовжено» (і інший клієнт має запис історії іншої форми).
  const renewedDate = addDaysKey(SPOTIFY.nextPaymentDate, 30);
  const renewed = {
    ...SPOTIFY,
    amount: 6,
    nextPaymentDate: renewedDate,
    billingDay: 7,
    history: [{ when: 'unknown-shape' }, { date: SPOTIFY.nextPaymentDate, amount: 6, currency: 'USD' }],
  };
  mockStore.set('subscriptions', JSON.stringify([renewed]));

  const nameInput = tree.root.findAll((n: any) => n.props?.placeholder === tr.subNamePlaceholder && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { nameInput.props.onChangeText('Spotify Family'); });
  await pressByLabel(tree, tr.save);
  await flush();

  const stored = read<any[]>('subscriptions');
  expect(stored).toHaveLength(1);
  expect(stored[0].name).toBe('Spotify Family');
  expect(stored[0].nextPaymentDate).toBe(renewedDate);
  expect(stored[0].amount).toBe(6);
  expect(stored[0].billingDay).toBe(7);
  expect(stored[0].history).toEqual(renewed.history);
});

test('простір проєкту → Бюджет: секція «Підписки» з місячною сумою; архівні не показуються', async () => {
  const PROJECT = { id: 'p1', name: 'Сайт', color: '#EF4444', createdAt: NOW };
  seed({
    projects: [PROJECT],
    tasks: [],
    subscriptions: [
      { ...SPOTIFY, projectId: 'p1' },
      { ...NETFLIX, id: 'sub-old', name: 'Старий хостинг', projectId: 'p1', archivedAt: NOW },
      { ...NETFLIX, id: 'sub-other', name: 'Чужий', projectId: 'p2' },
    ],
  });
  mockParams = { id: 'p1' };
  let tree: any;
  await act(async () => { tree = create(<ProjectBudgetScreen />); });
  mounted = tree;
  await flush();

  const text = allText(tree);
  const section = text.slice(text.lastIndexOf(tr.navSubscriptions));
  expect(section).toContain('Spotify');
  expect(section).toContain(tr.subPerMonth);
  expect(section).not.toContain('Старий хостинг');
  expect(section).not.toContain('Чужий');
});

test('«Продовжено» після продовження на іншому пристрої нічого не пише (без подвійного циклу)', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  seed({ subscriptions: [NETFLIX] });
  const tree = await mount();
  await pressByLabel(tree, `${tr.subRenew}: Netflix`);

  // Поки підтвердження відкрите, синк приніс продовження з вебу.
  const renewedDate = addDaysKey(NETFLIX.nextPaymentDate, 30);
  const renewedElsewhere = {
    ...NETFLIX,
    nextPaymentDate: renewedDate,
    history: [{ date: NETFLIX.nextPaymentDate, amount: 10, currency: 'USD' }],
    updatedAt: '2026-09-02T10:00:00.000Z',
  };
  mockStore.set('subscriptions', JSON.stringify([renewedElsewhere]));

  await pressByLabel(tree, tr.subRenewConfirm);
  await flush();

  expect(read<any[]>('subscriptions')).toEqual([renewedElsewhere]);
  expect((read<any[]>('sync_outbox') ?? []).filter(o => o.collection === 'subscriptions')).toEqual([]);
  expect(alertSpy).toHaveBeenCalledWith(tr.subRenewStale);
});

test('перехід ?open=<id>&renew=1 одразу відкриває підтвердження суми', async () => {
  mockParams = { open: 'sub-a', renew: '1' };
  seed({ subscriptions: [NETFLIX, SPOTIFY] });
  const tree = await mount();
  await flush();
  const inputs = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.subRenewAmount && typeof n.props.onChangeText === 'function');
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs[0].props.value).toBe('10');
});

test('блок «Найближчі оплати»: усі рядки, секції й «Продовжено» на кожному', async () => {
  const LATER = { ...SPOTIFY, id: 'sub-c', name: 'iCloud', nextPaymentDate: addDaysKey(TODAY, 3) };
  const MORE = [1, 2, 4].map(n => ({ ...SPOTIFY, id: `sub-x${n}`, name: `Extra ${n}`, nextPaymentDate: addDaysKey(TODAY, n) }));
  const items = upcomingPayments([NETFLIX, SPOTIFY, LATER, ...MORE] as any, TODAY, 7);
  let tree: any;
  await act(async () => {
    tree = create(
      <UpcomingPaymentsCard
        data={{ items, currencies: BUILTIN_CURRENCIES }}
        isDark={false}
        c={{ text: '#000', sub: '#666', border: '#ddd' }}
        tr={tr}
        lang="uk"
      />,
    );
  });
  mounted = tree;
  const text = allText(tree);
  // 5 оплат у межах тижня (Spotify через 10 днів не входить) — без обрізання до 4.
  for (const name of ['Netflix', 'iCloud', 'Extra 1', 'Extra 2', 'Extra 4']) expect(text).toContain(name);
  expect(text).not.toContain('Spotify');
  expect(text).toContain(`${tr.subOverdue} · 1`);
  expect(text).toContain(tr.subUpcomingWithin.replace('{n}', '7'));

  await pressByLabel(tree, `${tr.subRenew}: Netflix`);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/subscriptions', params: { open: 'sub-a', renew: '1' } });
});
