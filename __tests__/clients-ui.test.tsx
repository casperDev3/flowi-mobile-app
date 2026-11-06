/**
 * __tests__/clients-ui.test.tsx — клієнт у формах.
 *
 *   • форма зустрічі: без проєкту клієнт обирається й зберігається;
 *     з проєктом — клієнт іде з проєкту (чипи без вибору), а clientId форма
 *     не повертає (потік проєкту його не зберігає);
 *   • форма клієнта: блоки контактів і реквізитів, збереження чернетки.
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('@/components/shared/SheetModal', () => jest.requireActual('./fixtures/sheet-modal-mock'));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';

import { ClientFormSheet } from '@/components/clients/ClientFormSheet';
import { MeetingFormSheet } from '@/components/shared/MeetingFormSheet';
import { allTranslations } from '@/store/translations';
import { normalizeClient, type Client } from '@/utils/clients';

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
const pressable = (tree: any, testID: string) => tree.root.findAll((n: any) => n.props.testID === testID && n.props.onPress);
const texts = (tree: any) => tree.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join(''));

const clients: Client[] = [
  normalizeClient({ id: 'cl-1', name: 'Acme', color: '#10B981' })!,
  normalizeClient({ id: 'cl-2', name: 'Globex', color: '#EF4444' })!,
];
const projects = [{ id: 'p1', name: 'Сайт', color: '#7C3AED', clientId: 'cl-2' }];

function saveMeeting(tree: any) {
  const title = tree.root.findAllByType(TextInput).find((n: any) => n.props.placeholder === 'Назва зустрічі');
  act(() => { title.props.onChangeText('Дзвінок'); });
  const save = tree.root.findAll((n: any) => n.props.onPress && n.props.disabled === false)
    .find((n: any) => texts({ root: n }).includes('Додати'));
  act(() => { save.props.onPress(); });
}

describe('MeetingFormSheet — клієнт', () => {
  it('без проєкту клієнт обирається й повертається', () => {
    const onSave = jest.fn();
    const tree = render(
      <MeetingFormSheet visible onClose={jest.fn()} onSave={onSave} isDark={false} lang="uk" tr={tr}
        presetDate="2026-11-06" projects={projects} clients={clients} />,
    );
    act(() => { pressable(tree, 'meeting-form-client-cl-1')[0].props.onPress(); });
    saveMeeting(tree);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cl-1' }));
    expect(onSave.mock.calls[0][0].projectId).toBeUndefined();
  });

  it('з проєктом — клієнт проєкту без вибору, clientId не повертається', () => {
    const onSave = jest.fn();
    const tree = render(
      <MeetingFormSheet visible onClose={jest.fn()} onSave={onSave} isDark={false} lang="uk" tr={tr}
        presetDate="2026-11-06" projects={projects} clients={clients} presetProjectId="p1" />,
    );
    const chip = tree.root.findAll((n: any) => n.props.testID === 'meeting-form-client-cl-2' && n.props.onPress)[0];
    expect(chip.props.disabled).toBe(true);
    expect(chip.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(texts(tree)).toContain(tr.clientsUi.fromProject);
    expect(pressable(tree, 'meeting-form-client-cl-1')).toHaveLength(0);
    saveMeeting(tree);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ projectId: 'p1', clientId: undefined }));
  });

  it('без списку клієнтів поля немає', () => {
    const tree = render(
      <MeetingFormSheet visible onClose={jest.fn()} onSave={jest.fn()} isDark={false} lang="uk" tr={tr} presetDate="2026-11-06" />,
    );
    expect(tree.root.findAll((n: any) => n.props.testID === 'meeting-form-client')).toHaveLength(0);
  });
});

describe('ClientFormSheet', () => {
  it('без назви не зберігає; з назвою, контактом і реквізитами — віддає чернетку', () => {
    const onSave = jest.fn();
    const tree = render(<ClientFormSheet visible client={null} isDark={false} onClose={jest.fn()} onSave={onSave} />);
    act(() => { pressable(tree, 'client-form-save')[0].props.onPress(); });
    expect(onSave).not.toHaveBeenCalled();
    expect(texts(tree)).toContain(tr.clientsUi.nameRequired);

    const input = (label: string) => tree.root.findAllByType(TextInput).find((n: any) => n.props.accessibilityLabel === label);
    act(() => { input(tr.clientsUi.name).props.onChangeText('ТОВ Ромашка'); });
    act(() => { pressable(tree, 'client-form-add-contact')[0].props.onPress(); });
    act(() => { input(tr.clientsUi.contactName).props.onChangeText('Іван'); });
    act(() => { input(tr.clientsUi.phone).props.onChangeText('+380671234567'); });
    act(() => { input(tr.clientsUi.edrpou).props.onChangeText('12345678'); });
    act(() => { pressable(tree, 'client-form-save')[0].props.onPress(); });

    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0][0];
    expect(draft.name).toBe('ТОВ Ромашка');
    expect(draft.contacts).toEqual([{ name: 'Іван', phone: '+380671234567' }]);
    expect(draft.requisites).toEqual({ edrpou: '12345678' });
    expect(draft.status).toBe('active');
  });

  it('редагування підставляє наявного клієнта', () => {
    const existing = normalizeClient({ id: 'cl-9', name: 'Initech', status: 'potential', tags: ['b2b'] })!;
    const onSave = jest.fn();
    const tree = render(<ClientFormSheet visible client={existing} isDark={false} onClose={jest.fn()} onSave={onSave} onDelete={jest.fn()} />);
    expect(texts(tree)).toContain(tr.clientsUi.editClient);
    expect(texts(tree)).toContain(tr.clientsUi.delete);
    act(() => { pressable(tree, 'client-form-save')[0].props.onPress(); });
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Initech', status: 'potential', tags: 'b2b' }));
  });
});
