import { timerCandidates, type TimerCandidateTask } from '@/components/time/timerCandidates';

const task = (over: Partial<TimerCandidateTask> & { id: string }): TimerCandidateTask => ({
  title: over.id,
  status: 'active',
  ...over,
});

describe('timerCandidates', () => {
  it('прибирає завершені, беклог і задачі з таймером, що вже йде', () => {
    const list = [
      task({ id: 'done', status: 'done' }),
      task({ id: 'idea', backlogKind: 'idea' }),
      task({ id: 'running' }),
      task({ id: 'ok' }),
    ];
    expect(timerCandidates(list, new Set(['running']), '').map(t => t.id)).toEqual(['ok']);
  });

  it('«У процесі» першими, далі раніший дедлайн, без дедлайну — у кінці', () => {
    const list = [
      task({ id: 'none', createdAt: '2026-10-05' }),
      task({ id: 'late', deadline: '2026-10-20' }),
      task({ id: 'soon', deadline: '2026-10-07' }),
      task({ id: 'wip', kanbanColumnId: 'status-in-progress' }),
    ];
    expect(timerCandidates(list, new Set(), '').map(t => t.id)).toEqual(['wip', 'soon', 'late', 'none']);
  });

  it('шукає за назвою без огляду на регістр', () => {
    const list = [task({ id: 'a', title: 'Звіт за жовтень' }), task({ id: 'b', title: 'Дзвінок' })];
    expect(timerCandidates(list, new Set(), 'звіт').map(t => t.id)).toEqual(['a']);
  });
});
