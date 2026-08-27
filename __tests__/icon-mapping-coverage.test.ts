import fs from 'fs';
import path from 'path';

/**
 * IconSymbol на Android робить MAPPING[name]. Для незнайомої назви це дає
 * undefined, MaterialIcons отримує undefined і не малює нічого — мовчки,
 * без жодної помилки. Типізація це теж не ловить: усі такі місця в коді
 * приводять назву через `as any`, бо назва приходить із таблиці конфігу.
 *
 * Тому інваріант перевіряється тут: кожна назва, яку код десь підставляє
 * як іконку, мусить мати відповідник у MAPPING.
 */
const ROOT = path.join(__dirname, '..');
const MAPPING_FILE = path.join(ROOT, 'components/ui/icon-symbol.tsx');

function readMappedNames(): Set<string> {
  const src = fs.readFileSync(MAPPING_FILE, 'utf8');
  return new Set([...src.matchAll(/^\s*'([^']+)':\s*'[^']+',/gm)].map(m => m[1]));
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !full.includes('icon-symbol')) out.push(full);
    }
  };
  for (const dir of ['app', 'components', 'constants']) walk(path.join(ROOT, dir));
  return out;
}

/**
 * Назви в стилі SF Symbols — з крапками. Одиничні слова навмисно НЕ
 * збираються: вони надто схожі на будь-який інший рядок у коді, і тест
 * почав би падати на випадкових збігах.
 */
function usedIconNames(): Map<string, string[]> {
  const patterns = [
    /\bicon:\s*'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)'/g,
    /\bIconSymbol\s+name=['"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)['"]/g,
    /\bname=\{?['"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)['"]/g,
  ];
  const used = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    // MaterialCommunityIcons типізований власним набором і сюди не належить.
    if (src.includes('MaterialCommunityIcons')) continue;
    for (const p of patterns) {
      for (const m of src.matchAll(p)) {
        const rel = path.relative(ROOT, file);
        used.set(m[1], [...(used.get(m[1]) ?? []), rel]);
      }
    }
  }
  return used;
}

describe('покриття маппінгу іконок', () => {
  it('кожна вживана назва має відповідник', () => {
    const mapped = readMappedNames();
    const missing = [...usedIconNames().entries()]
      .filter(([name]) => !mapped.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`);

    expect(missing).toEqual([]);
  });

  it('у маппінгу немає порожніх значень', () => {
    const src = fs.readFileSync(MAPPING_FILE, 'utf8');
    expect(src).not.toMatch(/^\s*'[^']+':\s*(''|undefined),/m);
  });
});
