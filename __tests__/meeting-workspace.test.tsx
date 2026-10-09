import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import { create, act } from 'react-test-renderer';
import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { changeAgenda, meetingAgendaHtml, meetingText } from '@/utils/meetingWorkspace';

let mockRole = 'owner';
let mockMeetings: any[] = [];
let mockNotes: any[] = [];
jest.mock('@/hooks/use-project-role', () => ({ useProjectRole: () => mockRole }));
jest.mock('@/hooks/use-synced-list', () => ({ useSyncedList: () => ({ items: mockNotes }) }));
jest.mock('@/store/i18n', () => ({ useI18n: () => ({ lang: 'uk' }) }));
jest.mock('@/store/synced-storage', () => ({ updateSynced: jest.fn(async (key, mutate) => {
  if (key === 'meetings') return mockMeetings = mutate(mockMeetings);
  return mockNotes = mutate(mockNotes);
}) }));
const meeting = { id: 'm1', title: 'Планування', date: '2026-10-09', time: '10:00', durationMinutes: 30, color: '#6554c0', projectId: 'p1' };
const colors = { text: '#111', sub: '#555', border: '#ddd', dim: '#eee' };
let tree: ReturnType<typeof create>;
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find(item => item.props.accessibilityLabel === label)!;
beforeEach(() => { mockRole = 'owner'; mockMeetings = [{ ...meeting, agenda: [{ id: 'remote', text: 'Інша тема', done: false }] }]; mockNotes = []; });
afterEach(() => { act(() => tree?.unmount()); });

test('adds to the latest meeting without removing another device agenda or timer', async () => {
  mockMeetings[0].timeEntries = [{ id: 'timer' }];
  await act(async () => { tree = create(<MeetingWorkspace meeting={meeting} date={meeting.date} colors={colors} />); });
  act(() => tree.root.findAllByType(TextInput)[0].props.onChangeText('Бюджет'));
  await act(async () => button('Додати пункт').props.onPress());
  expect(mockMeetings[0].agenda.map((item: any) => item.text)).toEqual(['Інша тема', 'Бюджет']);
  expect(mockMeetings[0].timeEntries).toEqual([{ id: 'timer' }]);
});
test('viewer can copy/export but cannot create notes or agenda items', async () => {
  mockRole = 'viewer';
  await act(async () => { tree = create(<MeetingWorkspace meeting={meeting} date={meeting.date} colors={colors} />); });
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(button('PDF')).toBeTruthy();
  expect(button('Копіювати')).toBeTruthy();
  expect(button('Копіювати інформацію')).toBeUndefined();
  expect(button('Додати пункт')).toBeUndefined();
});
test('notes stay in the meeting project and attaching does not expose personal notes', async () => {
  mockNotes = [{ id: 'personal', title: 'Приватна нотатка', body: 'Secret' }, { id: 'shared', title: 'Спільна нотатка', body: 'Team', projectId: 'p1' }];
  await act(async () => { tree = create(<MeetingWorkspace meeting={meeting} date={meeting.date} colors={colors} />); });
  act(() => button('Прикріпити наявну нотатку').props.onPress());
  expect(button('Приватна нотатка')).toBeUndefined();
  await act(async () => button('Спільна нотатка').props.onPress());
  expect(mockNotes[1].linkedMeetingId).toBe('m1');
});
test('exports escape HTML and use occurrence date; change operations are idempotent', () => {
  const item = { id: 'a', text: '<script>test</script>', done: false };
  expect(changeAgenda([item], { kind: 'add', item })).toEqual([item]);
  expect(meetingAgendaHtml({ ...meeting, agenda: [item] })).not.toContain('<script>');
  expect(meetingText({ ...meeting, date: '2026-10-16' }, true)).toContain('2026-10-16');
});
