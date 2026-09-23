/**
 * Паритет формул тренувань із сервером (training-module.md §10.3).
 *
 * Фікстура — копія `flowi-server-app/core/training_fixtures/training-xp-cases.json`
 * (згенерована з еталона `core/training_xp.py`). Якщо сусідній репозиторій
 * сервера лежить поруч — копія мусить збігатися з оригіналом байт у байт,
 * інакше тест паритету охороняв би застарілі числа.
 */
import fs from 'fs';
import path from 'path';

import {
  awardXp,
  BASE_BP,
  currentStreak,
  isoWeekLabel,
  isoWeekMonday,
  multiplierBp,
  progressed,
  questBaseXp,
  ROUND_G,
  sessionBaseXp,
  sessionDate,
  STREAK_MAX_BP,
  STREAK_STEP_BP,
  STREAK_STEP_DAYS,
  streakBefore,
  trainingDays,
  XP_QUEST_MAX,
  XP_QUEST_MIN,
  XP_SESSION_BASE,
} from '@/utils/trainingXp';

const LOCAL = path.join(__dirname, 'fixtures', 'training-xp-cases.json');
const SERVER = path.join(__dirname, '..', '..', 'flowi-server-app', 'core', 'training_fixtures', 'training-xp-cases.json');
const cases = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));

describe('паритет із core/training_xp.py', () => {
  it('копія фікстури збігається з серверною (якщо сервер поруч)', () => {
    if (!fs.existsSync(SERVER)) return;
    expect(fs.readFileSync(LOCAL, 'utf8')).toBe(fs.readFileSync(SERVER, 'utf8'));
  });

  it('константи', () => {
    expect(cases.constants).toEqual({
      XP_SESSION_BASE, XP_QUEST_MIN, XP_QUEST_MAX, BASE_BP,
      STREAK_STEP_DAYS, STREAK_STEP_BP, STREAK_MAX_BP, ROUND_G,
    });
  });

  it.each(cases.xp as { base_xp: number; streak_days_before: number; multiplier_bp: number; xp: number }[])(
    'xp base=$base_xp streak=$streak_days_before',
    c => {
      expect(multiplierBp(c.streak_days_before)).toBe(c.multiplier_bp);
      expect(awardXp(c.base_xp, c.streak_days_before)).toBe(c.xp);
    },
  );

  it.each(cases.progression as { block: never; week: number; weightG: number; reps: number }[])(
    'прогресія тиждень $week',
    c => {
      expect(progressed(c.block, c.week)).toEqual({ weightG: c.weightG, reps: c.reps });
    },
  );

  it.each(cases.session_dates as { start_date: string; week: number; day_of_week: number; date: string }[])(
    'дата сесії $start_date w$week d$day_of_week',
    c => {
      expect(sessionDate(c.start_date, c.week, c.day_of_week)).toBe(c.date);
    },
  );

  it.each(cases.quest_base as { xp_reward: unknown; xp_rules: never; base_xp: number }[])(
    'база квеста $xp_reward',
    c => {
      expect(questBaseXp(c.xp_reward, c.xp_rules)).toBe(c.base_xp);
    },
  );

  it.each(cases.session_base as { xp_rules: never; base_xp: number }[])('база сесії', c => {
    expect(sessionBaseXp(c.xp_rules)).toBe(c.base_xp);
  });
});

describe('стрік (§6.2)', () => {
  const planned = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'];

  it('неплановий день не рве й не збільшує стрік', () => {
    const closed = ['2026-10-05', '2026-10-07', '2026-10-09'];
    // Вівторок/четвер без сесій — стрік «Пн/Ср/Пт» не рветься.
    expect(streakBefore('2026-10-12', planned, closed)).toBe(3);
  });

  it('перший незакритий плановий день зупиняє відлік', () => {
    expect(streakBefore('2026-10-12', planned, ['2026-10-05', '2026-10-09'])).toBe(1);
  });

  it('поточний стрік додає сьогоднішній закритий день', () => {
    const closed = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'];
    expect(currentStreak('2026-10-12', planned, closed)).toEqual({ streak: 4, lastDay: '2026-10-12' });
  });

  it('перша подія в житті дає ×1.0', () => {
    expect(awardXp(50, streakBefore('2026-10-05', [], []))).toBe(50);
  });
});

describe('календарні хелпери', () => {
  it('ISO-тиждень і понеділок', () => {
    expect(isoWeekLabel('2026-10-06')).toBe('2026-W41');
    expect(isoWeekLabel('2027-01-01')).toBe('2026-W53');
    expect(isoWeekMonday('2026-10-11')).toBe('2026-10-05');
  });

  it('день без блоків — відпочинок, дубль dayOfWeek — перший виграє', () => {
    const days = trainingDays({
      days: [
        { dayOfWeek: 3, blocks: [{}] },
        { dayOfWeek: 1, blocks: [] },
        { dayOfWeek: 3, blocks: [{}, {}] },
        { dayOfWeek: 5, blocks: [{}] },
      ],
    });
    expect(days.map(d => d.dayOfWeek)).toEqual([3, 5]);
    expect(days[0].blocks).toHaveLength(1);
  });
});
