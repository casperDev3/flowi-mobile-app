/**
 * P10 паритет: id наступної копії повторюваної задачі — детермінований і
 * ДОСЛІВНО той самий, що у веба (lib/task-recurrence.ts nextOccurrenceId).
 * Інакше задача, закрита і на вебі, і на телефоні (чи двічі тут після
 * «Скасувати»), давала дві копії з різними id.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildDeadline, deadlineDayKey, nextOccurrenceDeadline } from '@/utils/taskDeadline';
import { nextOccurrenceId, nextRecurrenceDate } from '@/utils/taskRecurrence';

describe('nextOccurrenceId (web parity)', () => {
  it('matches the web id format', () => {
    expect(nextOccurrenceId('abc', '2026-10-27')).toBe('abc-n20261027');
    expect(nextOccurrenceId('abc-n20261027', '2026-11-03')).toBe('abc-n20261103');
    expect(nextOccurrenceId('x'.repeat(80), '2026-10-27')).toHaveLength(64);
  });

  it('same task completed twice yields the same copy id', () => {
    const task = { id: '1760000000000', ...buildDeadline('2026-10-20', '18:30')! };
    const ids = [0, 1].map(() => {
      const f = nextOccurrenceDeadline(task, day => nextRecurrenceDate(day, { freq: 'weekly', interval: 1 }))!;
      return nextOccurrenceId(task.id, deadlineDayKey(f.deadline)!);
    });
    expect(ids[0]).toBe('1760000000000-n20261027');
    expect(ids[1]).toBe(ids[0]);
  });

  it('the Tasks checkbox uses the deterministic id and skips an existing copy', () => {
    const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(src).toMatch(/nextOccurrenceId\(task\.id, nextDay\)/);
    expect(src).toMatch(/!p\.some\(t => t\.id === nextId\)/);
    expect(src).not.toMatch(/id: Date\.now\(\)\.toString\(\) \+ Math\.random\(\)/);
  });
});
