/**
 * rc1 deep-link policy (docs/release-rc1/deeplinks.md).
 *
 * Фікстура `fixtures/deeplinks-web.json` — побайтова копія
 * flowi-web-app/lib/__fixtures__/deeplinks.json (веб-тест перевіряє, що
 * кожна сторінка кабінету має рядок у `routes`). Тут:
 *  - таблиця utils/deepLinks.ts == `routes` фікстури;
 *  - кожна мобільна ціль таблиці — справжній файл у `app/`;
 *  - кожен `cases` розбирається рівно так, як записано;
 *  - `next` — ті самі правила безпечного шляху, що й веб `safeNextPath`;
 *  - +native-intent: що повертає для кожного виду посилання;
 *  - намір переживає вхід (TTL, одноразовість, битий маршрут зі сховища).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import fixture from './fixtures/deeplinks-web.json';

const mockStore = new Map<string, unknown>();
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => (mockStore.has(key) ? mockStore.get(key) : fallback)),
  saveData: jest.fn(async (key: string, value: unknown) => { mockStore.set(key, value); }),
}));
jest.mock('@/store/note-capture', () => ({
  isNoteCaptureLink: (p: string) => /notes\?(capture|create)=1/.test(p),
  requestNoteCapture: jest.fn(),
}));

import { redirectSystemPath } from '@/app/+native-intent';
import {
  __resetDeepLinkIntentForTests,
  DEEP_LINK_INTENT_TTL_MS,
  getDeepLinkIntent,
  PENDING_DEEP_LINK_KEY,
  peekDeepLinkIntentSync,
  setDeepLinkIntent,
  takeDeepLinkIntent,
} from '@/store/deep-link-intent';
import { parseInviteLink } from '@/store/invite-link';
import {
  decideDeepLinkAccess,
  memberProjectIdsFor,
  DEEP_LINK_FALLBACK_ROUTE,
  resolveIncomingLink,
  safeInternalRoute,
  WEB_TO_MOBILE_ROUTES,
} from '@/utils/deepLinks';
import { deepLinkRoute } from '@/utils/pushLink';

const ROOT = join(__dirname, '..');

describe('таблиця маршрутів', () => {
  test('збігається з фікстурою (спільна з вебом)', () => {
    expect(WEB_TO_MOBILE_ROUTES.map(([web, mobile]) => ({ web, mobile }))).toEqual(fixture.routes);
    expect(DEEP_LINK_FALLBACK_ROUTE).toBe(fixture.fallback);
  });

  test('кожна мобільна ціль існує в app/', () => {
    const fileFor = (route: string): string[] => {
      const clean = route.replace(/^\//, '');
      if (clean === '(tabs)') return ['app/(tabs)/index.tsx'];
      return [`app/${clean}.tsx`, `app/${clean}/index.tsx`];
    };
    const missing = [...new Set(fixture.routes.map(r => r.mobile))]
      .filter(route => !fileFor(route).some(f => existsSync(join(ROOT, f))));
    expect(missing).toEqual([]);
  });

  test('фікстура побайтово = вебова (якщо репо поруч)', () => {
    const web = join(ROOT, '..', 'flowi-web-app', 'lib', '__fixtures__', 'deeplinks.json');
    if (!existsSync(web)) return;
    expect(readFileSync(join(__dirname, 'fixtures', 'deeplinks-web.json'), 'utf8')).toBe(readFileSync(web, 'utf8'));
  });
});

describe('resolveIncomingLink — cases фікстури', () => {
  test.each(fixture.cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    expect(resolveIncomingLink(c.url)).toEqual(c.expect);
  });
});

describe('безпечний внутрішній шлях — ті самі правила, що веб safeNextPath', () => {
  test.each(fixture.next.map(c => [JSON.stringify(c.input), c] as const))('%s', (_name, c) => {
    expect(safeInternalRoute(c.input)).toBe(c.expect);
  });
});

describe('схема flowi:// і аліас ftrackingapp://', () => {
  test('реєстр сервера розбирається з обома префіксами', () => {
    expect(deepLinkRoute('flowi://project/p1/task/t1')).toBe(deepLinkRoute('ftrackingapp://project/p1/task/t1'));
    expect(deepLinkRoute('flowi://meeting/m1')).toBe('/calendar?open=m1');
  });
  test('parseInviteLink приймає flowi:// і канонізує стару адресу Cloud', () => {
    expect(parseInviteLink('flowi://invite?ws=https%3A%2F%2Fapi.flowi.com.ua&p=p1&t=tok')).toEqual({ ws: 'https://api.flowi.com.ua', projectId: 'p1', token: 'tok' });
    expect(parseInviteLink('https://app.flowi.com.ua/invite?ws=https%3A%2F%2Fapi.flowi.casperdev.site&p=p1&t=tok')?.ws).toBe('https://api.flowi.com.ua');
    expect(parseInviteLink('ftrackingapp://invite?ws=https%3A%2F%2Fself.example&p=p1&t=tok')?.ws).toBe('https://self.example');
  });
});

describe('+native-intent', () => {
  beforeEach(() => { mockStore.clear(); __resetDeepLinkIntentForTests(); });

  test('сторінка кабінету → /open-link + намір', () => {
    expect(redirectSystemPath({ path: 'https://app.flowi.com.ua/app/p/p1/tasks?open=t7', initial: true })).toBe('/open-link');
    expect(peekDeepLinkIntentSync()).toMatchObject({ route: '/project/p1/tasks?open=t7', projectId: 'p1' });
  });

  test('запрошення → одразу екран запрошення, без наміру', () => {
    expect(redirectSystemPath({ path: 'https://app.flowi.com.ua/invite/menu?ws=x&t=tok', initial: false })).toBe('/menu-invite?ws=x&t=tok');
    expect(redirectSystemPath({ path: 'flowi://invite?ws=x&p=p1&t=tok', initial: false })).toBe('/invite?ws=x&p=p1&t=tok');
    expect(peekDeepLinkIntentSync()).toBeNull();
  });

  test('віджети, OAuth, QR і чужі хости — без змін', () => {
    for (const path of ['ftrackingapp:///time', 'ftrackingapp://integrations/google?gcal=connected', 'ftrackingapp://c/ws/abc', 'https://evil.example/app/p/1', '/calendar']) {
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    }
    expect(peekDeepLinkIntentSync()).toBeNull();
  });

  test('швидкий запис нотатки — як раніше', () => {
    expect(redirectSystemPath({ path: 'ftrackingapp:///notes?capture=1', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: 'ftrackingapp:///notes?capture=1', initial: false })).toBe('');
  });
});

describe('намір переживає вхід', () => {
  beforeEach(() => { mockStore.clear(); __resetDeepLinkIntentForTests(); });

  test('зберігається у сховище й читається після «перезапуску»', async () => {
    setDeepLinkIntent({ route: '/project/p1/overview', projectId: 'p1' }, 1_000);
    await Promise.resolve();
    __resetDeepLinkIntentForTests(); // процес убито між посиланням і входом
    expect(await getDeepLinkIntent(2_000)).toMatchObject({ route: '/project/p1/overview', projectId: 'p1' });
  });

  test('одноразовий: take забирає і стирає', async () => {
    setDeepLinkIntent({ route: '/notes' }, 1_000);
    expect(await takeDeepLinkIntent(1_500)).toMatchObject({ route: '/notes' });
    expect(await takeDeepLinkIntent(1_600)).toBeNull();
    expect(mockStore.get(PENDING_DEEP_LINK_KEY)).toBeNull();
  });

  test('протухає за TTL', async () => {
    setDeepLinkIntent({ route: '/notes' }, 1_000);
    expect(await getDeepLinkIntent(1_000 + DEEP_LINK_INTENT_TTL_MS + 1)).toBeNull();
  });

  test('битий/зовнішній маршрут зі сховища ігнорується', async () => {
    mockStore.set(PENDING_DEEP_LINK_KEY, { route: '//evil.example', receivedAt: Date.now() });
    expect(await getDeepLinkIntent()).toBeNull();
    expect(setDeepLinkIntent({ route: 'https://evil.example' })).toBeNull();
  });
});

describe('доступ до цілі', () => {
  const members = new Set(['pA', 'pB']);
  test('особиста ціль — відкрити', () => {
    expect(decideDeepLinkAccess({}, members, 'pA')).toEqual({ action: 'open' });
  });
  test('не учасник — «Немає доступу»', () => {
    expect(decideDeepLinkAccess({ projectId: 'pX' }, members, null)).toEqual({ action: 'no-access' });
    expect(decideDeepLinkAccess({ projectId: 'pX' }, members, 'pA')).toEqual({ action: 'no-access' });
  });
  test('учасник в іншому просторі — аркуш перемикання', () => {
    expect(decideDeepLinkAccess({ projectId: 'pB' }, members, 'pA')).toEqual({ action: 'confirm-switch' });
  });
  test('свіжий список сервера сильніший за локальний (відкликаний доступ)', () => {
    const localStillHasIt = new Set(['pA', 'pRevoked']);
    expect(decideDeepLinkAccess({ projectId: 'pRevoked' }, memberProjectIdsFor(['pA'], localStillHasIt), null)).toEqual({ action: 'no-access' });
    // Офлайн (сервер не відповів) — лише тоді кеш ∪ локальні.
    expect(decideDeepLinkAccess({ projectId: 'pRevoked' }, memberProjectIdsFor(null, localStillHasIt), null)).toEqual({ action: 'open' });
  });
  test('учасник з особистого чи того самого простору — відкрити', () => {
    expect(decideDeepLinkAccess({ projectId: 'pB' }, members, null)).toEqual({ action: 'open' });
    expect(decideDeepLinkAccess({ projectId: 'pB' }, members, 'pB')).toEqual({ action: 'open' });
  });
});
