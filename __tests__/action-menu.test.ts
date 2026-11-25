/**
 * utils/actionMenu.ts — розгалуження за платформою: Android-овий Alert
 * обрізає кнопки після третьої, тож >3 кнопок на Android ідуть у хост-меню.
 */
import { Alert, Platform } from 'react-native';

import {
  type ActionMenuButton,
  needsListMenu,
  orderMenuButtons,
  registerActionMenuHost,
  showActionMenu,
} from '@/utils/actionMenu';

const originalOS = Platform.OS;
const btn = (text: string, style?: ActionMenuButton['style']): ActionMenuButton => ({ text, style, onPress: jest.fn() });
const four = () => [btn('a'), btn('b'), btn('c', 'destructive'), btn('Cancel', 'cancel')];
const three = () => [btn('a'), btn('b', 'destructive'), btn('Cancel', 'cancel')];

let alertSpy: jest.SpyInstance;
let unregister: (() => void) | null = null;
const host = jest.fn();

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  host.mockReset();
  unregister = registerActionMenuHost(host);
});
afterEach(() => {
  unregister?.();
  unregister = null;
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

describe('showActionMenu', () => {
  it('iOS: always plain Alert.alert with the same arguments, even for >3 buttons', () => {
    Platform.OS = 'ios';
    const buttons = four();
    showActionMenu('Title', undefined, buttons);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Title', undefined, buttons);
    expect(host).not.toHaveBeenCalled();
  });

  it('Android with ≤3 buttons: plain Alert.alert', () => {
    Platform.OS = 'android';
    const buttons = three();
    showActionMenu('Title', 'msg', buttons);
    expect(alertSpy).toHaveBeenCalledWith('Title', 'msg', buttons);
    expect(host).not.toHaveBeenCalled();
  });

  it('Android with >3 buttons: goes to the host, no Alert', () => {
    Platform.OS = 'android';
    const buttons = four();
    showActionMenu('Title', 'msg', buttons);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(host).toHaveBeenCalledWith({ title: 'Title', message: 'msg', buttons });
  });

  it('Android with >3 buttons and no host mounted: falls back to Alert.alert', () => {
    Platform.OS = 'android';
    unregister?.();
    unregister = null;
    const buttons = four();
    showActionMenu('Title', undefined, buttons);
    expect(alertSpy).toHaveBeenCalledWith('Title', undefined, buttons);
    expect(host).not.toHaveBeenCalled();
  });

  it('a stale unregister does not drop a newer host', () => {
    Platform.OS = 'android';
    const newer = jest.fn();
    const unregisterNewer = registerActionMenuHost(newer);
    unregister?.(); // старий хост відписується пізніше — новий лишається
    unregister = unregisterNewer;
    showActionMenu('Title', undefined, four());
    expect(newer).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('needsListMenu only for Android and >3 buttons', () => {
    expect(needsListMenu(4, 'android')).toBe(true);
    expect(needsListMenu(3, 'android')).toBe(false);
    expect(needsListMenu(8, 'ios')).toBe(false);
    expect(needsListMenu(8, 'web')).toBe(false);
  });

  it('orderMenuButtons moves cancel last, keeps the rest in order', () => {
    const cancel = btn('Cancel', 'cancel');
    const a = btn('a');
    const d = btn('d', 'destructive');
    const b = btn('b');
    expect(orderMenuButtons([cancel, a, d, b])).toEqual([a, d, b, cancel]);
  });
});
