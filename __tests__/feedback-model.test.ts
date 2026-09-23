/**
 * __tests__/feedback-model.test.ts — чиста модель «Ідей та багів»
 * (flowi-server-app/docs/specs/feedback-inbox.md §3.1, §7.1, §8, §10).
 */
import fs from 'fs';
import path from 'path';

import { NAV_GROUPS, visibleNavGroups } from '@/constants/nav';
import {
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  applyDraft,
  backoffMs,
  buildContext,
  buildSubmitPayload,
  checkAttachments,
  classifyError,
  draftFromEntry,
  emptyDraft,
  feedbackModules,
  filesToEvict,
  filterAndSort,
  mimeFor,
  missingForSubmit,
  resolveState,
  routeTemplate,
  type Bug,
  type FeedbackEntry,
  type Idea,
} from '@/components/feedback/model';

const MB = 1024 * 1024;

const legacyBug: Bug = {
  id: '1730812345678',
  title: 'Кнопка не реагує',
  description: 'опис',
  severity: 'critical',
  fixed: false,
  createdAt: '2026-01-01T10:00:00.000Z',
  sentToDev: true,
};

const idea: Idea = {
  id: '1730900000000',
  title: 'Темна тема',
  description: 'Щоб вночі',
  priority: 'high',
  status: 'planned',
  createdAt: '2026-02-01T10:00:00.000Z',
};

describe('навігація', () => {
  it('«Розробка» — один пункт /feedback під модулем ideas', () => {
    const dev = NAV_GROUPS.find(g => g.id === 'dev')!;
    expect(dev.items).toHaveLength(1);
    expect(dev.items[0]).toMatchObject({ route: '/feedback', module: 'ideas', labelKey: 'fbTitle' });
  });

  it('вимкнений колись модуль bugs більше нічого не ховає (§10.1)', () => {
    const groups = visibleNavGroups(NAV_GROUPS, ['bugs']);
    expect(groups.flatMap(g => g.items).some(i => i.route === '/feedback')).toBe(true);
  });

  it('старі маршрути лишились редиректами на /feedback', () => {
    for (const file of ['ideas.tsx', 'bugs.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'app', file), 'utf8');
      expect(src).toContain('<Redirect');
      expect(src).toContain('/feedback');
    }
  });

  it('у клієнті немає адреси Apps Script і мовчазного .catch(() => {})', () => {
    const files = ['app/feedback.tsx', 'app/ideas.tsx', 'app/bugs.tsx', 'api/feedback.ts'];
    for (const file of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(src).not.toMatch(/script\.google\.com/);
      expect(src).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
    }
  });
});

describe('модулі (§10.2)', () => {
  it('виведені з NAV_GROUPS, без мертвого bugs, зі службовими', () => {
    const modules = feedbackModules();
    expect(modules).toContain('finance');
    expect(modules).toContain('ideas');
    expect(modules).not.toContain('bugs');
    expect(modules.slice(-3)).toEqual(['sync', 'auth', 'other']);
    expect(new Set(modules).size).toBe(modules.length);
  });
});

describe('вкладення (§7.1)', () => {
  it('MIME з розширення, коли пікер його не дав; jpg → jpeg', () => {
    expect(mimeFor('a.PNG', null)).toBe('image/png');
    expect(mimeFor('clip.mov', 'application/octet-stream')).toBe('video/quicktime');
    expect(mimeFor('x.jpg', 'image/jpg')).toBe('image/jpeg');
  });

  it('SVG, завеликі й понад ліміт — відхиляються з причиною', () => {
    const { accepted, rejected } = checkAttachments([], [
      { name: 'a.png', mime: 'image/png', bytes: MB },
      { name: 'x.svg', mime: 'image/svg+xml', bytes: 10 },
      { name: 'big.png', mime: 'image/png', bytes: MAX_IMAGE_BYTES + 1 },
      { name: 'v.mp4', mime: 'video/mp4', bytes: 45 * MB },
      { name: 'v2.mp4', mime: 'video/mp4', bytes: 20 * MB },
    ]);
    expect(accepted.map(a => a.name)).toEqual(['a.png', 'v.mp4']);
    expect(rejected.map(r => r.reason)).toEqual(['bad_type', 'too_big', 'total']);
  });

  it('не більше п’яти разом із наявними', () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, () => ({ bytes: 1 }));
    const { accepted, rejected } = checkAttachments(existing, [
      { name: '1.png', mime: 'image/png', bytes: 1 },
      { name: '2.png', mime: 'image/png', bytes: 1 },
    ]);
    expect(accepted).toHaveLength(1);
    expect(rejected[0].reason).toBe('too_many');
  });

  it('кеш понад 200 МБ — прибираються найстаріші (§11.2)', () => {
    const evict = filesToEvict([
      { uid: 'new', bytes: 150 * MB, addedAt: '2026-03-01' },
      { uid: 'old', bytes: 60 * MB, addedAt: '2026-01-01' },
      { uid: 'mid', bytes: 10 * MB, addedAt: '2026-02-01' },
    ]);
    expect(evict).toEqual(['old']);
    expect(filesToEvict([{ uid: 'a', bytes: MB, addedAt: 'x' }])).toEqual([]);
  });
});

describe('контекст (§10.3, §8.2)', () => {
  it('маршрут — шаблон без параметрів', () => {
    expect(routeTemplate('/project/p-9f3/tasks?open=1730812345678')).toBe('/project/[id]/tasks');
    expect(routeTemplate('/(tabs)/explore#x')).toBe('/(tabs)/explore');
    expect(routeTemplate('/task-group/1730812345678')).toBe('/task-group/[id]');
    expect(routeTemplate(undefined)).toBe('/');
  });

  it('тип пристрою — за шириною вікна, не за залізом', () => {
    const base = { appVersion: '1.1.0', screen: '/feedback' };
    expect(buildContext({ ...base, windowWidth: 390 }).deviceType).toBe('phone');
    expect(buildContext({ ...base, windowWidth: 600 }).deviceType).toBe('tablet');
    const ctx = buildContext({ ...base, windowWidth: 1024, osName: 'iPadOS', osVersion: '18.2', locale: 'uk', workspace: 'Casper' });
    expect(ctx).toEqual({
      platform: 'mobile', deviceType: 'tablet', appVersion: '1.1.0', screen: '/feedback',
      osVersion: 'iPadOS 18.2', locale: 'uk', workspace: 'Casper',
    });
  });
});

describe('форма (§10.2)', () => {
  it('баг вимагає кроки / очікувалось / сталось, ідея — опис', () => {
    expect(missingForSubmit({ ...emptyDraft('bug'), title: 'x' })).toEqual(['steps', 'expected', 'actual']);
    expect(missingForSubmit({ ...emptyDraft('idea'), title: 'x' })).toEqual(['description']);
    expect(missingForSubmit({ ...emptyDraft('idea'), title: ' ', description: 'd' })).toEqual(['title']);
  });

  it('дефолтна вага — major / medium', () => {
    expect(emptyDraft('bug').weight).toBe('major');
    expect(emptyDraft('idea').weight).toBe('medium');
  });

  it('правка легасі-запису не губить його полів (sentToDev, fixed, createdAt)', () => {
    const entry: FeedbackEntry = { kind: 'bug', item: legacyBug };
    const draft = { ...draftFromEntry(entry), steps: '1. Відкрити', expected: 'ok', actual: 'ні', module: 'finance' };
    const next = applyDraft(entry, draft, legacyBug.id, '2026-09-23T00:00:00.000Z').item as Bug;
    expect(next).toMatchObject({
      id: legacyBug.id, sentToDev: true, fixed: false, createdAt: legacyBug.createdAt,
      steps: '1. Відкрити', expected: 'ok', actual: 'ні', module: 'finance', severity: 'critical',
    });
  });

  it('новий запис без необовʼязкових полів не несе undefined-ключів', () => {
    const next = applyDraft(null, { ...emptyDraft('idea'), title: ' T ', description: 'D' }, 'id1', '2026-09-23T00:00:00.000Z');
    expect(next.item).toEqual({ id: 'id1', status: 'idea', createdAt: '2026-09-23T00:00:00.000Z', title: 'T', description: 'D', priority: 'medium' });
  });
});

describe('тіло POST /api/feedback/reports/ (§4.1)', () => {
  const bug: Bug = {
    ...legacyBug,
    steps: 's', expected: 'e', actual: 'a', module: 'finance',
    context: { platform: 'mobile', deviceType: 'tablet', appVersion: '1.1.0', screen: '/project/abc/tasks?open=1', osVersion: 'iOS 18', locale: 'uk', workspace: 'Casper' },
    attachments: [
      { uid: 'u1', kind: 'image', name: 's.png', bytes: 10, mime: 'image/png', state: 'local' },
      { uid: 'u2', kind: 'video', name: 'v.mp4', bytes: 20, state: 'local' },
    ],
  };

  it('ключі контракту, шаблон екрана, без воркспейсу; лише вкладення з файлом', () => {
    const payload = buildSubmitPayload({ kind: 'bug', item: bug }, new Set(['u1']));
    expect(payload).toEqual({
      kind: 'bug', collection: 'bugs', local_id: bug.id, title: bug.title, description: 'опис',
      module: 'finance', weight: 'critical', steps: 's', expected: 'e', actual: 'a',
      context: { platform: 'mobile', device_type: 'tablet', app_version: '1.1.0', screen: '/project/[id]/tasks', os_version: 'iOS 18', locale: 'uk' },
      attachments: [{ client_uid: 'u1', kind: 'image', name: 's.png', bytes: 10, mime: 'image/png' }],
    });
  });

  it('ідея: без кроків, пріоритет як weight, planned читається', () => {
    const payload = buildSubmitPayload({ kind: 'idea', item: idea }, new Set());
    expect(payload.collection).toBe('ideas');
    expect(payload.weight).toBe('high');
    expect(payload).not.toHaveProperty('steps');
    expect(payload.context).toEqual({});
  });
});

describe('стан (§10.5)', () => {
  const server = (over: Partial<Parameters<typeof resolveState>[1] & object>) => ({
    reportUid: 'r', deliveryState: 'queued', status: 'new', comment: '', duplicateOf: null, taskLinked: false, updatedAt: null, ...over,
  });

  it('«Надіслано» лише після 2xx: у черзі — ще ні', () => {
    expect(resolveState({ ...idea, submitState: 'queued' }, null).key).toBe('queued');
    expect(resolveState({ ...idea, submitState: 'sent', reportUid: 'r' }, null).key).toBe('sent');
    expect(resolveState(idea, null)).toMatchObject({ key: 'draft', canSend: true });
  });

  it('легасі sentToDev без нового шляху — «старим способом»', () => {
    expect(resolveState(legacyBug, null).key).toBe('legacy');
  });

  it('відмова сервера — можна надіслати знову з причиною', () => {
    expect(resolveState({ ...idea, submitState: 'failed', submitError: 'Потрібна назва.' }, null))
      .toMatchObject({ key: 'failed', retry: 'client', canSend: true, comment: 'Потрібна назва.' });
  });

  it('серверний стан важливіший за локальний', () => {
    const item = { ...idea, submitState: 'queued' as const };
    expect(resolveState(item, server({ deliveryState: 'delivered' })).key).toBe('sentNew');
    expect(resolveState(item, server({ deliveryState: 'failed' }))).toMatchObject({ key: 'undelivered', retry: 'server' });
    expect(resolveState(item, server({ deliveryState: 'local_only' })).key).toBe('localOnly');
    expect(resolveState(item, server({ status: 'rejected', comment: 'Не в планах', deliveryState: 'delivered' })))
      .toMatchObject({ key: 'rejected', comment: 'Не в планах', canSend: false });
    expect(resolveState(item, server({ status: 'in_progress', duplicateOf: 'x', taskLinked: true })))
      .toMatchObject({ key: 'inProgress', duplicate: true, taskLinked: true });
  });

  it('фільтр «Надіслані» не рахує чернетки й чергу', () => {
    const entries: FeedbackEntry[] = [
      { kind: 'idea', item: { ...idea, id: 'a' } },
      { kind: 'idea', item: { ...idea, id: 'b', submitState: 'queued' } },
      { kind: 'idea', item: { ...idea, id: 'c', submitState: 'sent', reportUid: 'r' } },
    ];
    const sent = filterAndSort(entries, 'sent', 'newest', e => resolveState(e.item, null));
    expect(sent.map(e => e.item.id)).toEqual(['c']);
  });
});

describe('черга: повтори (§5.5, §11.2)', () => {
  it('4xx — не повторюємо; мережа, 429, 5xx, 401 — повторюємо', () => {
    expect(classifyError(400)).toBe('fail');
    expect(classifyError(413)).toBe('fail');
    expect(classifyError(0)).toBe('retry');
    expect(classifyError(429)).toBe('retry');
    expect(classifyError(503)).toBe('retry');
    expect(classifyError(401)).toBe('retry');
  });

  it('backoff росте й упирається в годину', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
    expect(backoffMs(1, 120)).toBe(120_000);
  });
});
