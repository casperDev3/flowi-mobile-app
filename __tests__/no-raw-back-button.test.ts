/**
 * __tests__/no-raw-back-button.test.ts — «Назад» лише через спільне правило.
 *
 * Рішення «малювати стрілку чи ні» живе в одному місці — ScreenHeaderNav.ts
 * (телефон — «Назад»; планшет у розділі з сайдбара — нічого; планшет поза
 * сайдбаром — крихти або «Назад»). Екран, що вшиває стрілку в `actions`
 * власним `<HeaderButton>` з `chevron.left` і `router.back()`, це правило
 * обходить: на планшеті стрілка лишається поруч із сайдбаром, а на проєктних
 * підекранах — ще й поруч із крихтами, що вже ведуть нагору.
 *
 * Тест статичний: читає вихідники і шукає саме такий HeaderButton. Правильний
 * шлях — проп `back` у ScreenHeader / ProjectScreenShell (і `crumbs`, де є
 * справжня ієрархія).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Тексти всіх `<HeaderButton …>…</HeaderButton>` у файлі. */
function headerButtonBlocks(src: string): string[] {
  const blocks: string[] = [];
  const open = /<HeaderButton\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    const end = src.indexOf('</HeaderButton>', m.index);
    if (end === -1) continue;
    blocks.push(src.slice(m.index, end));
  }
  return blocks;
}

/** Чи вшита в блок «сира» стрілка назад. */
function isRawBackButton(block: string): boolean {
  return /["']chevron\.left["']/.test(block) && /router\.back\(\)|navigation\.goBack\(\)/.test(block);
}

describe('жоден екран не вшиває «Назад» у HeaderButton в обхід ScreenHeader', () => {
  it('детектор ловить старий шаблон (settings-modules до виправлення)', () => {
    const legacy = `
      <ScreenHeader
        title={tr.modulesTitle}
        actions={
          <HeaderButton
            onPress={() => router.back()}
            accessibilityLabel={tr.back}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </HeaderButton>
        }
      />`;
    const blocks = headerButtonBlocks(legacy);
    expect(blocks).toHaveLength(1);
    expect(isRawBackButton(blocks[0])).toBe(true);
  });

  it('звичайні кнопки хедера — не порушення', () => {
    const ok = `
      <HeaderButton onPress={load} accessibilityLabel={tr.syncNow}>
        <IconSymbol name="arrow.clockwise" size={16} color="#10B981" />
      </HeaderButton>`;
    expect(headerButtonBlocks(ok).some(isRawBackButton)).toBe(false);
  });

  it('у app/ і components/ таких кнопок немає', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        if (headerButtonBlocks(src).some(isRawBackButton)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
