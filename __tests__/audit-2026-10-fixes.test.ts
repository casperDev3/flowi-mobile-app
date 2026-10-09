/**
 * Регресії аудиту 2026-10 (P0/P1/P2): id проєкту в табах, стрічка активності,
 * одне правило округлення грошей, чипи проєктів календаря без дублів.
 */
import fs from 'fs';
import path from 'path';

import { projectChipLabels } from '@/components/calendar/CalendarToolbar';
import type { ActivityEntry } from '@/store/project-activity';
import { fiatFractionDigits, formatCurrency } from '@/utils/financeUtils';
import { activityActorName, formatActivityMessage, mergeConsecutiveActivity } from '@/utils/projectActivity';
import { formatSubscriptionMoney } from '@/utils/subscriptions';

const tr = {
  projectActivityCreated: '{actor} створив(ла) «{title}»',
  projectActivityUpdated: '{actor} оновив(ла) «{title}»',
  projectActivityDeleted: '{actor} видалив(ла) «{title}»',
  projectActivityStatusChanged: '{actor} змінив(ла) статус «{title}»: {from} → {to}',
  projectActivityAssigned: '{actor} призначив(ла) «{title}»',
  projectActivityCommented: '{actor} прокоментував(ла) «{title}»',
  projectActivityMemberJoined: '{actor} приєднався(лась)',
  projectActivityMemberLeft: '{actor} вийшов(ла)',
  projectActivityRoleChanged: '{actor} змінив(ла) роль {target}',
  projectActivityUnknownActor: 'Хтось',
};

function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: 1, actor: { id: 7, name: '', email: 'olena@example.com' }, verb: 'updated',
    collection: 'tasks', local_id: 't1', title: 'Погодити банери', changes: [], created_at: '2026-10-07T10:00:00Z',
    ...over,
  };
}

describe('P0: таби простору проєкту передають id', () => {
  it('кожен таб має initialParams з id', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'project', '[id]', '_layout.tsx'), 'utf8');
    const screens = src.match(/<Tabs\.Screen[\s\S]*?\/?>/g) ?? [];
    expect(screens.length).toBeGreaterThanOrEqual(5);
    for (const screen of screens) expect(screen).toMatch(/initialParams=\{\{ id \}\}/);
  });

  it('екрани проєкту читають id через useProjectRouteId', () => {
    for (const file of ['app/project/[id]/tasks.tsx', 'app/project/[id]/calendar.tsx', 'app/project/[id]/more.tsx', 'components/projects/TeamWorkspace.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(src).toMatch(/useProjectRouteId\(\)/);
    }
  });
});

describe('P1: стрічка активності', () => {
  it('статус показується назвою колонки, а не st-uuid', () => {
    const e = entry({ verb: 'status_changed', changes: [{ field: 'status', from: null, to: 'st-a302594d' }] });
    const text = formatActivityMessage(e, tr, { statusNames: new Map([['st-a302594d', 'На перевірці']]) });
    expect(text).toContain('— → На перевірці');
    expect(text).not.toContain('st-a302594d');
  });

  it('автор без імені: імʼя учасника, далі локальна частина пошти, а не «Хтось»', () => {
    expect(activityActorName(entry({}), tr, { memberNames: new Map([[7, 'Олена']]) })).toBe('Олена');
    expect(activityActorName(entry({}), tr)).toBe('olena');
    expect(activityActorName(entry({ actor: null }), tr)).toBe('Хтось');
  });

  it('поспіль однакові «оновив(ла)» зливаються в один', () => {
    const list = [entry({ id: 3 }), entry({ id: 2 }), entry({ id: 1 }), entry({ id: 0, local_id: 't2' })];
    expect(mergeConsecutiveActivity(list).map(e => e.id)).toEqual([3, 0]);
  });
});

describe('P2: одне правило округлення грошей', () => {
  const uah = { code: 'UAH', symbol: '₴', kind: 'fiat' as const, decimals: 2 };

  it('ціла сума — без копійок, дробова — з повною точністю валюти', () => {
    expect(fiatFractionDigits(38150)).toBe(0);
    expect(fiatFractionDigits(38149.5)).toBe(2);
    expect(fiatFractionDigits(1250.004)).toBe(0);
  });

  it('formatCurrency і formatSubscriptionMoney однакові для того самого числа', () => {
    for (const n of [38149.5, 38150, 1250.5]) {
      expect(formatCurrency(n, uah, 'en-US')).toBe(formatSubscriptionMoney(n, 'UAH', [uah], 'en-US'));
    }
    expect(formatCurrency(1250.5, uah, 'en-US')).toContain('1,250.50');
  });
});

describe('P2: чипи проєктів календаря без дублів', () => {
  it('однакові назви отримують номер', () => {
    const labels = projectChipLabels([
      { id: 'a', name: 'P0 Project' }, { id: 'b', name: 'Regress E2' },
      { id: 'c', name: 'P0 Project' }, { id: 'd', name: 'Regress E2' }, { id: 'e', name: 'Solo' },
    ]).map(x => x.label);
    expect(labels).toEqual(['P0 Project', 'Regress E2', 'P0 Project (2)', 'Regress E2 (2)', 'Solo']);
  });
});
