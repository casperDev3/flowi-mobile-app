/**
 * __tests__/timer-focus-layout.test.ts — розкладка повноекранного режиму.
 *
 * Ловить рівно ту ваду, через яку писалась функція: на iPad 1194×834 циферблат
 * упирався у стелю (240 у сітці, 320 у розгорнутому вигляді) і лишався
 * маленьким посеред великого екрана. Тому майже всі очікування тут — числа, а
 * не «більше нуля»: стеля зникає тихо, і тільки конкретний розмір це доводить.
 *
 * Усі площі — це вже ОБЛАСТЬ ПІД СІТКУ, тобто вікно мінус вирізи, шапка 46 і
 * падінги 16×2. Так їх і рахує FullscreenTimers.
 */

import {
  timerCellSubtaskRows,
  timerDialSize,
  timerFocusLayout,
  timerExpandedDialSize,
  type TimerFocusOptions,
} from '../utils/timerGrid';

/** Спільне для всіх площ: gap і поріг читабельності з FullscreenTimers. */
const BASE = { gap: 12, minCellHeight: 132 };

/** iPad 1194×834 в альбомі. Саме тут ламалась стеля. */
const IPAD_LANDSCAPE: Omit<TimerFocusOptions, 'count'> = {
  ...BASE, width: 1130, height: 740, maxColumns: 2, rowsPerScreen: 2,
};
/** Той самий iPad у портреті. */
const IPAD_PORTRAIT: Omit<TimerFocusOptions, 'count'> = {
  ...BASE, width: 770, height: 1100, maxColumns: 2, rowsPerScreen: 2,
};
/** Телефон 390×844 портретом — вузьке вікно. */
const PHONE: Omit<TimerFocusOptions, 'count'> = {
  ...BASE, width: 358, height: 612, maxColumns: 1, rowsPerScreen: 4,
};
/** Той самий телефон в альбомі: широко й дуже низько. */
const PHONE_LANDSCAPE: Omit<TimerFocusOptions, 'count'> = {
  ...BASE, width: 780, height: 310, maxColumns: 1, rowsPerScreen: 4,
};
/** Split View: планшет віддає компактну ширину, але лишає всю висоту. */
const SPLIT: Omit<TimerFocusOptions, 'count'> = {
  ...BASE, width: 480, height: 700, maxColumns: 1, rowsPerScreen: 4,
};

/**
 * Хром клітинки — ті самі числа, що в TimerCell: падінги 12×2, рядок назви 24,
 * пігулка «Стоп» ~30, і блок підзавдань, якщо висота дозволяє йому бути.
 * Дублюється навмисно: інваріант «циферблат разом із хромом влазить» має
 * перевірятися незалежно від внутрішніх констант.
 */
function chrome(cellHeight: number): number {
  const rows = timerCellSubtaskRows(cellHeight);
  return 80 + (rows > 0 ? 23 + 16 * rows : 0);
}

describe('timerFocusLayout — один таймер', () => {
  it('на iPad займає ВЕСЬ екран, а не 320pt посеред нього', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 1 });
    expect(l.columns).toBe(1);
    expect(l.rows).toBe(1);
    expect(l.widths).toEqual([1130]);
    // Висота вузьке місце: 740 − 151 (хром із трьома рядками підзавдань) = 589.
    expect(l.dialSize).toBe(589);
    expect(l.scrolls).toBe(false);
  });

  it('стелі 320 більше немає — саме це й було вадою', () => {
    expect(timerFocusLayout({ ...IPAD_LANDSCAPE, count: 1 }).dialSize).toBeGreaterThan(320);
    expect(timerFocusLayout({ ...IPAD_PORTRAIT, count: 1 }).dialSize).toBeGreaterThan(320);
  });

  it('на телефоні впирається у ширину, а не у стелю', () => {
    // 358 − 28 (падінги картки) = 330; висоти вистачило б на 461.
    expect(timerFocusLayout({ ...PHONE, count: 1 }).dialSize).toBe(330);
  });
});

describe('timerFocusLayout — два-чотири: рівна сітка без головного', () => {
  it('два в альбомі стають ПОРУЧ', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 2 });
    expect(l.columns).toBe(2);
    expect(l.rows).toBe(1);
    expect(l.widths[0]).toBe(l.widths[1]);
    // Клітинка 559×740: ширина вузьке місце, 559 − 28 = 531.
    expect(l.dialSize).toBe(531);
  });

  it('два в портреті стають ОДИН ПІД ОДНИМ', () => {
    const l = timerFocusLayout({ ...IPAD_PORTRAIT, count: 2 });
    expect(l.columns).toBe(1);
    expect(l.rows).toBe(2);
    // Клітинка 770×544 → 544 − 151 = 393.
    expect(l.dialSize).toBe(393);
    expect(l.scrolls).toBe(false);
  });

  it('форму диктує область, а не пристрій: телефон в альбомі теж ділить надвоє', () => {
    const portrait = timerFocusLayout({ ...PHONE, count: 2 });
    expect(portrait.columns).toBe(1);
    expect(portrait.dialSize).toBe(149); // 300 − 151

    const landscape = timerFocusLayout({ ...PHONE_LANDSCAPE, count: 2 });
    expect(landscape.columns).toBe(2);
    expect(landscape.dialSize).toBe(159); // 310 − 151
  });

  it('Split View: вузьке високе вікно лишає таймери стовпчиком', () => {
    const l = timerFocusLayout({ ...SPLIT, count: 2 });
    expect(l.columns).toBe(1);
    expect(l.rows).toBe(2);
    expect(l.dialSize).toBe(193); // 344 − 151
  });

  it('три на широкому екрані стають у ряд рівними', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 3 });
    expect(l.columns).toBe(3);
    expect(new Set(l.widths).size).toBe(1);
    // Клітинка 368.67×740 → 368.67 − 28 = 340.67 → 341.
    expect(l.dialSize).toBe(341);
  });

  it('три на телефоні — 2+1, бо три поспіль дають утричі менший циферблат', () => {
    const l = timerFocusLayout({ ...PHONE, count: 3 });
    expect(l.columns).toBe(2);
    expect(l.rows).toBe(2);
    expect(l.widths).toEqual([173, 173, 358]);
    // 173 − 28 = 145 у перших двох; розтягнутий обмежений тією ж висотою (149),
    // але розмір один на всіх — за найменшою клітинкою.
    expect(l.dialSize).toBe(145);
  });

  it('чотири — це 2×2, а не чотири смуги, хоч смуги й дали б більше', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 4 });
    expect(l.columns).toBe(2);
    expect(l.rows).toBe(2);
    expect(new Set(l.widths).size).toBe(1);
    // 364 − 151 = 213. Чотири колонки дали б 246, але клітинка 273×740 —
    // це смуга, а не місце під годинник.
    expect(l.dialSize).toBe(213);
    expect(l.scrolls).toBe(false);
  });

  it('чотири на телефоні — теж 2×2, а не стовпчик по 72', () => {
    const l = timerFocusLayout({ ...PHONE, count: 4 });
    expect(l.columns).toBe(2);
    expect(l.rows).toBe(2);
    expect(l.dialSize).toBe(145);
  });

  it('менше таймерів — не менший циферблат', () => {
    let previous = Infinity;
    for (const count of [1, 2, 3, 4]) {
      const { dialSize } = timerFocusLayout({ ...IPAD_LANDSCAPE, count });
      expect(dialSize).toBeLessThanOrEqual(previous);
      previous = dialSize;
    }
  });
});

describe('timerFocusLayout — п\'ять і більше: сітка з прокруткою', () => {
  it('п\'ятий вмикає скрол і не тисне решту', () => {
    const four = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 4 });
    const five = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 5 });
    expect(five.columns).toBe(2);
    expect(five.rows).toBe(2);
    expect(five.scrolls).toBe(true);
    expect(five.cellHeight).toBe(four.cellHeight);
    expect(five.dialSize).toBe(four.dialSize);
    // Непарний останній розтягується на весь ряд — без дірки поряд.
    expect(five.widths[4]).toBe(IPAD_LANDSCAPE.width);
  });

  it('вісім не зменшує клітинку далі — просто довший скрол', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 8 });
    expect(l.widths).toHaveLength(8);
    expect(new Set(l.widths).size).toBe(1);
    expect(l.cellHeight).toBe(364);
    expect(l.dialSize).toBe(213);
    expect(l.scrolls).toBe(true);
  });

  it('у вузькому вікні скрол-режим лишається одноколонковим', () => {
    const l = timerFocusLayout({ ...PHONE, count: 5 });
    expect(l.columns).toBe(1);
    expect(l.rows).toBe(4);
    expect(l.scrolls).toBe(true);
  });
});

describe('timerFocusLayout — межі', () => {
  it('клітинка не падає нижче порогу читабельності — замість цього скрол', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, height: 120, count: 4 });
    expect(l.cellHeight).toBe(IPAD_LANDSCAPE.minCellHeight);
    expect(l.scrolls).toBe(true);
  });

  it('порожній список не ділить на нуль', () => {
    const l = timerFocusLayout({ ...IPAD_LANDSCAPE, count: 0 });
    expect(l.widths).toEqual([]);
    expect(Number.isFinite(l.cellHeight)).toBe(true);
    expect(Number.isFinite(l.dialSize)).toBe(true);
  });

  it('циферблат разом із хромом влазить у клітинку — інакше він наліз би на «Стоп»', () => {
    const areas = [IPAD_LANDSCAPE, IPAD_PORTRAIT, PHONE, PHONE_LANDSCAPE, SPLIT];
    for (const area of areas) {
      for (let count = 1; count <= 8; count++) {
        const l = timerFocusLayout({ ...area, count });
        const fits = Math.min(
          Math.min(...l.widths) - 28,
          l.cellHeight - chrome(l.cellHeight),
        );
        // 72 — підлога: у тісній клітинці циферблат свідомо лишається видимим.
        expect(l.dialSize).toBeLessThanOrEqual(Math.max(72, Math.round(fits)));
        expect(l.dialSize).toBeGreaterThanOrEqual(72);
      }
    }
  });
});

describe('timerDialSize / timerExpandedDialSize', () => {
  it('стелі немає: величезна клітинка дає величезний циферблат', () => {
    // Раніше тут було 240 — і саме через це iPad нічого не вигравав.
    expect(timerDialSize(2000, 2000)).toBe(2000 - 151);
  });

  it('підлога лишається: у тісній клітинці фігура не зникає', () => {
    expect(timerDialSize(120, 140)).toBe(72);
  });

  it('обмежує менша сторона', () => {
    expect(timerDialSize(1000, 200)).toBeLessThan(timerDialSize(1000, 400));
  });

  it('рядки підзавдань відкушують місце саме там, де вони з\'являються', () => {
    expect(timerCellSubtaskRows(149)).toBe(0);
    expect(timerCellSubtaskRows(150)).toBe(1);
    expect(timerCellSubtaskRows(200)).toBe(2);
    expect(timerCellSubtaskRows(260)).toBe(3);
  });

  it('розгорнутий вигляд теж без стелі 320', () => {
    // 740 − 120 (хром) = 620; ширина 1102 не заважає.
    expect(timerExpandedDialSize(1130, 740)).toBe(620);
    expect(timerExpandedDialSize(358, 612)).toBe(330); // тут ріже ширина
  });

  it('розгорнути НЕ МОЖЕ виявитись меншим за сітку', () => {
    // Жест «розгорнути» мусить збільшувати. Поки сітка впиралася в стелю 240,
    // це виходило само; коли стелю прибрали, розгорнутий вигляд із часткою
    // висоти став меншим за клітинку — і тап зменшував циферблат.
    for (const area of [IPAD_LANDSCAPE, IPAD_PORTRAIT, PHONE, SPLIT]) {
      const grid = timerFocusLayout({ ...area, count: 1 });
      expect(timerExpandedDialSize(area.width, area.height))
        .toBeGreaterThanOrEqual(grid.dialSize);
    }
  });
});
