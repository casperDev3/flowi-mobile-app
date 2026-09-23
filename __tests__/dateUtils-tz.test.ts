/**
 * Локальна доба проти UTC: `toISOString().slice(0, 10)` і `new Date('YYYY-MM-DD')`
 * дають не ту добу залежно від поясу й години.
 *
 * Пояс мусить бути СПРАВЖНІМ: присвоєння `process.env.TZ` усередині Jest
 * потрапляє в пісочну копію env і рушій його не бачить (тест мовчки ганявся б
 * у поясі машини). Тож сценарій ганяємо в дочірньому `node` з `TZ=...` —
 * `utils/dateUtils.ts` не має імпортів, і Node сам знімає з нього типи.
 * `Etc/GMT-3` — це UTC+3, `Etc/GMT+5` — UTC-5 (знак у Etc/ інвертований).
 */
import { spawnSync } from 'child_process';
import path from 'path';

import { isoToLocalDateInput, localDateInputToIso } from '@/utils/dateUtils';

const DATE_UTILS = path.resolve(__dirname, '../utils/dateUtils.ts');

interface ZoneResult {
  keyAt2330: string;
  keyAt0030: string;
  utcSliceAt2330: string;
  utcSliceAt0030: string;
  noonIso: string | undefined;
  noonHours: number;
  noonDate: number;
  roundTrip: string;
  midnightShown: string;
  dateOnlyShown: string;
  keepsOriginal: boolean;
  changedMoves: boolean;
}

function runInZone(tz: string): ZoneResult {
  const script = `
    import { localDateKey, isoToLocalDateInput, localDateInputToIso } from ${JSON.stringify(DATE_UTILS)};
    const at2330 = new Date(2026, 5, 5, 23, 30);
    const at0030 = new Date(2026, 5, 5, 0, 30);
    const noonIso = localDateInputToIso('2026-06-05');
    const noon = new Date(noonIso);
    const legacy = new Date(2026, 5, 5).toISOString();
    console.log(JSON.stringify({
      keyAt2330: localDateKey(at2330),
      keyAt0030: localDateKey(at0030),
      utcSliceAt2330: at2330.toISOString().slice(0, 10),
      utcSliceAt0030: at0030.toISOString().slice(0, 10),
      noonIso,
      noonHours: noon.getHours(),
      noonDate: noon.getDate(),
      roundTrip: isoToLocalDateInput(noonIso),
      midnightShown: isoToLocalDateInput(legacy),
      dateOnlyShown: isoToLocalDateInput('2026-06-05'),
      keepsOriginal: localDateInputToIso('2026-06-05', legacy) === legacy,
      changedMoves: localDateInputToIso('2026-06-06', legacy) !== legacy,
    }));
  `;
  const out = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  if (out.status !== 0) throw new Error(out.stderr || `node exited ${out.status}`);
  return JSON.parse(out.stdout.trim().split('\n').pop() as string) as ZoneResult;
}

describe.each([
  ['UTC+3', 'Etc/GMT-3', { at2330: '2026-06-05', at0030: '2026-06-04' }],
  ['UTC-5', 'Etc/GMT+5', { at2330: '2026-06-06', at0030: '2026-06-05' }],
])('локальна доба у поясі %s', (_label, tz, utc) => {
  let r: ZoneResult;
  beforeAll(() => { r = runInZone(tz); });

  test('о 23:30 і 00:30 ключ — локальна доба 5 червня', () => {
    expect(r.keyAt2330).toBe('2026-06-05');
    expect(r.keyAt0030).toBe('2026-06-05');
  });

  test('пояс справді застосовано: UTC-зріз дав би іншу добу', () => {
    expect(r.utcSliceAt2330).toBe(utc.at2330);
    expect(r.utcSliceAt0030).toBe(utc.at0030);
  });

  test('поле дати → ISO локального полудня тієї ж доби, і назад', () => {
    expect(r.noonIso).toBeDefined();
    expect(r.noonHours).toBe(12);
    expect(r.noonDate).toBe(5);
    expect(r.roundTrip).toBe('2026-06-05');
  });

  test('ISO локальної півночі показується своєю добою, рядок-дата — як є', () => {
    expect(r.midnightShown).toBe('2026-06-05');
    expect(r.dateOnlyShown).toBe('2026-06-05');
  });

  test('незмінене поле лишає збережене значення, змінене — ні', () => {
    expect(r.keepsOriginal).toBe(true);
    expect(r.changedMoves).toBe(true);
  });
});

describe('межові значення (без залежності від поясу)', () => {
  test('localDateInputToIso: порожнє, неіснуюча доба, сміття → undefined', () => {
    expect(localDateInputToIso('')).toBeUndefined();
    expect(localDateInputToIso('   ')).toBeUndefined();
    expect(localDateInputToIso('2026-02-30')).toBeUndefined();
    expect(localDateInputToIso('не дата')).toBeUndefined();
  });

  test('isoToLocalDateInput: порожнє чи бите → порожній рядок', () => {
    expect(isoToLocalDateInput(undefined)).toBe('');
    expect(isoToLocalDateInput(null)).toBe('');
    expect(isoToLocalDateInput('garbage')).toBe('');
  });
});
