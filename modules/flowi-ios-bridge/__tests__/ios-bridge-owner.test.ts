/**
 * NATIVE CONTRACT (owner + clear) у JS-обгортці мосту iOS: виклики доходять до
 * нативного модуля, а без нього (Expo Go, старий білд без нових функцій) — no-op.
 */
import {
  __setIosBridgeForTests,
  clearPendingActions,
  readPendingActions,
  setDeviceActionOwner,
} from '../index';

afterEach(() => __setIosBridgeForTests(undefined));

describe('flowi-ios-bridge owner/clear', () => {
  it('forwards owner and clear to the native module', () => {
    const native = { setDeviceActionOwner: jest.fn(), clearPendingActions: jest.fn() };
    __setIosBridgeForTests(native);
    setDeviceActionOwner('42');
    setDeviceActionOwner(null);
    setDeviceActionOwner('');
    clearPendingActions();
    expect(native.setDeviceActionOwner.mock.calls).toEqual([['42'], [null], [null]]);
    expect(native.clearPendingActions).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the native module or the functions are missing', () => {
    __setIosBridgeForTests(null);
    expect(() => setDeviceActionOwner('1')).not.toThrow();
    expect(() => clearPendingActions()).not.toThrow();
    expect(readPendingActions()).toBe('[]');

    __setIosBridgeForTests({ readPendingActions: () => '[]' });
    expect(() => setDeviceActionOwner('1')).not.toThrow();
    expect(() => clearPendingActions()).not.toThrow();
  });

  it('swallows native errors', () => {
    __setIosBridgeForTests({
      setDeviceActionOwner: () => { throw new Error('boom'); },
      clearPendingActions: () => { throw new Error('boom'); },
    });
    expect(() => setDeviceActionOwner('1')).not.toThrow();
    expect(() => clearPendingActions()).not.toThrow();
  });
});
