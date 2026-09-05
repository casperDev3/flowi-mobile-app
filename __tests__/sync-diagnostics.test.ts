/**
 * Діагностика тригера синхронізації: лічильники й вердикт.
 *
 * Сенс тестів — не в самих числах, а в тому, що різні аварії ланцюга дають
 * РІЗНІ знімки. Панель на телефоні корисна рівно доти, доки за нею можна
 * назвати винну ланку, не здогадуючись.
 */

type Diag = typeof import('@/store/sync-diagnostics');

/** Модульні лічильники — синглтон, тож кожен сценарій бере свіжий модуль. */
function freshDiag(): Diag {
  let module!: Diag;
  jest.isolateModules(() => {
    module = require('@/store/sync-diagnostics') as Diag;
  });
  return module;
}

describe('sync-diagnostics', () => {
  it('лічить сповіщення, що впали в заглушку після cleanup', () => {
    const d = freshDiag();
    d.recordSchedulerInstalled('live', 'aaa');
    d.recordSchedulerInstalled('noop', 'aaa');
    d.recordNotify('noop');
    d.recordNotify('noop');

    const snapshot = d.getSyncDiagnostics();
    expect(snapshot.scheduler.tag).toBe('noop');
    expect(snapshot.scheduler.installs).toBe(1);
    expect(snapshot.scheduler.uninstalls).toBe(1);
    expect(snapshot.notify.count).toBe(2);
    expect(snapshot.notify.droppedNoop).toBe(2);
    expect(snapshot.notify.droppedNull).toBe(0);
    expect(d.diagnoseTrigger(snapshot)).toMatch(/заглушка/);
  });

  it('відрізняє з\'їдений гейтом тік від тіка, якого не було', () => {
    const gated = freshDiag();
    gated.recordSchedulerInstalled('live', 'aaa');
    gated.recordNotify('live');
    gated.recordDebounceArmed(5000, 'outbox', false);
    gated.recordDebounceFired();
    gated.recordSyncAttempt('busy', 'debounce');

    const gatedSnapshot = gated.getSyncDiagnostics();
    expect(gatedSnapshot.debounce.fired).toBe(1);
    expect(gatedSnapshot.attempts.entered).toBe(0);
    expect(gatedSnapshot.attempts.blocked.busy).toBe(1);
    expect(gatedSnapshot.attempts.lastBlockedTrigger).toBe('debounce');
    expect(gated.diagnoseTrigger(gatedSnapshot)).toMatch(/вже йде/);

    const starved = freshDiag();
    starved.recordSchedulerInstalled('live', 'aaa');
    starved.recordDebounceArmed(5000, 'outbox', false);
    starved.recordDebounceArmed(800, 'ws', true);

    const starvedSnapshot = starved.getSyncDiagnostics();
    expect(starvedSnapshot.debounce.fired).toBe(0);
    expect(starvedSnapshot.debounce.cancelled.rearm).toBe(1);
    expect(starved.diagnoseTrigger(starvedSnapshot)).toMatch(/перезводиться/);
  });

  it('бачить дебаунс, погашений згортанням застосунку', () => {
    const d = freshDiag();
    d.recordSchedulerInstalled('live', 'aaa');
    d.recordNotify('live');
    d.recordDebounceArmed(5000, 'outbox', false);
    d.recordAppState('active', 'inactive');
    d.recordDebounceCancelled('flush');
    d.recordSyncAttempt('busy', 'debounce');

    const snapshot = d.getSyncDiagnostics();
    expect(snapshot.debounce.cancelled.flush).toBe(1);
    expect(snapshot.appState.toBackground).toBe(1);
    expect(d.diagnoseTrigger(snapshot)).toMatch(/згортання/);
  });

  it('називає ланцюг цілим, коли обмін дійшов до кінця', () => {
    const d = freshDiag();
    d.recordSchedulerInstalled('live', 'aaa');
    d.recordNotify('live');
    d.recordDebounceArmed(5000, 'outbox', false);
    d.recordDebounceFired();
    d.recordSyncAttempt(null, 'debounce');
    d.recordSyncOutcome('ok', 1200);

    const snapshot = d.getSyncDiagnostics();
    expect(snapshot.attempts.entered).toBe(1);
    expect(snapshot.attempts.lastOutcome).toBe('ok');
    expect(d.diagnoseTrigger(snapshot)).toMatch(/цілий/);
  });

  it('журнал не росте безмежно', () => {
    const d = freshDiag();
    for (let i = 0; i < 120; i++) d.recordNotify('live');
    expect(d.getSyncDiagnostics().events.length).toBeLessThanOrEqual(40);
  });
});
