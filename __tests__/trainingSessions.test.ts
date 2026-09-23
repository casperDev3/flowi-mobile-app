/**
 * Сесії, закриття сесії (три записи однією дією, §4.3), програми, квести,
 * розбір запрошення.
 */
import { burnedForDay } from '@/utils/healthUtils';
import {
  applyMissed,
  buildFinishRecords,
  dayKeyInZone,
  formatKg,
  initialActual,
  parseKgToG,
  sessionsForGroup,
  sessionsToMarkMissed,
  statusFromSets,
  todaySession,
  totalVolumeG,
  weekDays,
  withCoachNote,
} from '@/utils/trainingSessions';
import {
  assignmentNeedsReexpand,
  emptyProgram,
  ensureDay,
  addBlock,
  moveBlock,
  previewWeekIndexes,
  programFromPersonal,
  exerciseFromPersonal,
  sessionCount,
  setDay,
  validateProgram,
} from '@/utils/trainingPrograms';
import {
  checkboxProgress,
  isAssignedTo,
  parseTrainingInvite,
  progressFraction,
  validateQuest,
} from '@/utils/trainingQuests';
import type { TrainingSession } from '@/utils/trainingTypes';

const session = (over: Partial<TrainingSession> = {}): TrainingSession => ({
  id: 'ts-ta-1-0-1',
  groupId: 'g-1',
  groupName: 'Ранкова',
  assignmentId: 'ta-1',
  programId: 'tp-1',
  programName: 'Сила',
  weekIndex: 0,
  dayOfWeek: 1,
  date: '2026-10-05',
  title: 'День A',
  type: 'gym',
  status: 'planned',
  plannedExercises: [
    { exerciseId: 'te-2', name: 'Тяга', order: 2, sets: 1, reps: 5, weightG: 100000 },
    { exerciseId: 'te-1', name: 'Жим', order: 1, sets: 2, reps: 8, weightG: 72500 },
  ],
  ...over,
});

describe('сесії', () => {
  it('фільтр групи відкидає биті записи й сортує за датою', () => {
    const all = [session({ id: 'b', date: '2026-10-07' }), { junk: true }, session({ id: 'a' }), session({ id: 'x', groupId: 'g-2' })];
    expect(sessionsForGroup(all, 'g-1').map(s => s.id)).toEqual(['a', 'b']);
  });

  it('сьогоднішня — спершу відкрита', () => {
    const list = [session({ id: 'done', status: 'completed' }), session({ id: 'open' })];
    expect(todaySession(list, '2026-10-05')?.id).toBe('open');
  });

  it('missed — лише planned у минулих днях, решту не чіпає', () => {
    const list = [
      session({ id: 'old', date: '2026-10-01' }),
      session({ id: 'today', date: '2026-10-05' }),
      session({ id: 'done', date: '2026-10-01', status: 'completed' }),
    ];
    const ids = sessionsToMarkMissed(list, '2026-10-05');
    expect(ids).toEqual(['old']);
    const next = applyMissed(list, new Set(ids));
    expect(next.map(s => s.status)).toEqual(['missed', 'planned', 'completed']);
    expect(applyMissed(list, new Set())).toBe(list);
  });

  it('тиждень від понеділка й від неділі', () => {
    expect(weekDays('2026-10-07', 1)[0]).toBe('2026-10-05');
    expect(weekDays('2026-10-07', 0)[0]).toBe('2026-10-04');
    expect(weekDays('2026-10-07', 1)).toHaveLength(7);
  });

  it('день у поясі групи', () => {
    const late = new Date('2026-10-05T22:30:00.000Z');
    expect(dayKeyInZone(late, 'Europe/Kyiv')).toBe('2026-10-06');
    expect(dayKeyInZone(late, 'America/New_York')).toBe('2026-10-05');
  });
});

describe('вага в грамах', () => {
  it('форматування й розбір без float-кілограмів', () => {
    expect(formatKg(72500)).toBe('72.5');
    expect(formatKg(100000)).toBe('100');
    expect(parseKgToG('72,5')).toBe(72500);
    expect(parseKgToG('0.1')).toBe(100);
    expect(parseKgToG('abc')).toBeNull();
    expect(parseKgToG('')).toBe(0);
  });
});

describe('закриття сесії (§4.3)', () => {
  const base = session();

  it('розкладка підходів за order, статус з виконаних', () => {
    const ex = initialActual(base.plannedExercises);
    expect(ex.map(e => e.name)).toEqual(['Жим', 'Тяга']);
    expect(ex[0].sets).toHaveLength(2);
    expect(statusFromSets(ex)).toBe('skipped');
    ex[0].sets[0].done = true;
    expect(statusFromSets(ex)).toBe('partial');
    for (const e of ex) for (const s of e.sets) s.done = true;
    expect(statusFromSets(ex)).toBe('completed');
    expect(totalVolumeG(ex)).toBe(2 * 8 * 72500 + 5 * 100000);
  });

  it('три записи з похідними id, лог несе userId і sessionLocalId', () => {
    const ex = initialActual(base.plannedExercises).map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: true })) }));
    const r = buildFinishRecords({
      session: base, exercises: ex, status: 'completed', userId: 12,
      startedAt: '2026-10-05T07:00:00.000Z', completedAt: '2026-10-05T07:58:00.000Z', calories: 320, xpEstimate: 55,
    });
    expect(r.session.status).toBe('completed');
    expect(r.session.logLocalId).toBe('wl-ts-ta-1-0-1');
    expect(r.session.workoutLocalId).toBe('tw-ts-ta-1-0-1');
    expect(r.log).toMatchObject({ userId: 12, sessionLocalId: base.id, groupId: 'g-1', durationMin: 58, status: 'completed', xpAwarded: 55 });
    expect(r.workout).toMatchObject({ id: 'tw-ts-ta-1-0-1', sessionId: base.id, groupId: 'g-1', calories: 320, durationMin: 58 });
    // Лог тренера не несе даних здоровʼя — калорії лише в особистому журналі.
    expect(r.log).not.toHaveProperty('calories');
  });

  it('калорії сесії рахуються у «Спалено» рівно один раз', () => {
    const ex = initialActual(base.plannedExercises);
    const day = new Date('2026-10-05T12:00:00');
    const r1 = buildFinishRecords({ session: base, exercises: ex, status: 'partial', userId: 1, startedAt: null, completedAt: '2026-10-05T08:00:00Z', calories: 300 });
    // Повторне закриття (інший пристрій) дає той самий id — upsert, не дубль.
    const r2 = buildFinishRecords({ session: base, exercises: ex, status: 'partial', userId: 1, startedAt: null, completedAt: '2026-10-05T09:00:00Z', calories: 300 });
    expect(r1.workout?.id).toBe(r2.workout?.id);
    const workouts = [r2.workout as { date: string; calories: number }];
    expect(burnedForDay([], workouts as never, day)).toBe(300);
  });

  it('пропуск не пише Workout і не дає XP', () => {
    const r = buildFinishRecords({ session: base, exercises: [], status: 'skipped', userId: 1, startedAt: null, completedAt: '2026-10-05T08:00:00Z', xpEstimate: 50 });
    expect(r.workout).toBeNull();
    expect(r.log.xpAwarded).toBe(0);
  });

  it('нотатка тренера міняє лише coachNote', () => {
    const r = buildFinishRecords({ session: base, exercises: [], status: 'partial', userId: 1, startedAt: null, completedAt: '2026-10-05T08:00:00Z' });
    const noted = withCoachNote(r.log, '  Добре!  ');
    const changed = Object.keys(noted).filter(k => (noted as never)[k] !== (r.log as never)[k]);
    expect(changed).toEqual(['coachNote']);
    expect(withCoachNote(r.log, '   ').coachNote).toBeNull();
  });

  it('повторне закриття сесії не затирає нотатку тренера', () => {
    const first = buildFinishRecords({ session: base, exercises: [], status: 'partial', userId: 1, startedAt: null, completedAt: '2026-10-05T08:00:00Z' });
    expect(first.log.coachNote).toBeNull();
    const again = buildFinishRecords({
      session: base, exercises: [], status: 'partial', userId: 1, startedAt: null,
      completedAt: '2026-10-05T09:00:00Z', existingLog: { coachNote: 'Тримай темп' },
    });
    expect(again.log.coachNote).toBe('Тримай темп');
  });
});

describe('програми', () => {
  it('валідація, дні, кількість сесій', () => {
    let p = emptyProgram('tp-1');
    expect(validateProgram(p)).toEqual(['name', 'noDays']);
    p = { ...p, name: 'Сила', weekCount: 8 };
    let day = ensureDay(p, 1);
    day = addBlock(day, { exerciseId: 'te-1', order: 0, sets: 3, reps: 8, weightG: 60000 });
    day = addBlock(day, { exerciseId: 'te-2', order: 0, sets: 3, reps: 8, weightG: 40000 });
    day = moveBlock(day, 1, -1);
    expect(day.blocks.map(b => [b.exerciseId, b.order])).toEqual([['te-2', 1], ['te-1', 2]]);
    p = setDay(p, day);
    p = setDay(p, { ...ensureDay(p, 5), blocks: day.blocks });
    p = setDay(p, ensureDay(p, 3)); // день відпочинку — без сесій
    expect(validateProgram(p)).toEqual([]);
    expect(sessionCount(p, 8)).toBe(16);
  });

  it('прев\'ю тижнів 1/4/8 і для коротких програм', () => {
    expect(previewWeekIndexes(8)).toEqual([0, 3, 7]);
    expect(previewWeekIndexes(12)).toEqual([0, 3, 7]);
    expect(previewWeekIndexes(3)).toEqual([0, 1, 2]);
    expect(previewWeekIndexes(1)).toEqual([0]);
  });

  it('потреба в «Оновити в учасників»', () => {
    const a = { id: 'ta', programId: 'tp', userId: 1, startDate: '2026-10-05', weekCount: 4, status: 'active' as const, sourceRevision: 3 };
    expect(assignmentNeedsReexpand(a, 4)).toBe(true);
    expect(assignmentNeedsReexpand(a, 3)).toBe(false);
    expect(assignmentNeedsReexpand({ ...a, status: 'revoked' }, 9)).toBe(false);
  });

  it('імпорт особистої програми: день на кожне нагадування, вага в грамах', () => {
    const personal = new Map([['e1', { id: 'e1', name: 'Присід', sets: 5, reps: 5, weightKg: 82.5 }]]);
    const group = new Map([['e1', exerciseFromPersonal(personal.get('e1')!, 'te-9')]]);
    const p = programFromPersonal({ id: 'p1', name: 'Моя', exerciseIds: ['e1', 'missing'], reminderDays: [5, 1, 5] }, 'tp-9', group, personal);
    expect(p.days.map(d => d.dayOfWeek)).toEqual([1, 5]);
    expect(p.days[0].blocks).toEqual([expect.objectContaining({ exerciseId: 'te-9', weightG: 82500, sets: 5 })]);
    expect(p.weekCount).toBe(4);
    expect(group.get('e1')?.sourceExerciseId).toBe('e1');
  });
});

describe('квести', () => {
  const q = { id: 'q-1', type: 'measurable' as const, title: '50 км', metric: 'workout_distance_km' as const, targetValue: 50 };

  it('прогрес і призначення', () => {
    expect(progressFraction(q, { id: 'q-1:1', questId: 'q-1', userId: 1, completed: false, currentValue: 25 })).toBe(0.5);
    expect(progressFraction(q, { id: 'q-1:1', questId: 'q-1', userId: 1, completed: true })).toBe(1);
    expect(isAssignedTo({ ...q, assigneeIds: [] }, 5, 'member')).toBe(true);
    expect(isAssignedTo({ ...q, assigneeIds: [] }, 5, 'coach')).toBe(false);
    expect(isAssignedTo({ ...q, assigneeIds: [7] }, 5, 'member')).toBe(false);
  });

  it('чек-квест пише лише агрегати — без полів здоровʼя', () => {
    const p = checkboxProgress({ id: 'q-2', type: 'checkbox', title: 'Фото' }, 12, true, 'file:///x.jpg', '2026-10-05T08:00:00Z');
    expect(p.id).toBe('q-2:12');
    const forbidden = ['entries', 'raw', 'note', 'source', 'weightKg', 'sleepMin', 'calories'];
    expect(Object.keys(p).filter(k => forbidden.includes(k))).toEqual([]);
    expect(checkboxProgress({ id: 'q-2', type: 'checkbox', title: 'Фото' }, 12, false, 'x', 'now').photoUri).toBeNull();
  });

  it('валідація', () => {
    expect(validateQuest({ ...q, title: ' ', targetValue: 0 })).toEqual(['title', 'target']);
    expect(validateQuest({ id: 'q', type: 'checkbox', title: 'x', startDate: '2026-10-10', dueDate: '2026-10-01' })).toEqual(['dates']);
  });
});

describe('запрошення', () => {
  it('посилання вебу, deep link і голий токен', () => {
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';
    expect(parseTrainingInvite(`https://app.x/invite/training?ws=https%3A%2F%2Fapi.x&g=g-1&t=${token}`))
      .toEqual({ token, ws: 'https://api.x', groupId: 'g-1' });
    expect(parseTrainingInvite(`ftrackingapp://training-invite?g=g-1&t=${token}`)?.token).toBe(token);
    expect(parseTrainingInvite(`  ${token} `)?.token).toBe(token);
    expect(parseTrainingInvite('hello world')).toBeNull();
    expect(parseTrainingInvite('https://x/?g=1')).toBeNull();
  });
});

describe('% виконання для тренера', () => {
  const { completionFor, assignmentSessionDates } = jest.requireActual('@/utils/trainingPrograms');
  const program = {
    id: 'tp', name: 'P', weekCount: 2,
    days: [{ dayOfWeek: 1, blocks: [{ exerciseId: 'e', order: 1, sets: 1, reps: 1, weightG: 0 }] },
      { dayOfWeek: 3, blocks: [{ exerciseId: 'e', order: 1, sets: 1, reps: 1, weightG: 0 }] }],
  };
  const a = { id: 'ta', programId: 'tp', userId: 12, startDate: '2026-10-07', weekCount: 2, status: 'active' };

  it('дати як у сервера: старт у середу, понеділок — наступного тижня', () => {
    expect(assignmentSessionDates(a, program)).toEqual(['2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19']);
  });

  it('рахує лише сесії до сьогодні й лише completed з sessionLocalId', () => {
    const logs = [
      { userId: 12, status: 'completed', date: '2026-10-07', sessionLocalId: 's1' },
      { userId: 12, status: 'partial', date: '2026-10-12', sessionLocalId: 's2' },
      { userId: 12, status: 'completed', date: '2026-10-12', sessionLocalId: null },
      { userId: 99, status: 'completed', date: '2026-10-12', sessionLocalId: 's3' },
    ];
    const stats = completionFor(12, [a], new Map([['tp', program]]), logs, '2026-10-13');
    expect(stats).toEqual({ due: 2, completed: 1, percent: 50 });
    expect(completionFor(12, [{ ...a, status: 'revoked' }], new Map([['tp', program]]), logs, '2026-10-13').percent).toBeNull();
  });
});
