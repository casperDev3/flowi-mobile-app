/**
 * __tests__/timer-dials.test.ts — маніфест циферблатів.
 *
 * Перевіряється саме те, що ламається тихо: збережений вибір, якого більше не
 * існує, і циферблат без назви. Обидва дають не помилку, а порожнє місце
 * замість годинника — тобто екран, який виглядає зламаним, поки не здогадаєшся
 * зайти в налаштування.
 */

import { allTranslations } from '../store/translations';
import { DEFAULT_DIAL, DIALS, dialForTimer, parseDialId, pruneDialMap } from '../utils/timerDials';
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

  it('має стелю — інакше циферблат стає ілюстрацією', () => {
    expect(timerDialSize(2000, 2000)).toBe(240);
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
