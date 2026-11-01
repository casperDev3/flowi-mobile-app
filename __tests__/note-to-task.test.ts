/**
 * __tests__/note-to-task.test.ts — «Нотатка → задача».
 *
 * Одна реалізація перетворення лишилась після злиття гілок: доменні правила
 * notes-rework (utils/notes.ts `noteToTaskDraft`, components/notes/noteActions.ts
 * `createTaskFromNote` / `linkedHref`) за точками входу основної лінії. Тут —
 * ті самі сценарії, що перевіряв попередній utils/noteToTask.ts (назва,
 * легасі-текст, стеля назви, автор проєктної задачі, маршрут «Відкрити
 * задачу»), тепер проти спільних правил. Повний паритет із вебом — у
 * notes-parity.test.ts.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { linkedHref } from '@/components/notes/noteActions';
import { noteToTaskDraft, type Note } from '@/utils/notes';

const NOW = '2026-10-01T10:00:00.000Z';
const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1', title: 'Купити фарбу', body: 'Біла матова\n- [ ] 2 банки', createdAt: NOW, updatedAt: NOW, ...over,
});

describe('noteToTaskDraft', () => {
  test('назва — назва нотатки, опис — текст без чек-листа, пункти — підзадачі, проєкт — проєкт нотатки', () => {
    const draft = noteToTaskDraft(note({ projectId: 'p1' }), { id: 't', now: NOW });
    expect(draft).toMatchObject({
      id: 't', title: 'Купити фарбу', description: 'Біла матова', status: 'active', projectId: 'p1',
      createdAt: NOW, updatedAt: NOW,
    });
    expect(draft.subtasks).toEqual([{ id: 't-s1', title: '2 банки', done: false }]);
  });

  test('без назви — перший текстовий рядок без розмітки, і він не дублюється в описі', () => {
    const draft = noteToTaskDraft(note({ title: '  ', body: '\n\n## **Зателефонувати** майстру\nдалі' }), { id: 't', now: NOW });
    expect(draft.title).toBe('Зателефонувати майстру');
    expect(draft.description).toBe('далі');
  });

  test('легасі-текст старого вебу читається', () => {
    const legacy = { id: 'l', title: '', text: 'Старий запис', createdAt: NOW, updatedAt: NOW } as unknown as Note;
    expect(noteToTaskDraft(legacy, { id: 't', now: NOW }).title).toBe('Старий запис');
  });

  test('назва обрізається до стелі (200)', () => {
    expect(noteToTaskDraft(note({ title: 'я'.repeat(300) }), { id: 't', now: NOW }).title).toHaveLength(200);
  });

  test('особиста задача — без проєкту й без автора', () => {
    const draft = noteToTaskDraft(note(), { id: 't', now: NOW, projectId: null, createdBy: 'u1' });
    expect(draft.projectId).toBeUndefined();
    expect(draft.createdBy).toBeUndefined();
  });

  test('проєктна задача отримує автора (§3.3)', () => {
    expect(noteToTaskDraft(note(), { id: 't', now: NOW, projectId: 'p1', createdBy: '42' })).toMatchObject({
      projectId: 'p1', createdBy: '42',
    });
  });
});

describe('linkedHref («Відкрити задачу / зустріч»)', () => {
  test('особиста — вкладка «Завдання», проєктна — завдання її проєкту', () => {
    expect(linkedHref('task', 't 1')).toBe('/(tabs)?open=t%201');
    expect(linkedHref('task', 't1', 'p1')).toBe('/project/p1/tasks?open=t1');
  });

  test('зустріч — «Наради» або календар проєкту', () => {
    expect(linkedHref('meeting', 'm1')).toBe('/meetings?open=m1');
    expect(linkedHref('meeting', 'm1', 'p1')).toBe('/project/p1/calendar?open=m1');
  });
});
