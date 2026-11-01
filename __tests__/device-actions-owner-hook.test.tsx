/**
 * useDeviceActionDrain (iOS) тримає власника черги App Group (NATIVE CONTRACT):
 * увійшов — id користувача; вийшов — null і порожня черга; дренаж лише з власником.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
  multiGet: jest.fn(async () => []),
}));
let mockAuth: { status: string; user: { id: unknown } | null } = { status: 'loading', user: null };
jest.mock('@/store/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('@/store/migrations', () => ({ ensureStorageMigrations: jest.fn(async () => {}) }));

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import * as IosBridge from '@/modules/flowi-ios-bridge';
import { useDeviceActionDrain } from '@/store/device-actions';

function Probe() { useDeviceActionDrain(); return null; }

it('власник = поточний користувач; вихід — null і очищена черга', async () => {
  const native = {
    setDeviceActionOwner: jest.fn(),
    clearPendingActions: jest.fn(),
    readPendingActions: jest.fn(() => '[]'),
    removePendingActions: jest.fn(),
    addListener: jest.fn(() => ({ remove() {} })),
  };
  IosBridge.__setIosBridgeForTests(native);
  let tree!: ReactTestRenderer;
  try {
    await act(async () => { tree = create(<Probe />); });
    expect(native.setDeviceActionOwner).not.toHaveBeenCalled();

    mockAuth = { status: 'authed', user: { id: 7 } };
    await act(async () => { tree.update(<Probe />); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(native.setDeviceActionOwner).toHaveBeenLastCalledWith('7');
    expect(native.clearPendingActions).not.toHaveBeenCalled();
    expect(native.readPendingActions).toHaveBeenCalled();

    mockAuth = { status: 'guest', user: null };
    await act(async () => { tree.update(<Probe />); });
    expect(native.setDeviceActionOwner).toHaveBeenLastCalledWith(null);
    expect(native.clearPendingActions).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { tree?.unmount(); });
    IosBridge.__setIosBridgeForTests(undefined);
  }
});
