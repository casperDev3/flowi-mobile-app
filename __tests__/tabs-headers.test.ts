/**
 * __tests__/tabs-headers.test.ts — сторожовий тест верхнього інсету в табах.
 *
 * Найгірший сценарій цієї правки — не регрес, а тиша: якщо на екрані лишити
 * і `SafeAreaView edges={['top']}`, і ScreenHeader, зверху з'явиться зайвих
 * ~60pt порожнечі. Це не падає, не ламає жодної поведінки й виглядає просто
 * «якось негарно», тож на код-рев'ю проходить непоміченим.
 *
 * Тому перевірка статична, по джерелах: рендерити всі таб-екрани довелося б
 * разом з їхніми сховищами, а питання тут суто про розмітку.
 */
import fs from 'fs';
import path from 'path';

const TABS_DIR = path.join(__dirname, '..', 'app', '(tabs)');

const screens = fs.readdirSync(TABS_DIR)
  .filter(f => f.endsWith('.tsx') && f !== '_layout.tsx')
  .map(f => ({ name: f, src: fs.readFileSync(path.join(TABS_DIR, f), 'utf8') }));

describe('верхній інсет таб-екранів', () => {
  it('екрани для тесту взагалі знайшлися', () => {
    // Інакше перейменований каталог зробив би весь сьют зеленим ні про що.
    expect(screens.length).toBeGreaterThanOrEqual(6);
  });

  it.each(screens.map(s => s.name))('%s не використовує нативний SafeAreaView', name => {
    const { src } = screens.find(s => s.name === name)!;
    expect(src).not.toMatch(/<SafeAreaView/);
    expect(src).not.toMatch(/edges=\{\['top'\]\}/);
  });

  it.each(screens.map(s => s.name))('%s бере верхній інсет із JS', name => {
    const { src } = screens.find(s => s.name === name)!;
    // Або через спільний хедер, або напряму хуком — але не з нативного шару.
    expect(src).toMatch(/ScreenHeader|useTopInset/);
  });
});
