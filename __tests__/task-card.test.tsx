/**
 * __tests__/task-card.test.tsx — картка завдання з вкладками і швидке створення.
 *
 * Поля картки — рядки «іконка · підпис · значення ›», що відкривають аркуш
 * вибору й пишуть одразу; некритичні поля живуть у «Деталях», командні — у
 * «Команді», яка зʼявляється лише для командного проєкту.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React, { useEffect } from 'react';
import { Modal, TextInput, TouchableOpacity } from 'react-native';

import { hasTeamContext } from '@/components/projects/TeamTaskPanel';
import { estimateDraft, recurrenceDraft } from '@/components/tasks/card/draftParts';
import { DateField, OptionField, dayToIso, formatMinutes, parseDay } from '@/components/tasks/card/fields';
import { TaskCardDetails, TaskCardMain } from '@/components/tasks/card/TaskCardSections';
import { TaskDetailHeader } from '@/components/tasks/TaskDetailHeader';
import { TaskTimerButton } from '@/components/tasks/TaskTimerButton';
import { TaskQuickCreate } from '@/components/tasks/card/TaskQuickCreate';
import { draftEstimatedMinutes, draftRecurrence, taskToDraft, useTaskEditor } from '@/hooks/use-task-editor';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const C = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED', sheet: '#FFF' };
const TODAY = new Date(2026, 9, 6, 9, 0);

const render = (el: React.ReactElement) => { let tree: any; act(() => { tree = create(el); }); return tree; };
const pressByLabel = (tree: any, prefix: string) => {
  const node = tree.root.findAll((n: any) => n.type === TouchableOpacity
    && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(prefix))[0];
  if (!node) throw new Error(`no button «${prefix}»`);
  act(() => { node.props.onPress(); });
};
const openModals = (tree: any) => tree.root.findAllByType(Modal).filter((m: any) => m.props.visible);

describe('чернетка з поля картки', () => {
  test('оцінка: хвилини ↔ години/хвилини чернетки', () => {
    expect(estimateDraft(90)).toEqual({ estHours: '1', estMins: '30' });
    expect(estimateDraft(45)).toEqual({ estHours: '', estMins: '45' });
    expect(estimateDraft(undefined)).toEqual({ estHours: '', estMins: '' });
    const base = taskToDraft({ title: 'x' }, 'active');
    expect(draftEstimatedMinutes({ ...base, ...estimateDraft(150) })).toBe(150);
  });

  test('повторення: правило ↔ поля чернетки (round-trip)', () => {
    const rule = { freq: 'weekly' as const, interval: 2, daysOfWeek: [0, 2], until: '2026-12-31' };
    const base = taskToDraft({ title: 'x' }, 'active');
    expect(draftRecurrence({ ...base, ...recurrenceDraft(rule) })).toEqual(rule);
    expect(draftRecurrence({ ...base, ...recurrenceDraft(undefined) })).toBeUndefined();
  });

  test('дата дня пишеться опівдні — той самий день у будь-якому поясі', () => {
    const iso = dayToIso(new Date(2026, 9, 6, 0, 0));
    const back = new Date(iso);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2026, 9, 6, 12]);
    expect(parseDay('2026-12-31').getDate()).toBe(31);
  });

  test('формат оцінки', () => {
    expect(formatMinutes(90, { h: 'год', m: 'хв' })).toBe('1 год 30 хв');
    expect(formatMinutes(0, { h: 'год', m: 'хв' })).toBeNull();
  });
});

describe('вкладка «Команда»', () => {
  test('особиста задача — ніколи', () => {
    expect(hasTeamContext({}, 5)).toBe(false);
  });
  test('соло-проєкт — ні; проєкт з учасниками — так', () => {
    expect(hasTeamContext({ projectId: 'p' }, 1)).toBe(false);
    expect(hasTeamContext({ projectId: 'p' }, 2)).toBe(true);
  });
  test('командні дані не ховаються, навіть якщо учасників не лишилось', () => {
    expect(hasTeamContext({ projectId: 'p', reviewRequired: true }, 1)).toBe(true);
    expect(hasTeamContext({ projectId: 'p', blocked: true }, 0)).toBe(true);
  });
});

describe('рядки властивостей', () => {
  test('вибір зі списку пише одразу і закриває аркуш', () => {
    const onChange = jest.fn();
    const tree = render(
      <OptionField icon="folder" label="Проєкт" options={[{ id: 'a', label: 'Сайт' }, { id: 'b', label: 'Ремонт' }]}
        value={null} onChange={onChange} emptyOption={{ label: 'Без проєкту' }} colors={C} isDark={false} />,
    );
    expect(openModals(tree)).toHaveLength(0);
    pressByLabel(tree, 'Проєкт:');
    expect(openModals(tree)).toHaveLength(1);
    pressByLabel(tree, 'Ремонт');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(openModals(tree)).toHaveLength(0);
  });

  test('недоступне поле (глядач) не відкривається', () => {
    const tree = render(
      <OptionField icon="folder" label="Проєкт" options={[]} value={null} onChange={() => {}} disabled colors={C} isDark={false} />,
    );
    expect(tree.root.findAll((n: any) => n.type === TouchableOpacity && String(n.props.accessibilityLabel).startsWith('Проєкт:'))).toHaveLength(0);
  });

  test('дедлайн: пресет «Завтра» дає завтрашній день', () => {
    const onChange = jest.fn();
    const tree = render(
      <DateField label="Дедлайн" value={null} onChange={onChange} today={TODAY} colors={C} isDark={false} locale="uk-UA" />,
    );
    pressByLabel(tree, 'Дедлайн:');
    const presets = tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityState && 'selected' in n.props.accessibilityState);
    act(() => { presets[1].props.onPress(); });
    const picked = new Date(onChange.mock.calls[0][0]);
    expect(picked.getDate()).toBe(7);
  });
});

describe('Основне', () => {
  test('статус, пріоритет, дедлайн і проєкт — рядки; опису тут більше немає', () => {
    const tree = render(
      <TaskCardMain
        status={{ options: [{ id: 's1', label: 'До роботи' }], value: 's1', onChange: () => {} }}
        priority={3}
        onPriority={() => {}}
        deadline={undefined}
        overdue={false}
        onDeadline={() => {}}
        project={{ options: [], value: null, selectedLabel: null, onChange: () => {} }}
        canExecute
        canPlan
        subtasksSlot={null}
        today={TODAY}
        colors={C}
        isDark={false}
        locale="uk-UA"
      />,
    );
    const rows = tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityRole === 'button'
      && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes(':'));
    expect(rows.length).toBe(4);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});

describe('Деталі', () => {
  const details = (onDescription: (text: string) => void, canPlan = true) => (
    <TaskCardDetails
      description="Старий"
      onDescription={onDescription}
      estimate={undefined}
      onEstimate={() => {}}
      startDate={undefined}
      onStartDate={() => {}}
      recurrence={undefined}
      onRecurrence={() => {}}
      reminderAt={undefined}
      onSetReminder={() => {}}
      onRemoveReminder={() => {}}
      createdAt="2026-10-01T09:00:00.000Z"
      hasDeadline={false}
      canExecute
      canPlan={canPlan}
      today={TODAY}
      colors={C}
      isDark={false}
      locale="uk-UA"
    />
  );

  test('опис живе тут і пишеться при втраті фокуса', () => {
    const onDescription = jest.fn();
    const tree = render(details(onDescription));
    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('Старий');
    act(() => { input.props.onFocus(); input.props.onChangeText('Новий опис'); });
    act(() => { input.props.onBlur(); });
    expect(onDescription).toHaveBeenCalledWith('Новий опис');
  });

  test('без права планувати опис лише читається', () => {
    const tree = render(details(() => {}, false));
    expect(tree.root.findAllByType(TextInput).every((n: any) => n.props.editable === false)).toBe(true);
  });
});

describe('таймер у шапці картки', () => {
  const header = (tab: 'main' | 'details' | 'activity', timerSlot: React.ReactNode) => (
    <TaskDetailHeader
      title="Задача"
      tab={tab}
      onTabChange={() => {}}
      timerRunning={false}
      onClose={() => {}}
      timerSlot={timerSlot}
      showHandle={false}
      colors={C}
      tr={allTranslations.uk}
    />
  );

  test('кнопка старту — під назвою, перед вкладками, на будь-якій вкладці', () => {
    for (const tab of ['main', 'details', 'activity'] as const) {
      const onStart = jest.fn();
      const tree = render(header(tab,
        <TaskTimerButton task={{}} running={false} onStart={onStart} onStop={() => {}} tr={allTranslations.uk} />));
      const all = tree.root.findAll((n: any) => n.type === TouchableOpacity && typeof n.props.accessibilityRole === 'string');
      const startIdx = all.findIndex((n: any) => n.props.accessibilityLabel === allTranslations.uk.startTimerAction);
      const firstTab = all.findIndex((n: any) => n.props.accessibilityRole === 'tab');
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(startIdx).toBeLessThan(firstTab);
      act(() => { all[startIdx].props.onPress(); });
      expect(onStart).toHaveBeenCalledTimes(1);
    }
  });

  test('таймер іде — кнопка зупиняє', () => {
    const onStop = jest.fn();
    const tree = render(header('details',
      <TaskTimerButton task={{}} running activeStartedAt={new Date().toISOString()} onStart={() => {}} onStop={onStop} tr={allTranslations.uk} />));
    pressByLabel(tree, allTranslations.uk.stopTimer);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('швидке створення', () => {
  let editorRef: ReturnType<typeof useTaskEditor> | null = null;
  function Harness({ onSave, onMore }: { onSave: () => void; onMore: () => void }) {
    const editor = useTaskEditor('active', TODAY);
    editorRef = editor;
    useEffect(() => { editor.reset('active'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <TaskQuickCreate editor={editor} pickableProjects={[{ id: 'p1', name: 'Сайт', color: '#f00' }]}
        projects={[{ id: 'p1', name: 'Сайт', color: '#f00' }]} today={TODAY}
        onSave={onSave} onMore={onMore} colors={C} isDark={false} locale="uk-UA" />
    );
  }

  test('без назви не створює і нічого не відкриває', () => {
    const onSave = jest.fn(), onMore = jest.fn();
    const tree = render(<Harness onSave={onSave} onMore={onMore} />);
    const buttons = tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityRole === 'button' && !n.props.accessibilityLabel);
    act(() => { buttons.forEach((b: any) => b.props.onPress()); });
    expect(onSave).not.toHaveBeenCalled();
    expect(onMore).not.toHaveBeenCalled();
  });

  test('назва й проєкт — у чернетці; «Детальніше» викликає onMore', () => {
    const onSave = jest.fn(), onMore = jest.fn();
    const tree = render(<Harness onSave={onSave} onMore={onMore} />);
    act(() => { tree.root.findAllByType(TextInput)[0].props.onChangeText('Купити фарбу'); });
    act(() => { editorRef!.patch({ projectId: 'p1' }); });
    expect(editorRef!.draft.title).toBe('Купити фарбу');
    // Дві кнопки без власного підпису: «Детальніше», потім «Додати».
    const [more] = tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityRole === 'button' && !n.props.accessibilityLabel);
    act(() => { more.props.onPress(); });
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
