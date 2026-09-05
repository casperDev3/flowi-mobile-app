import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

import { SyncDiagnosticsPanel } from '@/components/shared/SyncDiagnosticsPanel';

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (_k: string, f: unknown) => f),
  saveData: jest.fn(async () => {}),
  subscribeToStorage: jest.fn(() => () => {}),
  notifyStorageChanged: jest.fn(),
}));

const c = {
  text: '#fff', sub: '#aaa', border: '#333', accent: '#7C3AED',
  green: '#0f0', orange: '#fa0', red: '#f00', dim: '#111',
};

test('панель розгортається без падінь', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <SyncDiagnosticsPanel c={c} uiOnline uiAuthStatus="authed" uiSyncState="idle" />,
    );
  });
  const toggle = tree.root.findAllByProps({ accessibilityRole: 'button' })[0];
  await act(async () => { toggle.props.onPress(); });
  const texts = tree.root.findAllByType(require('react-native').Text)
    .map(t => JSON.stringify(t.props.children));
  expect(texts.join(' ')).toMatch(/Реєстр планувальника/);
  expect(texts.join(' ')).toMatch(/Outbox/);
  await act(async () => { tree.unmount(); });
});
