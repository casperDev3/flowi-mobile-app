/**
 * __tests__/icon-mapping.test.ts — кожна вжита іконка мусить бути в мапі Android.
 *
 * Навіщо. `IconSymbol` має дві реалізації: `.ios.tsx` через SF Symbols і
 * `.tsx` через MaterialIcons із рукописною мапою MAPPING. Typecheck резолвить
 * імпорт у `.ios.tsx`, де `name` типізовано вільно (`SymbolViewProps['name']`),
 * тож назва, якої немає в MAPPING, проходить збірку без жодного попередження —
 * і на Android рендериться порожнє місце.
 *
 * Ні typecheck, ні lint цього не ловлять. Цей тест — єдиний захист.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks'];
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'ios', 'android', '__tests__']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.ios.tsx')) out.push(full);
  }
  return out;
}

/** Імена з мапи Android — єдине джерело правди про те, що відрендериться. */
function mappedNames(): Set<string> {
  const src = readFileSync(join(ROOT, 'components/ui/icon-symbol.tsx'), 'utf8');
  const body = src.slice(src.indexOf('const MAPPING'), src.indexOf('export type IconSymbolName'));
  return new Set(Array.from(body.matchAll(/^\s*'([^']+)'\s*:/gm), m => m[1]));
}

/**
 * Літеральні імена іконок із JSX.
 *
 * Свідомо ловимо лише літерали: `name={someVar}` перевірити статично
 * неможливо, і вдавати протилежне було б гірше за чесний пропуск.
 */
function usedNames(): { name: string; file: string }[] {
  const found: { name: string; file: string }[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(/<IconSymbol[^>]*?\bname=(?:"([^"]+)"|\{'([^']+)'\})/gs)) {
        found.push({ name: match[1] ?? match[2], file: file.slice(ROOT.length + 1) });
      }
      // Тернарні вирази: name={cond ? 'a' : 'b'}
      for (const match of src.matchAll(/<IconSymbol[^>]*?\bname=\{[^}]*?\?\s*'([^']+)'\s*:\s*'([^']+)'/gs)) {
        found.push({ name: match[1], file: file.slice(ROOT.length + 1) });
        found.push({ name: match[2], file: file.slice(ROOT.length + 1) });
      }
    }
  }
  return found;
}

describe('мапа іконок для Android', () => {
  test('сканер справді знаходить використання', () => {
    // Захист від тесту, що мовчки нічого не перевіряє через зламаний regex.
    expect(usedNames().length).toBeGreaterThan(50);
    expect(mappedNames().size).toBeGreaterThan(50);
  });

  test('кожна вжита іконка є в мапі', () => {
    const mapped = mappedNames();
    const missing = usedNames()
      .filter(({ name }) => !mapped.has(name))
      .map(({ name, file }) => `${name} — ${file}`);

    expect(Array.from(new Set(missing))).toEqual([]);
  });
});
