/**
 * __tests__/meeting-reschedule-ui.test.tsx — UX дати зустрічі на мобільному.
 *
 *   • форма: час — слоти по 30 хв (а не набір з клавіатури), тривалість —
 *     чипи 30хв/1год/1,5год/2год + «Своя»;
 *   • «Перенести»: пресети одразу переносять, «Інша дата…» — сітка + слоти;
 *     для повтору аркуш попереджає, що переноситься лише цей екземпляр;
 *   • погодинна сітка з onMeetingDrop — блоки наради перетягувані.
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';

import { RescheduleSheet } from '@/components/calendar/RescheduleSheet';
import { calendarColors } from '@/components/calendar/palette';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { MeetingFormSheet } from '@/components/shared/MeetingFormSheet';
import { allTranslations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const trees: any[] = [];
afterEach(() => { act(() => { while (trees.length) trees.pop().unmount(); }); });

function render(el: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(el); });
  trees.push(tree);
  return tree;
}
const byTestId = (tree: any, id: string) => tree.root.findAll((n: any) => n.props.testID === id && n.props.onPress);
const byLabel = (tree: any, label: string) => tree.root.findAll((n: any) => n.props.accessibilityLabel === label && n.props.onPress);
const texts = (tree: any) => tree.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join(''));

describe('MeetingFormSheet — слоти часу і чипи тривалості', () => {
  it('час обирається слотом, тривалість — чипом', () => {
    const onSave = jest.fn();
    const tree = render(
      <MeetingFormSheet visible onClose={jest.fn()} onSave={onSave} isDark={false} lang="uk" tr={tr} presetDate="2026-11-06" />,
    );
    // Поля набору часу більше немає.
    expect(tree.root.findAllByType(TextInput).some((n: any) => n.props.placeholder === '09:00')).toBe(false);

    act(() => { byTestId(tree, 'meeting-form-time')[0].props.onPress(); });
    act(() => { byLabel(tree, '09:30')[0].props.onPress(); });
    // Пікер згортається після вибору.
    expect(byLabel(tree, '09:30')).toHaveLength(0);

    act(() => { byLabel(tree, 'Тривалість: 1,5год')[0].props.onPress(); });
    const title = tree.root.findAllByType(TextInput).find((n: any) => n.props.placeholder === 'Назва зустрічі');
    act(() => { title.props.onChangeText('Ретро'); });
    const save = tree.root.findAll((n: any) => n.props.onPress && n.props.disabled === false)
      .find((n: any) => texts({ root: n }).includes('Додати'));
    act(() => { save.props.onPress(); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ретро', date: '2026-11-06', time: '09:30', durationMinutes: 90 }));
  });

  it('«Своя» тривалість відкриває поле хвилин; нестандартна тривалість — одразу «Своя»', () => {
    const tree = render(
      <MeetingFormSheet visible onClose={jest.fn()} onSave={jest.fn()} isDark={false} lang="uk" tr={tr}
        initial={{ id: 'm1', title: 'Х', date: '2026-11-06', time: '10:15', durationMinutes: 45, color: '#6366F1' }} />,
    );
    const minutes = () => tree.root.findAllByType(TextInput).filter((n: any) => n.props.keyboardType === 'number-pad');
    expect(minutes()).toHaveLength(1);
    expect(minutes()[0].props.value).toBe('45');
    act(() => { byLabel(tree, 'Тривалість: 1год')[0].props.onPress(); });
    expect(minutes()).toHaveLength(0);
    act(() => { byTestId(tree, 'meeting-form-duration-custom')[0].props.onPress(); });
    expect(minutes()).toHaveLength(1);
    // Час не з сітки (10:15) не губиться — видно в полі.
    expect(texts(tree)).toContain('10:15');
  });
});

describe('RescheduleSheet', () => {
  const c = calendarColors(false);
  const single: Meeting = { id: 's1', title: 'Демо', date: '2026-11-06', time: '23:45', durationMinutes: 60, color: '#0EA5E9' };

  it('пресет одразу переносить', () => {
    const onApply = jest.fn();
    const tree = render(<RescheduleSheet meeting={single} onClose={jest.fn()} onApply={onApply} isDark={false} wide={false} lang="uk" c={c} tr={tr} />);
    act(() => { byTestId(tree, 'reschedule-plus30')[0].props.onPress(); });
    expect(onApply).toHaveBeenCalledWith(single, { date: '2026-11-07', time: '00:15' });
    act(() => { byTestId(tree, 'reschedule-nextWeek')[0].props.onPress(); });
    expect(onApply).toHaveBeenLastCalledWith(single, { date: '2026-11-13', time: '23:45' });
    expect(texts(tree)).not.toContain(tr.mtgRescheduleOnlyThis);
  });

  it('«Інша дата…»: день із сітки + слот → «Перенести»', () => {
    const onApply = jest.fn();
    const inst: Meeting = { ...single, id: 'w1_2026-11-06', _origId: 'w1', _occurrenceDate: '2026-11-06', time: '10:00' };
    const tree = render(<RescheduleSheet meeting={inst} onClose={jest.fn()} onApply={onApply} isDark={false} wide={false} lang="uk" c={c} tr={tr} />);
    expect(texts(tree)).toContain(tr.mtgRescheduleOnlyThis);
    act(() => { byTestId(tree, 'reschedule-other')[0].props.onPress(); });
    const apply = () => tree.root.findAll((n: any) => n.props.testID === 'reschedule-apply' && n.props.onPress)[0];
    expect(apply().props.disabled).toBe(true);
    const day20 = tree.root.findAll((n: any) => n.props.onPress && texts({ root: n }).join('') === '20')[0];
    act(() => { day20.props.onPress(); });
    act(() => { byLabel(tree, '14:30')[0].props.onPress(); });
    act(() => { apply().props.onPress(); });
    expect(onApply).toHaveBeenCalledWith(inst, { date: '2026-11-20', time: '14:30' });
  });
});

describe('TimeGrid — перетягування', () => {
  const c = calendarColors(false);
  const m: Meeting = { id: 'm1', title: 'План', date: '2026-11-06', time: '10:00', durationMinutes: 60, color: '#6366F1' };
  const base = {
    days: ['2026-11-06'], todayKey: '2026-11-06', selectedKey: '2026-11-06', tasksByDay: {}, meetingsByDay: { '2026-11-06': [m] },
    sprintBars: [], onSelectDay: jest.fn(), onMeetingPress: jest.fn(), onTaskPress: jest.fn(), onSlotPress: jest.fn(), c, tr,
  };

  it('з onMeetingDrop блок підказує про перетягування, тап і далі відкриває деталь', () => {
    const tree = render(<TimeGrid {...base} onMeetingDrop={jest.fn()} />);
    const block = tree.root.findAll((n: any) => n.props.accessibilityLabel === '10:00 План' && n.props.onPress)[0];
    expect(block.props.accessibilityHint).toBe(tr.calDragHint);
    act(() => { block.props.onPress(); });
    expect(base.onMeetingPress).toHaveBeenCalledWith(m);
  });

  it('без onMeetingDrop — як раніше, без підказки', () => {
    const tree = render(<TimeGrid {...base} />);
    const block = tree.root.findAll((n: any) => n.props.accessibilityLabel === '10:00 План' && n.props.onPress)[0];
    expect(block.props.accessibilityHint).toBeUndefined();
  });

  it('довге натискання + тягнення вниз на ~40 хв і вправо на день → 10:30 наступного дня', () => {
    const onDrop = jest.fn();
    const week = { ...base, days: ['2026-11-06', '2026-11-07'] };
    const tree = render(<TimeGrid {...week} onMeetingDrop={onDrop} />);
    // Ширина колонки дня приходить з onLayout.
    const col = tree.root.findAll((n: any) => typeof n.props.onLayout === 'function' && n.props.style?.borderLeftWidth !== undefined)[0];
    act(() => { col.props.onLayout({ nativeEvent: { layout: { width: 100, height: 1248, x: 0, y: 0 } } }); });
    act(() => {
      fireGestureHandler(getByGestureTestId('meeting-drag-m1'), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: 90, translationY: 36 },
        { state: State.END, translationX: 90, translationY: 36 },
      ]);
    });
    expect(onDrop).toHaveBeenCalledWith(m, { date: '2026-11-07', time: '10:30' });
  });
});
