/**
 * __tests__/detail-headers.test.tsx — липка шапка деталі й перегляд зустрічі.
 *
 * Шапка мусить стояти ПОЗА ScrollView (інакше вона гортається разом із
 * тілом — рівно те, що виправляли), і однаково в модалці (телефон) та в
 * колонці (планшет). Перегляд зустрічі на екрані Завдань — без записів.
 */
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';

import { MeetingDetailBody, MeetingDetailHeader, meetingDayLabel } from '@/components/meetings/MeetingDetail';
import { DetailPane } from '@/components/shared/DetailPane';
import { TaskDetailHeader } from '@/components/tasks/TaskDetailHeader';
import { allTranslations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const COLORS = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED' };

function renderPane(wide: boolean) {
  let tree: any;
  act(() => {
    tree = create(
      <DetailPane
        open
        wide={wide}
        onClose={() => {}}
        isDark={false}
        sheetColor="#fff"
        borderColor="#ddd"
        maxHeight={600}
        scrollRef={React.createRef()}
        header={<Text testID="hdr">Шапка</Text>}>
        <Text testID="body">Тіло</Text>
      </DetailPane>,
    );
  });
  return tree;
}

describe('DetailPane header', () => {
  test.each([['модалка', false], ['колонка', true]])('%s: шапка поза прокруткою, тіло всередині', (_n, wide) => {
    const tree = renderPane(wide as boolean);
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.findAll((n: any) => n.props.testID === 'hdr')).toHaveLength(0);
    expect(scroll.findAll((n: any) => n.props.testID === 'body').length).toBeGreaterThan(0);
    expect(tree.root.findAll((n: any) => n.props.testID === 'hdr').length).toBeGreaterThan(0);
  });

  test('без header — як раніше: лише тіло', () => {
    let tree: any;
    act(() => {
      tree = create(
        <DetailPane open wide onClose={() => {}} isDark={false} sheetColor="#fff" borderColor="#ddd" maxHeight={600} scrollRef={React.createRef()}>
          <Text testID="body">Тіло</Text>
        </DetailPane>,
      );
    });
    expect(tree.root.findByType(ScrollView).findAll((n: any) => n.props.testID === 'body').length).toBeGreaterThan(0);
  });
});

describe('TaskDetailHeader', () => {
  const base = {
    title: 'Задача', tab: 'main' as const, onTabChange: jest.fn(), timerRunning: false,
    onClose: jest.fn(), showHandle: false, colors: COLORS, tr,
  };
  const texts = (tree: any) => tree.root.findAllByType(Text).map((n: any) => n.props.children).flat();
  // Лише самі TouchableOpacity: їхні хост-вузли несуть ті самі пропси.
  const tabs = (tree: any) => tree.root
    .findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityRole === 'tab');

  test('особиста задача: назва, ✕ і три вкладки (без «Команди»)', () => {
    let tree: any;
    act(() => { tree = create(<TaskDetailHeader {...base} />); });
    expect(texts(tree)).toContain('Задача');
    expect(tabs(tree)).toHaveLength(3);
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === tr.close && n.props.onPress).length).toBeGreaterThan(0);
  });

  test('задача командного проєкту: чотири вкладки', () => {
    let tree: any;
    act(() => { tree = create(<TaskDetailHeader {...base} showTeam />); });
    expect(tabs(tree)).toHaveLength(4);
  });

  test('перейменування на місці: тап по назві → поле, зміна пишеться один раз', () => {
    const onRename = jest.fn();
    let tree: any;
    act(() => { tree = create(<TaskDetailHeader {...base} onRename={onRename} />); });
    const title = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Задача' && typeof n.props.onPress === 'function')[0];
    act(() => { title.props.onPress(); });
    const input = tree.root.findByType(TextInput);
    act(() => { input.props.onChangeText('Нова назва'); });
    act(() => { tree.root.findByType(TextInput).props.onSubmitEditing(); });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Нова назва');
  });

  test('без onRename (глядач) назва не натискається', () => {
    let tree: any;
    act(() => { tree = create(<TaskDetailHeader {...base} />); });
    expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Задача' && typeof n.props.onPress === 'function')).toHaveLength(0);
  });
});

describe('MeetingDetail', () => {
  const orig: Meeting = {
    id: 'm1', title: 'Планування', date: '2026-09-01', time: '10:00', durationMinutes: 30, color: '#6366F1',
    link: 'meet.example.com/x', recordings: ['file:///a.m4a'],
    recurrence: { freq: 'weekly', interval: 1 },
  };
  const inst: Meeting = { ...orig, id: 'm1_2026-09-08', date: '2026-09-08', _origId: 'm1' };

  test('шапка: назва, ✎ і ✕ викликають колбеки', () => {
    const onEdit = jest.fn();
    const onClose = jest.fn();
    let tree: any;
    act(() => {
      tree = create(<MeetingDetailHeader meeting={inst} original={orig} onEdit={onEdit} onClose={onClose} isExpanded colors={COLORS} tr={tr} />);
    });
    act(() => { tree.root.findAll((n: any) => n.props.accessibilityLabel === tr.edit && n.props.onPress)[0].props.onPress(); });
    act(() => { tree.root.findAll((n: any) => n.props.accessibilityLabel === tr.close && n.props.onPress)[0].props.onPress(); });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('тіло без колбеків запису (екран Завдань) — ні записів, ні «Записати»', () => {
    let tree: any;
    act(() => {
      tree = create(<MeetingDetailBody meeting={inst} original={orig} onToggleTimer={() => {}} onEdit={() => {}} colors={COLORS} tr={tr} locale="uk-UA" />);
    });
    const all = JSON.stringify(tree.toJSON());
    expect(all).not.toContain(tr.meetingRecord);
    expect(all).toContain(tr.meetingNotTracked);
    expect(all).toContain(tr.edit);
  });

  test('тіло з колбеками запису (екран Зустрічей) — записи й «Записати»', () => {
    let tree: any;
    act(() => {
      tree = create(
        <MeetingDetailBody meeting={inst} original={orig} onToggleTimer={() => {}} onEdit={() => {}}
          onRecord={() => {}} onPlayRecording={() => {}} onDeleteRecording={() => {}}
          colors={COLORS} tr={tr} locale="uk-UA" />,
      );
    });
    const all = JSON.stringify(tree.toJSON());
    expect(all).toContain(tr.meetingRecord);
    expect(all).toContain(tr.meetingRecordingItem.replace('{n}', '1'));
  });

  test('meetingDayLabel: сьогодні / завтра / N дн тому', () => {
    const now = new Date(2026, 8, 13, 12, 0, 0);
    expect(meetingDayLabel('2026-09-13', now, tr, 'uk-UA')).toBe(tr.today);
    expect(meetingDayLabel('2026-09-14', now, tr, 'uk-UA')).toBe(tr.tomorrow);
    expect(meetingDayLabel('2026-09-10', now, tr, 'uk-UA')).toBe(tr.meetingDaysAgo.replace('{n}', '3'));
    expect(meetingDayLabel('bad', now, tr, 'uk-UA')).toBe('bad');
  });
});
