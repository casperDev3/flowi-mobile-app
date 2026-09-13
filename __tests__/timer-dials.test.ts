/**
 * __tests__/timer-dials.test.ts — маніфест циферблатів.
 *
 * Перевіряється саме те, що ламається тихо: збережений вибір, якого більше не
 * існує, і циферблат без назви. Обидва дають не помилку, а порожнє місце
 * замість годинника — тобто екран, який виглядає зламаним, поки не здогадаєшся
 * зайти в налаштування.
 */

import { allTranslations } from '../store/translations';
import {
  DEFAULT_DIAL,
  DIALS,
  TIMER_DIAL_PREFS_KEY,
  dialForTimer,
  emptyDialPrefs,
  mergeLocalDials,
  parseDialId,
  preserveDialPrefs,
  pruneAdhocDials,
  pruneDialMap,
  resolveDial,
  sanitizeDialPrefs,
  withDefaultDial,
  withTimerDial,
  type TimerDialPrefs,
} from '../utils/timerDials';
import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from '../store/sync-contract';
import { timerDialSize } from '../utils/timerGrid';

describe('маніфест циферблатів', () => {
  it('id не дублюються', () => {
    const ids = DIALS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('їх десять', () => {
    expect(DIALS).toHaveLength(10);
  });

  it('цифри — і за замовчуванням, і перші в списку', () => {
    // Перший варіант пробують найчастіше, тож ним має бути той, що ніколи
    // не підводить.
    expect(DEFAULT_DIAL).toBe('digits');
    expect(DIALS[0].id).toBe(DEFAULT_DIAL);
  });

  it('кожен має назву в ОБОХ мовах', () => {
    for (const meta of DIALS) {
      for (const lang of ['uk', 'en'] as const) {
        const label = allTranslations[lang][meta.labelKey];
        expect(typeof label).toBe('string');
        expect(String(label).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('parseDialId', () => {
  it('пропускає чинні значення', () => {
    for (const meta of DIALS) expect(parseDialId(meta.id)).toBe(meta.id);
  });

  it('невідоме значення відкочується на цифри, а не валить екран', () => {
    // Так виглядає циферблат, прибраний у новій версії, у користувача, який
    // обрав його в старій.
    expect(parseDialId('pulse')).toBe(DEFAULT_DIAL);
    expect(parseDialId('')).toBe(DEFAULT_DIAL);
  });

  it('переживає сміття зі сховища', () => {
    for (const junk of [null, undefined, 42, {}, [], true]) {
      expect(parseDialId(junk)).toBe(DEFAULT_DIAL);
    }
  });
});

describe('timerDialSize', () => {
  it('полотно росте разом із клітинкою', () => {
    expect(timerDialSize(560, 360)).toBeGreaterThan(timerDialSize(300, 240));
  });

  it('стелі НЕМАЄ: на планшеті циферблат бере всю клітинку', () => {
    // Було 240 — і саме через цю стелю iPad нічого не вигравав від великого
    // екрана. Обмежує тепер лише сама клітинка мінус її хром.
    expect(timerDialSize(2000, 2000)).toBeGreaterThan(1800);
  });

  it('має підлогу — у тісній клітинці фігура не має зникати', () => {
    expect(timerDialSize(120, 140)).toBe(72);
  });

  it('обмежує менша сторона: широка й низька клітинка не дає великого кола', () => {
    expect(timerDialSize(1000, 200)).toBeLessThan(timerDialSize(1000, 400));
  });
});

describe('циферблат кожного таймера окремо', () => {
  it('без вибору таймер показує цифри', () => {
    expect(dialForTimer(undefined, 'task:1')).toBe(DEFAULT_DIAL);
    expect(dialForTimer({}, 'adhoc:xyz')).toBe(DEFAULT_DIAL);
  });

  it('сусідні таймери не заважають один одному', () => {
    // Заради цього все й переробляли: два таймери поруч мусять відрізнятися
    // не лише назвою.
    const map = { 'task:1': 'rings', 'task:2': 'hourglass' } as const;
    expect(dialForTimer(map, 'task:1')).toBe('rings');
    expect(dialForTimer(map, 'task:2')).toBe('hourglass');
    expect(dialForTimer(map, 'task:3')).toBe(DEFAULT_DIAL);
  });

  it('циферблат, якого більше немає, не валить клітинку', () => {
    expect(dialForTimer({ 'task:1': 'pulse' } as never, 'task:1')).toBe(DEFAULT_DIAL);
  });
});

describe('pruneDialMap', () => {
  it('прибирає вибір зупинених таймерів', () => {
    // Кожен вільний таймер має ВИПАДКОВИЙ id, тож без чистки мапа росла б
    // вічно — по рядку за кожен колись запущений секундомір.
    const map = { 'task:1': 'rings', 'adhoc:a': 'orbit' } as const;
    expect(pruneDialMap(map, ['task:1'])).toEqual({ 'task:1': 'rings' });
  });

  it('повертає ТОЙ САМИЙ обʼєкт, коли чистити нема чого', () => {
    // Інакше кожен тік будив би зайвий запис у сховище.
    const map = { 'task:1': 'rings' } as const;
    expect(pruneDialMap(map, ['task:1', 'task:2'])).toBe(map);
  });

  it('порожній список живих очищає мапу повністю', () => {
    expect(pruneDialMap({ 'task:1': 'arc' } as never, [])).toEqual({});
  });
});

// ─── Синхронізований вибір (CONTRACT.md §F.2) ─────────────────────────────────

describe('timer_dial_prefs — контракт ключа', () => {
  it('singleton, а не масив, і назва відрізняється від локального timer_dials', () => {
    expect(TIMER_DIAL_PREFS_KEY).toBe('timer_dial_prefs');
    expect(SYNC_SINGLETON_KEYS).toContain('timer_dial_prefs');
    expect(SYNC_ARRAY_KEYS as readonly string[]).not.toContain('timer_dial_prefs');
    // Локальний ключ ніколи не синхронізується: рушій затер би його форму.
    expect([...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS] as string[]).not.toContain('timer_dials');
  });
});

describe('sanitizeDialPrefs', () => {
  it('сміття → порожні налаштування з цифрами', () => {
    for (const junk of [null, undefined, 42, 'rings', [], true]) {
      expect(sanitizeDialPrefs(junk)).toEqual({ version: 1, defaultDial: 'digits', timers: {} });
    }
  });

  it('відкидає невідомі циферблати, лишає чинні', () => {
    const out = sanitizeDialPrefs({
      version: 1,
      defaultDial: 'pulse',
      timers: { 'task:1': 'rings', 'task:2': 'pulse', 'adhoc:x': 42 },
    });
    expect(out.defaultDial).toBe('digits');
    expect(out.timers).toEqual({ 'task:1': 'rings' });
  });

  it('невідомі поля верхнього рівня переживають нормалізацію (їх міг писати новіший клієнт)', () => {
    const out = sanitizeDialPrefs({ version: 1, defaultDial: 'arc', timers: {}, futureField: { a: 1 }, updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(out.futureField).toEqual({ a: 1 });
    expect(out.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(out.defaultDial).toBe('arc');
  });

  it('timers не об’єкт → порожня мапа', () => {
    expect(sanitizeDialPrefs({ defaultDial: 'arc', timers: ['rings'] }).timers).toEqual({});
  });
});

describe('resolveDial — порядок: синхронізований → локальний → типовий → цифри', () => {
  const prefs: TimerDialPrefs = { version: 1, defaultDial: 'orbit', timers: { 'task:1': 'rings' } };

  it('синхронізований персональний вибір виграє в локального', () => {
    expect(resolveDial(prefs, 'task:1', { 'task:1': 'tape' })).toBe('rings');
  });

  it('старий локальний вибір виграє в типового', () => {
    expect(resolveDial(prefs, 'task:2', { 'task:2': 'tape' })).toBe('tape');
  });

  it('без жодного вибору — типовий', () => {
    expect(resolveDial(prefs, 'task:3', {})).toBe('orbit');
    expect(resolveDial(prefs, 'task:3')).toBe('orbit');
  });

  it('без налаштувань узагалі — цифри', () => {
    expect(resolveDial(null, 'task:1')).toBe('digits');
    expect(resolveDial(undefined, 'task:1', null)).toBe('digits');
  });

  it('биті значення пропускаються, а не показуються', () => {
    const broken = { version: 1, defaultDial: 'pulse', timers: { 'task:1': 'pulse' } } as unknown as TimerDialPrefs;
    expect(resolveDial(broken, 'task:1', { 'task:1': 'nope' } as never)).toBe('digits');
  });
});

describe('pruneAdhocDials', () => {
  it('прибирає ЛИШЕ вільні таймери, яких немає серед живих', () => {
    const map = { 'task:1': 'rings', 'meeting:m': 'arc', 'adhoc:gone': 'orbit', 'adhoc:live': 'tape' } as const;
    expect(pruneAdhocDials(map, ['adhoc:live'])).toEqual({
      'task:1': 'rings',
      'meeting:m': 'arc',
      'adhoc:live': 'tape',
    });
  });

  it('task:/meeting: не чистяться навіть без живих таймерів — наступна сесія отримає той самий вибір', () => {
    const map = { 'task:1': 'rings', 'meeting:m': 'arc' } as const;
    expect(pruneAdhocDials(map, [])).toBe(map);
  });

  it('повертає ТОЙ САМИЙ об’єкт, коли чистити нема чого', () => {
    const map = { 'adhoc:a': 'rings' } as const;
    expect(pruneAdhocDials(map, ['adhoc:a'])).toBe(map);
  });
});

describe('withTimerDial / withDefaultDial', () => {
  const now = new Date('2026-09-13T10:00:00.000Z');

  it('пише персональний вибір явно, навіть якщо він дорівнює типовому', () => {
    const next = withTimerDial(emptyDialPrefs(), 'task:1', 'digits', [], now);
    expect(next.timers).toEqual({ 'task:1': 'digits' });
    expect(next.updatedAt).toBe(now.toISOString());
    expect(next.version).toBe(1);
  });

  it('чистить зупинені вільні таймери лише коли список живих відомий', () => {
    const prefs: TimerDialPrefs = { version: 1, defaultDial: 'digits', timers: { 'adhoc:old': 'rings', 'task:1': 'arc' } };
    expect(withTimerDial(prefs, 'task:2', 'tape', ['task:2'], now).timers).toEqual({ 'task:1': 'arc', 'task:2': 'tape' });
    // null = реєстр ще не прочитаний → нічого не чистимо.
    expect(withTimerDial(prefs, 'task:2', 'tape', null, now).timers).toEqual({ 'adhoc:old': 'rings', 'task:1': 'arc', 'task:2': 'tape' });
  });

  it('вибір для щойно запущеного вільного таймера не зникає, навіть якщо його ще немає серед живих', () => {
    const next = withTimerDial(emptyDialPrefs(), 'adhoc:new', 'orbit', [], now);
    expect(next.timers['adhoc:new']).toBe('orbit');
  });

  it('не мутує вхід і зберігає невідомі поля', () => {
    const prefs = { version: 1, defaultDial: 'digits', timers: { 'task:1': 'arc' }, extra: 'keep' } as TimerDialPrefs;
    const snapshot = JSON.parse(JSON.stringify(prefs));
    const next = withTimerDial(prefs, 'task:1', 'rings', [], now);
    expect(prefs).toEqual(snapshot);
    expect(next.extra).toBe('keep');
  });

  it('типовий міняється без зачіпання персональних виборів', () => {
    const prefs: TimerDialPrefs = { version: 1, defaultDial: 'digits', timers: { 'task:1': 'arc', 'adhoc:x': 'tape' } };
    const next = withDefaultDial(prefs, 'chrono', now);
    expect(next.defaultDial).toBe('chrono');
    expect(next.timers).toEqual(prefs.timers);
    expect(next.updatedAt).toBe(now.toISOString());
  });

  it('невідомий циферблат не потрапляє в дані', () => {
    expect(withDefaultDial(emptyDialPrefs(), 'pulse' as never, now).defaultDial).toBe('digits');
    expect(withTimerDial(emptyDialPrefs(), 'task:1', 'pulse' as never, [], now).timers['task:1']).toBe('digits');
  });
});

// ─── Сумісність із новішими клієнтами (невідомий циферблат) ───────────────────

describe('невідомий циферблат від новішого клієнта не стирається записом', () => {
  const now = new Date('2026-09-13T10:00:00.000Z');
  // Так виглядають налаштування, коли новіша збірка додала одинадцятий
  // циферблат 'pulse' і людина обрала його типовим і для одного таймера.
  const fromNewer = {
    version: 1,
    defaultDial: 'pulse',
    timers: { 'task:1': 'pulse', 'task:2': 'arc', 'adhoc:gone': 'pulse', 'task:bad': 42, 'task:empty': '' },
    futureField: true,
  };

  it('preserveDialPrefs лишає рядкові значення як є, відкидає лише не-рядки', () => {
    const out = preserveDialPrefs(fromNewer);
    expect(out.defaultDial).toBe('pulse');
    expect(out.timers).toEqual({ 'task:1': 'pulse', 'task:2': 'arc', 'adhoc:gone': 'pulse' });
    expect(out.futureField).toBe(true);
    for (const junk of [null, undefined, 42, 'rings', [], true]) {
      expect(preserveDialPrefs(junk)).toEqual({ version: 1, defaultDial: 'digits', timers: {} });
    }
    expect(preserveDialPrefs({ defaultDial: '', timers: [] })).toMatchObject({ defaultDial: 'digits', timers: {} });
  });

  it('withTimerDial міняє лише свій ключ: чужий типовий і чужі вибори лишаються', () => {
    const next = withTimerDial(preserveDialPrefs(fromNewer), 'task:3', 'rings', null, now);
    expect(next.defaultDial).toBe('pulse');
    expect(next.timers).toEqual({ 'task:1': 'pulse', 'task:2': 'arc', 'adhoc:gone': 'pulse', 'task:3': 'rings' });
    expect(next.futureField).toBe(true);
  });

  it('withTimerDial чистить лише мертві adhoc:, навіть із невідомим циферблатом', () => {
    const next = withTimerDial(preserveDialPrefs(fromNewer), 'task:3', 'rings', [], now);
    expect(next.timers).toEqual({ 'task:1': 'pulse', 'task:2': 'arc', 'task:3': 'rings' });
  });

  it('withDefaultDial не чіпає невідомі персональні вибори', () => {
    const next = withDefaultDial(preserveDialPrefs(fromNewer), 'chrono', now);
    expect(next.defaultDial).toBe('chrono');
    expect(next.timers).toEqual({ 'task:1': 'pulse', 'task:2': 'arc', 'adhoc:gone': 'pulse' });
  });

  it('withTimerDial/withDefaultDial не губить невідоме навіть якщо на вхід дали сире значення', () => {
    const raw = fromNewer as unknown as TimerDialPrefs;
    expect(withTimerDial(raw, 'task:3', 'rings', null, now).timers['task:1']).toBe('pulse');
    expect(withDefaultDial(raw, 'chrono', now).timers['task:1']).toBe('pulse');
  });

  it('показ пропускає невідоме: персональний → локальний → типовий → цифри', () => {
    const stored = preserveDialPrefs(fromNewer);
    expect(resolveDial(stored, 'task:1', { 'task:1': 'tape' })).toBe('tape');
    expect(resolveDial(stored, 'task:1')).toBe('digits');
    expect(resolveDial(stored, 'task:2')).toBe('arc');
    expect(resolveDial({ ...stored, defaultDial: 'orbit' }, 'task:1')).toBe('orbit');
  });
});

describe('mergeLocalDials — перенесення старого локального вибору в синк', () => {
  const base = { version: 1 as const, defaultDial: 'digits', timers: { 'task:1': 'arc', 'task:x': 'pulse' } };

  it('дописує лише відсутні task:/meeting: і живі adhoc:, наявне не переписує', () => {
    const local = {
      'task:1': 'rings',        // синхронізований уже є → не чіпаємо
      'task:x': 'tape',         // синхронізований невідомий → теж не чіпаємо
      'task:2': 'rings',
      'meeting:m': 'orbit',
      'adhoc:live': 'dots',
      'adhoc:dead': 'flip',
      'other:z': 'arc',
      'task:bad': 'pulse',      // локальне невідоме — сміття, не переносимо
    };
    const out = mergeLocalDials(base, local, ['adhoc:live']);
    expect(out.timers).toEqual({
      'task:1': 'arc',
      'task:x': 'pulse',
      'task:2': 'rings',
      'meeting:m': 'orbit',
      'adhoc:live': 'dots',
    });
    expect(base.timers).toEqual({ 'task:1': 'arc', 'task:x': 'pulse' });
  });

  it('реєстр не прочитаний (null) → вільні таймери не переносяться', () => {
    const out = mergeLocalDials(base, { 'adhoc:a': 'dots', 'task:2': 'rings' }, null);
    expect(out.timers).toEqual({ 'task:1': 'arc', 'task:x': 'pulse', 'task:2': 'rings' });
  });

  it('нічого дописувати → той самий об\u2019єкт; сміття замість мапи не ламає', () => {
    expect(mergeLocalDials(base, { 'task:1': 'rings' }, [])).toBe(base);
    for (const junk of [null, undefined, 42, 'x', []]) expect(mergeLocalDials(base, junk, [])).toBe(base);
  });
});
