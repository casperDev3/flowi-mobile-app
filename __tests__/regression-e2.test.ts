/**
 * __tests__/regression-e2.test.ts — регресійні сторожі підсумкової фази аудиту E2.
 *
 * Сюди зведено те, що ПІДДАЄТЬСЯ модульному тесту з трьох P0 і кількох P1.
 * Те, що перевіряється лише пальцем на пристрої (чи справді аркуш гортається,
 * чи справді VoiceOver читає окремі контроли), живе в
 * `e2e-native/flows/regression-e2.yaml` — цей файл його НЕ дублює і не вдає,
 * що довів.
 *
 * ЧОМУ СТОРОЖІ ПО ДЖЕРЕЛУ, А НЕ ПО ЖИВОМУ ДЕРЕВУ. Механізм NAT-03 нативний:
 * на iOS `Pressable` з `onPress` сам стає елементом доступності й склеює все
 * піддерево. react-test-renderer у jsdom цього не робить — у ньому дерево
 * виглядає правильним і ДО правки, і ПІСЛЯ. Тобто живий тест тут дав би
 * зелене з хибних причин. Єдине, що можна чесно зафіксувати в jest, —
 * наявність `accessible={false}` у джерелі; факт озвучення міряє прогін
 * `maestro hierarchy`, і його числа наведені в шапці кожного блоку.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

/** Усі .tsx застосунку (без тестів, збірок і нативних проєктів). */
function appSources(): string[] {
  const out: string[] = [];
  const skip = ['node_modules', '.git', 'ios', 'android', '.artifacts', '__tests__', 'e2e-native', 'e2e-audit'];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skip.includes(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.tsx')) {
        out.push(path.join(dir, entry.name));
      }
    }
  })(ROOT);
  return out.sort();
}

/**
 * Відкриваючі теги дотикових компонентів разом із їхнім тілом атрибутів.
 *
 * Регексом це не робиться: атрибути містять `{{ }}` зі своїми `>` (стрілкові
 * функції, порівняння), тому сканер рахує глибину фігурних дужок і зупиняється
 * на першому `>` на нульовій глибині. Саме через це наївний
 * `<Pressable[^>]*>` мовчки пропускав багаторядкові теги — тобто перевіряв не
 * там, де дефект.
 */
function touchableTags(source: string): { name: string; line: number; attrs: string; selfClosing: boolean }[] {
  const out: { name: string; line: number; attrs: string; selfClosing: boolean }[] = [];
  const re = /<(Pressable|Animated\.Pressable|TouchableOpacity|TouchableWithoutFeedback)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let i = re.lastIndex;
    let depth = 0;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) {
        out.push({
          name: m[1],
          line: source.slice(0, m.index).split('\n').length,
          attrs: source.slice(re.lastIndex, i),
          selfClosing: source[i - 1] === '/',
        });
        break;
      }
      i++;
    }
  }
  return out;
}

const SOURCES = appSources().map(file => ({ file, rel: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }));

// ─────────────────────────────────────────────────────────────────────────────
describe('NAT-03 (P0) — модальні аркуші не злипаються в один елемент доступності', () => {
  /**
   * Дві РІЗНІ обгортки, і лагодити треба обидві.
   *
   * 1. Внутрішня — `onPress={e => e.stopPropagation()}`, існує лише щоб тап по
   *    аркушу не долітав до бекдропу.
   * 2. Зовнішня — сам БЕКДРОП: `<Pressable style={overlay} onPress={close}>`,
   *    усередині якого лежить аркуш.
   *
   * Перший прохід аудиту полагодив лише внутрішню, і це не дало НІЧОГО:
   * бекдроп — її предок, тож він і далі склеював усе піддерево. Зміряно на
   * пристрої: форма «Новий проєкт» лишалась одним вузлом [0,0][402,874] з
   * підписом «Закрити, Новий проект, Назва проєкту, …, Скасувати, Створити»
   * попри `accessible={false}` на внутрішній обгортці. Після правки бекдропу
   * та сама форма дає окремі вузли.
   */
  const isStopPropagationWrapper = (attrs: string) =>
    /onPress=\{\s*\(?\s*e\s*\)?\s*=>\s*e\.stopPropagation\(\)\s*\}/.test(attrs);

  const isDismissBackdrop = (attrs: string) =>
    attrs.includes('onPress')
    && !isStopPropagationWrapper(attrs)
    && ((/flex:\s*1/.test(attrs) && attrs.includes('rgba(0,0,0'))
      || /style=\{+\s*\w*\.?(overlay|backdrop)\b/i.test(attrs));

  /**
   * Два справжні контроли, що збігаються з евристикою бекдропу, але ними не є:
   * обидва — кнопки з `flex: 1` і майже прозорим тлом `rgba(0,0,0,0.0…)`.
   * Їм `accessible={false}` ставити НЕ можна — вони й мають озвучуватись.
   */
  const NOT_BACKDROPS = new Set(['app/workouts.tsx:367', 'app/workouts.tsx:1145']);

  it('кожна обгортка-stopPropagation має accessible={false}', () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      for (const tag of touchableTags(text)) {
        if (tag.selfClosing || !isStopPropagationWrapper(tag.attrs)) continue;
        if (!tag.attrs.includes('accessible={false}')) offenders.push(`${rel}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('кожен бекдроп-дисміс, що обгортає вміст модалки, має accessible={false}', () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (!text.includes('<Modal')) continue;
      for (const tag of touchableTags(text)) {
        if (tag.selfClosing || !isDismissBackdrop(tag.attrs)) continue;
        if (NOT_BACKDROPS.has(`${rel}:${tag.line}`)) continue;
        if (!tag.attrs.includes('accessible={false}')) offenders.push(`${rel}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('accessible={false} не з\'їв ізоляцію фону: accessibilityViewIsModal лишився в репозиторії', () => {
    // Нативний звіт у «Перевірених позитивах» окремо просив не зламати
    // accessibilityViewIsModal, лагодячи NAT-03: без нього ротор VoiceOver
    // ходить по екрану ПІД аркушем.
    const withIsModal = SOURCES.filter(s => s.text.includes('accessibilityViewIsModal'));
    expect(withIsModal.length).toBeGreaterThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('NAT-01 (P0) — стеля аркуша задана числом, а не відсотком', () => {
  /**
   * `maxHeight: '90%'` рахується від батька, а батько аркуша — обгортка з
   * `height: auto` у flex-end контейнері. Відсоток від auto не обмежує нічого:
   * аркуш виростав за екран, кнопка «Зберегти» опинялась за межами, і
   * проєкт/звичку/нараду/контейнер неможливо було створити з інтерфейсу.
   *
   * Виняток — аркуші з `position: 'absolute'` + `bottom: 0`: там відсоток
   * резолвиться від рамки модалки на весь екран і працює коректно
   * (ActiveTimersBar, DialPicker, (tabs)/time.tsx). Нативний прогін це
   * підтвердив, тому вони тут дозволені явно, а не «забуті».
   */
  const ABSOLUTE_OK = new Set([
    'app/(tabs)/time.tsx',
    'components/time/ActiveTimersBar.tsx',
    'components/time/DialPicker.tsx',
  ]);

  it('жоден аркуш у файлі з <Modal> не тримає відсоткову стелю висоти', () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (!text.includes('<Modal') && !rel.startsWith('components/')) continue;
      if (ABSOLUTE_OK.has(rel)) continue;
      const re = /maxHeight:\s*'(\d+)%'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        offenders.push(`${rel}:${text.slice(0, m.index).split('\n').length} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('дозволені відсотки справді стоять на position:absolute', () => {
    for (const rel of ABSOLUTE_OK) {
      const text = SOURCES.find(s => s.rel === rel)!.text;
      const re = /maxHeight:\s*'\d+%'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        // Блок стилю, у якому лежить стеля, мусить нести absolute-позицію:
        // інакше виняток перестав бути винятком і його треба переглянути.
        const block = text.slice(Math.max(0, m.index - 400), m.index + 200);
        expect(block).toMatch(/position:\s*'absolute'/);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('NAT-02 (P0) — передача керування між модалками йде через чергу', () => {
  /**
   * `setShowAdd(false); openAccountForm(null);` в одному тіку презентував друге
   * вікно, поки SheetModal тримав перше змонтованим 150 мс заради exit-
   * анімації. iOS губив презентацію, а прозоре вікно лишалось зверху і їло ВСІ
   * дотики екрана Фінансів — назавжди, до перезапуску застосунку.
   */
  const handoff = fs.readFileSync(path.join(ROOT, 'components/finance/sheetHandoff.ts'), 'utf8');
  const explore = SOURCES.find(s => s.rel === 'app/(tabs)/explore.tsx')!.text;

  it('модуль черги існує і несе обидва шляхи — після exit-анімації і після кадру', () => {
    expect(handoff).toMatch(/afterFrame/);
    expect(handoff).toMatch(/MODAL_EXIT_MS/);
  });

  it('Фінанси не міняють дві модалки в одному тіку', () => {
    // Пряма форма дефекту: закриття і відкриття підряд в одному обробнику.
    expect(explore).not.toMatch(/setShowAdd\(false\);\s*openAccountForm\(/);
    expect(explore).toMatch(/openAfterModalExit|sheetHandoff|handleAddSheetClosed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ERR-06 / DI-05 — синк і нагадування доведені до місця вживання', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'store/sync-engine.tsx'), 'utf8');
  const layout = SOURCES.find(s => s.rel === 'app/_layout.tsx')!.text;

  it('карантин відхилень оновлює лічильник — інакше проєктні відхилення не видно до перезапуску', () => {
    // Проєктний потік (store/project-sync.ts) кладе rejected у той самий
    // журнал sync_rejected_v2, але лічильник оновлювався лише на особистому
    // шляху, тож бейдж «відхилено» з'являвся аж на наступному особистому синку.
    const fn = engine.slice(engine.indexOf('export async function quarantineRejections'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(body).toMatch(/updateRejectedCount\(/);
  });

  it('переплановування нагадувань здоровʼя справді викликається з кореня', () => {
    // Функція була написана й покрита тестами, але її ніхто не кликав:
    // ліки та звички з іншого пристрою не нагадували взагалі.
    expect(layout).toMatch(/rescheduleHealthRemindersFromStorage/);
    expect(layout).toMatch(/key === 'health_meds'|key === 'health_habits'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('I18N-06 — жодного підпису доступності, зашитого кирилицею, у спільних компонентах', () => {
  /**
   * Свідомий, ВИДИМИЙ борг, а не виняток «щоб зеленіло».
   *
   * `SyncDiagnosticsPanel` — панель діагностики, українська в ній не лише в
   * підписі доступності, а й у всьому видимому тексті. Перевести її означає
   * завести нові ключі в `store/translations.ts`, тобто це I18N-01 (цілий
   * екран), а не I18N-06 (підпис, що розійшовся з видимим текстом). Знімати
   * борг наполовину гірше, ніж лишити його порахованим.
   */
  const KNOWN_GAPS = ['components/shared/SyncDiagnosticsPanel.tsx'];

  it('components/shared і components/today не озвучують англійський інтерфейс українською', () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (!rel.startsWith('components/shared/') && !rel.startsWith('components/today/')) continue;
      if (KNOWN_GAPS.includes(rel)) continue;
      const re = /accessibilityLabel="([^"]*[А-Яа-яІіЇїЄєҐґ][^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        offenders.push(`${rel}: ${m[1]}`);
      }
    }
    // SheetModal обгортає КОЖНУ шторку застосунку — його «Закрити» звучало
    // українською в англійському інтерфейсі на кожному аркуші.
    expect(offenders).toEqual([]);
  });

  it('перелік відомих прогалин не росте мовчки', () => {
    // Якщо борг кудись подівся — виняток треба прибрати, а не носити далі.
    for (const rel of KNOWN_GAPS) {
      const text = SOURCES.find(s => s.rel === rel)?.text ?? '';
      expect(text).toMatch(/accessibilityLabel="[^"]*[А-Яа-яІіЇїЄєҐґ]/);
    }
  });
});
