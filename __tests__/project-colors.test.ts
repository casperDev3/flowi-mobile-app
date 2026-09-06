/**
 * __tests__/project-colors.test.ts — вибір кольору для нового проєкту.
 *
 * Дзеркало веб-тесту lib/project-colors.test.mjs: ті самі випадки, ті самі
 * очікування. Розбіжність тут означає, що той самий проєкт на телефоні й у
 * браузері отримає різний колір.
 */

import { PROJECT_COLORS, nextProjectColor, type ProjectColorLike } from '../utils/projectColors';

const [FIRST, SECOND, THIRD] = PROJECT_COLORS;

describe('nextProjectColor', () => {
  test('порожня палітра — порожній рядок, а не виняток', () => {
    // Колір вигадувати нізвідки: краще помітно порожнє значення, ніж літерал,
    // якого власник палітри не давав.
    expect(nextProjectColor([{ color: FIRST }], [])).toBe('');
  });

  test('порожній список проєктів — перший колір палітри', () => {
    expect(nextProjectColor([])).toBe(FIRST);
  });

  test('перший колір зайнятий — беремо НАСТУПНИЙ, а не той самий', () => {
    // Заради цього функція й існує: інакше всі швидко створені проєкти були б
    // одного кольору, і крапка біля задачі перестала б розрізняти.
    expect(nextProjectColor([{ color: FIRST }])).toBe(SECOND);
  });

  test('архівний проєкт теж займає колір', () => {
    // Архівний проєкт не зник — його повертають з архіву, і колір має чекати.
    // Тип ширший за ProjectColorLike навмисно: у реальних даних поруч із
    // кольором їдуть решта полів проєкту, і лічильник має їх не помічати.
    const frozen: ProjectColorLike & { archivedAt: string } = {
      color: FIRST,
      archivedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(nextProjectColor([frozen])).toBe(SECOND);
  });

  test('усі кольори зайняті — найрідше вживаний', () => {
    const projects: ProjectColorLike[] = PROJECT_COLORS.map(color => ({ color }));
    projects.push({ color: FIRST }, { color: SECOND });
    // FIRST і SECOND мають по два, решта — по одному; третій іде першим серед
    // тих, у кого один.
    expect(nextProjectColor(projects)).toBe(THIRD);
  });

  test('нічия розвʼязується першим індексом палітри, а не порядком проєктів', () => {
    // Порядок масиву на телефоні й на вебі різний — відповідь від нього
    // залежати не має.
    const projects: ProjectColorLike[] = PROJECT_COLORS.map(color => ({ color }));
    expect(nextProjectColor(projects)).toBe(FIRST);
    expect(nextProjectColor([...projects].reverse())).toBe(FIRST);
  });

  test('колір поза палітрою лічильник ігнорує', () => {
    // Проєкти, пофарбовані руками до цієї функції, не мусять ламати вибір.
    expect(nextProjectColor([{ color: '#123456' }, { color: null }, {}])).toBe(FIRST);
  });

  test('регістр шістнадцяткового запису значення не має', () => {
    expect(nextProjectColor([{ color: FIRST.toLowerCase() }, { color: `  ${SECOND}  ` }])).toBe(THIRD);
  });

  test('палітра — аргумент: кожна платформа передає свою', () => {
    const custom = ['#000000', '#FFFFFF'];
    expect(nextProjectColor([{ color: '#000000' }], custom)).toBe('#FFFFFF');
  });
});
